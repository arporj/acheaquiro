-- Vencimento das assinaturas e avisos por e-mail (plano 2B; decisões Q1 a Q3
-- de 27/10/2026), com o pg_cron do Supabase, como na Especificação Técnica
-- (seção 11):
-- - todo dia às 06:00 (Brasília), quem passou da tolerância (7 dias, nas
--   configurações) sem pagar: o autônomo sai do ar, o comércio vai para o
--   Gratuito e o Fundador perde a condição de vez; o anunciante recebe um aviso;
-- - todo dia às 08:00, os lembretes de 7 dias antes e do dia do vencimento
--   entram na fila;
-- - a cada 15 minutos, a função enviar-avisos (supabase/functions) manda a
--   fila pelo Brevo, até 280 por dia (os outros 20 dos 300 do plano gratuito
--   ficam para os e-mails do login), com prioridade para os lembretes.
-- Decisão Q1: as regras de vencimento ficam aqui em SQL, repetindo as de
-- packages/domain/cobranca.ts (situacaoCobranca, efeitoDoVencimento e
-- perdeCondicaoFundador). Mudou uma, muda a outra.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Fila de avisos por e-mail
-- ---------------------------------------------------------------------------

create table public.avisos_email (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  anunciante_id uuid not null references public.anunciantes (id) on delete cascade,
  tipo text not null check (tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'plano_vencido')),
  -- Vencimento a que o aviso se refere: o mesmo aviso nunca sai duas vezes para o mesmo vencimento.
  referencia date not null,
  para text not null check (length(para) <= 254),
  -- Nome do anunciante, plano e datas, para montar o texto na hora do envio.
  dados jsonb not null default '{}',
  -- Menor sai primeiro: lembretes antes dos outros avisos.
  prioridade smallint not null default 1,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'enviado', 'falhou')),
  tentativas smallint not null default 0,
  erro text check (length(erro) <= 300),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  unique (anunciante_id, tipo, referencia)
);
create index avisos_email_pendentes_idx on public.avisos_email (prioridade, criado_em) where situacao = 'pendente';
create index avisos_email_enviados_idx on public.avisos_email (enviado_em) where situacao = 'enviado';

-- Sem registro de alterações: o e-mail do anunciante não deve ir para a auditoria.

-- O e-mail do anunciante fica aqui: só a administração lê; a função de envio usa a chave de serviço.
alter table public.avisos_email enable row level security;
create policy "visitante sem acesso" on public.avisos_email as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso" on public.avisos_email for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
create policy "representante sem acesso" on public.avisos_email for select to authenticated
  using (false and (select interno.tem_papel('representante')));
create policy "administrador lê" on public.avisos_email for select to authenticated using ((select interno.eh_admin()));

-- ---------------------------------------------------------------------------
-- Regras de vencimento (as mesmas de packages/domain/cobranca.ts)
-- ---------------------------------------------------------------------------

/** Hoje em Rio das Ostras. */
create function interno.hoje() returns date
language sql stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

/** Dias de tolerância depois do vencimento (configurações gerais). */
create function interno.tolerancia_vencimento(p_cidade uuid) returns integer
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select (c.valor #>> '{}')::integer from public.configuracoes c
                   where c.cidade_id = p_cidade and c.chave = 'tolerancia_vencimento_dias'), 7)
$$;

/** Dados do aviso: nome, plano, periodicidade e vencimento, para o texto do e-mail. */
create function interno.dados_do_aviso(p_anunciante uuid) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nome', a.nome,
    'tipo', a.tipo,
    'plano', p.nome,
    'periodicidade', s.periodicidade,
    'venceEm', s.vence_em,
    'fundador', a.fundador,
    'slug', a.slug
  )
  from public.anunciantes a
  join public.assinaturas s on s.anunciante_id = a.id
  join public.planos p on p.id = s.plano_id
  where a.id = p_anunciante
$$;

/**
 * Plano vencido e não pago na tolerância (situacaoCobranca = 'vencida'): o
 * autônomo sai do ar (efeitoDoVencimento), o comércio vai para o Gratuito e o
 * Fundador perde a condição de vez (perdeCondicaoFundador). Rodar de novo no
 * mesmo dia não muda nada. Devolve quantos anunciantes mudaram.
 */
create function interno.aplicar_vencimentos() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  hoje date := interno.hoje();
  r record;
  gratuito uuid;
  mudou integer := 0;
  email text;
