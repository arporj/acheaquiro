-- Catálogo e valores (item 4 do plano; decisões R1 e R2 de 27/10/2026 e Termos
-- de Uso v1, item 7.1):
-- - histórico dos preços dos planos e dos extras, gravado pelo banco a cada
--   mudança do valor por mês ou dos meses cobrados no anual. Na renovação, o
--   aumento só vale se foi avisado pelo menos 30 dias antes (precoDaRenovacao,
--   em packages/domain);
-- - aviso de novo preço por e-mail, com o valor de cada assinante (calculado
--   no servidor por avisoDePreco), na frente dos outros avisos da fila;
-- - o plano Gratuito continua gratuito e o pago continua pago: o banco acha o
--   Gratuito pelo valor zero (vencimento, devolução, cadastro do comércio).

create table public.historico_precos (
  id bigint generated always as identity primary key,
  cidade_id uuid not null references public.cidades (id),
  plano_id uuid references public.planos (id) on delete cascade,
  extra_id uuid references public.extras (id) on delete cascade,
  valor_mensal_centavos integer not null check (valor_mensal_centavos >= 0),
  meses_cobrados_no_anual smallint not null check (meses_cobrados_no_anual between 1 and 12),
  vigente_desde date not null,
  alterado_em timestamptz not null default now(),
  alterado_por uuid references auth.users (id),
  check ((plano_id is null) <> (extra_id is null))
);
create index historico_precos_plano_idx on public.historico_precos (plano_id, alterado_em);
create index historico_precos_extra_idx on public.historico_precos (extra_id, alterado_em);

-- Os preços de hoje, como os primeiros do histórico.
insert into public.historico_precos (cidade_id, plano_id, valor_mensal_centavos, meses_cobrados_no_anual, vigente_desde)
select cidade_id, id, valor_mensal_centavos, meses_cobrados_no_anual, date '2026-10-01' from public.planos;
insert into public.historico_precos (cidade_id, extra_id, valor_mensal_centavos, meses_cobrados_no_anual, vigente_desde)
select cidade_id, id, valor_mensal_centavos, meses_cobrados_no_anual, date '2026-10-01' from public.extras;

create function interno.registrar_preco() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.valor_mensal_centavos = old.valor_mensal_centavos and new.meses_cobrados_no_anual = old.meses_cobrados_no_anual then
    return null;
  end if;
  insert into public.historico_precos (cidade_id, plano_id, extra_id, valor_mensal_centavos, meses_cobrados_no_anual, vigente_desde, alterado_por)
  values (new.cidade_id,
          case when tg_table_name = 'planos' then new.id end,
          case when tg_table_name = 'extras' then new.id end,
          new.valor_mensal_centavos, new.meses_cobrados_no_anual, interno.hoje(), auth.uid());
  return null;
end
$$;

create trigger registrar_preco after insert or update on public.planos for each row execute function interno.registrar_preco();
create trigger registrar_preco after insert or update on public.extras for each row execute function interno.registrar_preco();

/** O Gratuito não vira pago, e o pago não vira gratuito. */
create function interno.proteger_plano_gratuito() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.valor_mensal_centavos = 0) <> (new.valor_mensal_centavos = 0) then
    raise exception 'O plano Gratuito continua gratuito, e um plano pago não pode passar a custar zero.';
  end if;
  return new;
end
$$;

create trigger proteger_plano_gratuito before update of valor_mensal_centavos on public.planos
for each row execute function interno.proteger_plano_gratuito();

alter table public.historico_precos enable row level security;
create policy "visitante sem acesso" on public.historico_precos as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso" on public.historico_precos for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
create policy "representante sem acesso" on public.historico_precos for select to authenticated
  using (false and (select interno.tem_papel('representante')));
create policy "administrador lê" on public.historico_precos for select to authenticated using ((select interno.eh_admin()));

-- ---------------------------------------------------------------------------
-- Aviso de novo preço
-- ---------------------------------------------------------------------------

alter table public.avisos_email drop constraint avisos_email_tipo_check;
alter table public.avisos_email add constraint avisos_email_tipo_check
  check (tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'plano_vencido', 'aviso_preco'));

/**
 * Põe na fila o aviso de novo preço de cada assinante: a partir de qual
 * vencimento e quanto ele vai pagar (p_avisos: [{anuncianteId, aPartirDe,
 * valorCentavos}], calculados por avisoDePreco). Sai antes dos lembretes.
 * Devolve quantos entraram.
 */
create function public.avisar_novo_preco(p_avisos jsonb) returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  item jsonb;
  quantos integer := 0;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração avisa mudança de preço.';
  end if;
  for item in select * from jsonb_array_elements(p_avisos) loop
    insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
    select a.cidade_id, a.id, 'aviso_preco', (item ->> 'aPartirDe')::date, u.email,
           interno.dados_do_aviso(a.id) || jsonb_build_object('valorNovoCentavos', (item ->> 'valorCentavos')::integer, 'aPartirDe', item ->> 'aPartirDe'),
           0
    from public.anunciantes a
    join auth.users u on u.id = a.usuario_id
    where a.id = (item ->> 'anuncianteId')::uuid and u.email is not null
    on conflict (anunciante_id, tipo, referencia) do update
    set dados = excluded.dados, para = excluded.para, situacao = 'pendente', tentativas = 0, erro = null, criado_em = now(), enviado_em = null;
    if found then
      quantos := quantos + 1;
    end if;
  end loop;
  return quantos;
end
$$;

revoke execute on function public.avisar_novo_preco(jsonb) from public, anon;
grant execute on function public.avisar_novo_preco(jsonb) to authenticated;