begin
  for r in
    select a.id, a.tipo, a.status, a.plano_id, a.fundador, a.cidade_id, a.usuario_id, s.vence_em
    from public.assinaturas s
    join public.anunciantes a on a.id = s.anunciante_id
    where hoje > s.vence_em + interno.tolerancia_vencimento(s.cidade_id)
      and a.status in ('publicado', 'pausado', 'escondido_por_vencimento')
    for update of a
  loop
    gratuito := null;
    if r.tipo = 'comercio' then
      select p.id into gratuito from public.planos p
      where p.cidade_id = r.cidade_id and p.tipo = 'comercio' and p.ativo and p.valor_mensal_centavos = 0
      order by p.nivel limit 1;
    end if;
    -- Já aplicado: autônomo escondido (ou comércio no Gratuito) e sem Fundador.
    continue when not r.fundador
      and ((r.tipo = 'profissional' and r.status = 'escondido_por_vencimento') or (r.tipo = 'comercio' and r.plano_id is not distinct from gratuito));

    update public.anunciantes
    set status = case when r.tipo = 'profissional' then 'escondido_por_vencimento' else status end,
        plano_id = case when r.tipo = 'comercio' and gratuito is not null then gratuito else plano_id end,
        fundador = false,
        fundador_desde = null
    where id = r.id;
    mudou := mudou + 1;

    select u.email into email from auth.users u where u.id = r.usuario_id;
    if email is not null then
      insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
      values (r.cidade_id, r.id, 'plano_vencido', r.vence_em, email,
              interno.dados_do_aviso(r.id) || jsonb_build_object('eraFundador', r.fundador), 2)
      on conflict (anunciante_id, tipo, referencia) do nothing;
    end if;
  end loop;
  return mudou;
end
$$;

/** Lembretes de 7 dias antes e do dia do vencimento (item 4.15). Devolve quantos entraram na fila. */
create function interno.enfileirar_lembretes() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  hoje date := interno.hoje();
  quantos integer;
begin
  insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
  select a.cidade_id, a.id,
         case when s.vence_em = hoje then 'lembrete_vencimento' else 'lembrete_7_dias' end,
         s.vence_em, u.email, interno.dados_do_aviso(a.id), 1
  from public.assinaturas s
  join public.anunciantes a on a.id = s.anunciante_id
  join auth.users u on u.id = a.usuario_id
  where s.vence_em in (hoje, hoje + 7)
    and a.status in ('publicado', 'pausado')
    and u.email is not null
  on conflict (anunciante_id, tipo, referencia) do nothing;
  get diagnostics quantos = row_count;
  return quantos;
end
$$;

/** Chama a função de envio da fila (enviar-avisos); ela confere o teto do dia. */
create function interno.chamar_envio_de_avisos() returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.avisos_email where situacao = 'pendente') then
    return;
  end if;
  perform net.http_post(
    url := 'https://tvlcrvsoedkfafxofhht.supabase.co/functions/v1/enviar-avisos',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;

/** Avisos enviados há mais de 90 dias saem da fila (LGPD: o e-mail não fica guardado sem necessidade). */
create function interno.limpar_avisos() returns void
language sql security definer
set search_path = ''
as $$
  delete from public.avisos_email where situacao in ('enviado', 'falhou') and criado_em < now() - interval '90 days'
$$;

revoke execute on function interno.aplicar_vencimentos() from public, anon, authenticated;
revoke execute on function interno.enfileirar_lembretes() from public, anon, authenticated;
revoke execute on function interno.chamar_envio_de_avisos() from public, anon, authenticated;
revoke execute on function interno.limpar_avisos() from public, anon, authenticated;
revoke execute on function interno.dados_do_aviso(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agenda (horários em UTC: Brasília é UTC-3, sem horário de verão)
-- ---------------------------------------------------------------------------

select cron.schedule('vencimento-das-assinaturas', '0 9 * * *', 'select interno.aplicar_vencimentos()');
select cron.schedule('lembretes-de-vencimento', '0 11 * * *', 'select interno.enfileirar_lembretes()');
select cron.schedule('envio-de-avisos', '*/15 * * * *', 'select interno.chamar_envio_de_avisos()');
select cron.schedule('limpeza-de-avisos', '30 6 * * *', 'select interno.limpar_avisos()');
