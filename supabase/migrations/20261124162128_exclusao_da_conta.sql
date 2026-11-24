-- Exclusão da conta pelo próprio anunciante ou cliente (LGPD; decisões X1 a X6
-- de 24/11/2026; Termos de Uso v2, item 13; Política de Privacidade v2, itens 7 e 9):
-- - confirmada com a senha, na hora (X1);
-- - quem tem período pago em vigor (plano, extra ou evento avulso) escolhe:
--   manter o cadastro até o fim do período pago, com a exclusão automática
--   nesse dia (perfis_usuario.exclusao_em, aplicada pelo pg_cron), ou apagar
--   já, sem devolução (X2, X3). As propostas abertas são canceladas; as
--   comissões continuam (só devolução e contestação as cancelam);
-- - quem pagou fica com o registro mínimo da lei fiscal: o anunciante com a
--   situação "excluido", o nome, o plano, os pagamentos, as comissões e o
--   histórico, sem perfil público, contatos, fotos, endereços nem login.
--   Quem nunca pagou é apagado inteiro (X2);
-- - os aceites dos Termos e da Política ficam por 5 anos (X4): a conta sai,
--   e o aceite continua com o id dela;
-- - comércio que veio da Receita tem o CNPJ bloqueado, para não voltar na
--   importação (X5);
-- - eventos sem pagamento saem na hora; os pagos ficam cancelados, sem o
--   organizador e sem o cartaz, só pelo registro do pagamento (X6);
-- - os arquivos públicos (fotos, encartes, cartazes) ficam no R2 da
--   Cloudflare, que o banco não alcança: entram na fila arquivos_para_apagar,
--   processada pelo site (/api/tarefas/apagar-arquivos) logo depois da
--   exclusão e, nas exclusões agendadas, chamada pelo pg_cron;
-- - um e-mail confirma a exclusão, e outro, o agendamento.

-- ---------------------------------------------------------------------------
-- Travas que impediam apagar a conta
-- ---------------------------------------------------------------------------

-- X4: o aceite fica depois que a conta sai (sem a chave estrangeira em cascata).
alter table public.aceites_documentos drop constraint aceites_documentos_usuario_id_fkey;
-- Quem respondeu uma proposta ou fechou uma negociação pode ter a conta apagada.
alter table public.propostas drop constraint propostas_respondida_por_fkey;
alter table public.propostas add constraint propostas_respondida_por_fkey
  foreign key (respondida_por) references auth.users (id) on delete set null;
alter table public.negociacoes drop constraint negociacoes_fechada_por_fkey;
alter table public.negociacoes add constraint negociacoes_fechada_por_fkey
  foreign key (fechada_por) references auth.users (id) on delete set null;

alter table public.extras_contratados drop constraint extras_contratados_motivo_encerramento_check;
alter table public.extras_contratados add constraint extras_contratados_motivo_encerramento_check
  check (motivo_encerramento in ('vencimento', 'devolucao', 'contestacao', 'exclusao'));

-- Dia em que a conta será excluída, quando a pessoa escolheu manter o cadastro até o fim do período pago.
alter table public.perfis_usuario add column exclusao_em date;
create index perfis_usuario_exclusao_idx on public.perfis_usuario (exclusao_em) where exclusao_em is not null;

/** Fila dos arquivos públicos a apagar no R2 (o banco não alcança o R2). */
create table public.arquivos_para_apagar (
  id uuid primary key default gen_random_uuid(),
  -- foto: <chave>-400/800/1600 em JPEG ou WebP (fotos e cartazes); encarte: <chave>.webp ou .pdf.
  tipo text not null check (tipo in ('foto', 'encarte')),
  chave text not null check (chave ~ '^(fotos|encartes|eventos)/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  criado_em timestamptz not null default now()
);
alter table public.arquivos_para_apagar enable row level security;
create policy "visitante sem acesso" on public.arquivos_para_apagar as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso" on public.arquivos_para_apagar for select to authenticated using (false and (select interno.tem_papel('anunciante')));
create policy "representante sem acesso" on public.arquivos_para_apagar for select to authenticated using (false and (select interno.meu_representante_id()) is not null);
create policy "administrador lê" on public.arquivos_para_apagar for select to authenticated using ((select interno.eh_admin()));

-- Avisos da exclusão: sem anúncio ligado (a conta pode não ter anúncio, e o anúncio pode ser apagado).
alter table public.avisos_email drop constraint avisos_email_tipo_check;
alter table public.avisos_email add constraint avisos_email_tipo_check
  check (tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'plano_vencido', 'aviso_preco', 'escala_fundador', 'proposta', 'denuncia',
                  'pagamento_antes_do_aceite', 'extra_lembrete_7_dias', 'extra_lembrete_vencimento', 'extra_vencido', 'termos_novos',
                  'privacidade_nova', 'conta_excluida', 'exclusao_agendada'));
alter table public.avisos_email drop constraint avisos_email_destinatario_check;
alter table public.avisos_email add constraint avisos_email_destinatario_check
  check ((tipo in ('escala_fundador', 'denuncia', 'termos_novos', 'privacidade_nova', 'conta_excluida', 'exclusao_agendada')) = (anunciante_id is null));

-- ---------------------------------------------------------------------------
-- Período pago e exclusão
-- ---------------------------------------------------------------------------

/**
 * Até quando a conta tem período pago em vigor (a exclusão agendada acontece
 * nesse dia): o vencimento do plano pago, o dos extras em vigor e o dia
 * seguinte ao último dia dos eventos avulsos pagos. null: nada pago em vigor.
 * Repete opcoesDeExclusao (packages/domain/conta.ts), que recebe esta data.
 */
create function interno.pago_ate(p_usuario uuid) returns date
language sql stable security definer
set search_path = ''
as $$
  select max(d) from (
    select s.vence_em as d
    from public.anunciantes a
    join public.assinaturas s on s.anunciante_id = a.id
    join public.planos p on p.id = s.plano_id
    where a.usuario_id = p_usuario and p.valor_mensal_centavos > 0 and s.vence_em >= interno.hoje()
    union all
    select c.vence_em
    from public.anunciantes a
    join public.extras_contratados c on c.anunciante_id = a.id
    where a.usuario_id = p_usuario and c.encerrado_em is null and c.vence_em >= interno.hoje()
    union all
    select e.data_fim + 1
    from public.eventos e
    where e.usuario_id = p_usuario and e.data_fim >= interno.hoje() and e.situacao <> 'cancelado'
      and interno.blocos_pagos_do_evento(e.id) > 0
  ) datas
$$;

/**
 * Apaga a conta (X1 a X6). Roda como o sistema: tira a identidade de quem
 * chamou desta transação, para as travas de quem não é da equipe não barrarem
 * a limpeza (a permissão já foi conferida em excluir_minha_conta ou é o pg_cron).
 */
create function interno.executar_exclusao(p_usuario uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_email text;
  v_nome text;
  v_cidade uuid;
  ev record;
  a record;
  v_cnpj text;
begin
  select u.email, coalesce(nullif(p.nome, ''), '') into v_email, v_nome
  from auth.users u
  left join public.perfis_usuario p on p.usuario_id = u.id
  where u.id = p_usuario;
  if v_email is null then
    return;
  end if;
  select c.id into v_cidade from public.cidades c where c.slug = 'rio-das-ostras';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);

  -- Eventos da conta e dos anúncios dela (X6).
  for ev in
    select e.id, e.cartaz_chave, exists (select 1 from public.pagamentos pg where pg.evento_id = e.id) as pago
    from public.eventos e
    where e.usuario_id = p_usuario
       or e.anunciante_id in (select an.id from public.anunciantes an where an.usuario_id = p_usuario)
  loop
    if ev.cartaz_chave is not null then
      insert into public.arquivos_para_apagar (tipo, chave) values ('foto', ev.cartaz_chave);
    end if;
    if ev.pago then
      delete from public.barracas_evento where evento_id = ev.id;
      update public.eventos
      set situacao = 'cancelado', usuario_id = null, produtor = null, descricao = '',
          cartaz_chave = null, cartaz_largura = null, cartaz_altura = null
      where id = ev.id;
    else
      delete from public.eventos where id = ev.id;
    end if;
  end loop;

  for a in select an.id, an.cidade_id, an.nome from public.anunciantes an where an.usuario_id = p_usuario loop
    select dr.cnpj into v_cnpj from public.dados_receita dr where dr.anunciante_id = a.id;
    if v_cnpj is not null then
      insert into public.cnpjs_bloqueados (cidade_id, cnpj, motivo) values (a.cidade_id, v_cnpj, 'remover')
      on conflict (cidade_id, cnpj) do nothing;
    end if;
    insert into public.arquivos_para_apagar (tipo, chave) select 'foto', f.chave from public.fotos f where f.anunciante_id = a.id;
    insert into public.arquivos_para_apagar (tipo, chave) select 'encarte', e.chave from public.encartes e where e.anunciante_id = a.id;
    update public.propostas set situacao = 'cancelada' where anunciante_id = a.id and situacao in ('aguardando_aceite', 'aceita');
    delete from public.avisos_email where anunciante_id = a.id and situacao = 'pendente';

    -- O artista sai junto; se ainda está na programação de algum evento, fica só o nome e os estilos.
    delete from public.artistas ar
    where ar.anunciante_id = a.id and not exists (select 1 from public.programacao_evento pe where pe.artista_id = ar.id);
    update public.artistas set anunciante_id = null, formacao = null, atende = '{}', videos = '[]' where anunciante_id = a.id;

    if exists (select 1 from public.pagamentos pg where pg.anunciante_id = a.id)
       or exists (select 1 from public.upgrades u where u.anunciante_id = a.id)
       or exists (select 1 from public.extras_contratados c where c.anunciante_id = a.id) then
      -- Registro mínimo pela lei fiscal (X2).
      update public.extras_contratados set encerrado_em = now(), motivo_encerramento = 'exclusao'
      where anunciante_id = a.id and encerrado_em is null;
      delete from public.assinaturas where anunciante_id = a.id;
      delete from public.enderecos where anunciante_id = a.id;
      delete from public.horarios where anunciante_id = a.id;
      delete from public.produtos where anunciante_id = a.id;
      delete from public.fotos where anunciante_id = a.id;
      delete from public.encartes where anunciante_id = a.id;
      delete from public.anunciante_bairros where anunciante_id = a.id;
      delete from public.autorizacoes_edicao where anunciante_id = a.id;
      delete from public.dados_receita where anunciante_id = a.id;
      insert into public.nao_procurar (anunciante_id, cidade_id) values (a.id, a.cidade_id) on conflict (anunciante_id) do nothing;
      update public.anunciantes
      set status = 'excluido', usuario_id = null, descricao = '', whatsapp = null, telefone = null, instagram = null,
          site_proprio = null, registro_conselho = null, email_convite = null, formas_pagamento = '{}'
      where id = a.id;
    else
      delete from public.anunciantes where id = a.id;
    end if;
  end loop;

  insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
  values (v_cidade, null, 'conta_excluida', interno.hoje(), v_email, jsonb_build_object('nome', v_nome), 1);
  delete from auth.users where id = p_usuario;
end
$$;

/**
 * A pessoa logada exclui a própria conta (só o papel anunciante; a conta da
 * equipe é desativada pela administração). p_manter: com período pago em
 * vigor, agenda a exclusão para o fim dele (X2, X3); sem, apaga já. A senha
 * é conferida no servidor antes de chamar. Devolve { "excluida": true } ou
 * { "agendadaPara": "AAAA-MM-DD" }.
 */
create function public.excluir_minha_conta(p_manter boolean) returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_ate date;
  v_email text;
  v_nome text;
begin
  if v_usuario is null or not interno.tem_papel('anunciante') then
    raise exception 'Só a conta de anunciante é excluída por aqui. Fale com a equipe.';
  end if;
  if p_manter then
    v_ate := interno.pago_ate(v_usuario);
    if v_ate is null then
      raise exception 'Não há período pago em vigor para manter. Escolha excluir agora.';
    end if;
    update public.perfis_usuario set exclusao_em = v_ate where usuario_id = v_usuario;
    update public.propostas set situacao = 'cancelada'
    where situacao in ('aguardando_aceite', 'aceita')
      and anunciante_id in (select a.id from public.anunciantes a where a.usuario_id = v_usuario);
    select u.email, coalesce(nullif(p.nome, ''), '') into v_email, v_nome
    from auth.users u join public.perfis_usuario p on p.usuario_id = u.id where u.id = v_usuario;
    insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
    select c.id, null, 'exclusao_agendada', interno.hoje(), v_email, jsonb_build_object('nome', v_nome, 'excluirEm', v_ate), 1
    from public.cidades c where c.slug = 'rio-das-ostras';
    return jsonb_build_object('agendadaPara', v_ate);
  end if;
  perform interno.executar_exclusao(v_usuario);
  return jsonb_build_object('excluida', true);
end
$$;

/** Desiste da exclusão agendada. */
create function public.desistir_da_exclusao() returns void
language sql volatile security definer
set search_path = ''
as $$
  update public.perfis_usuario set exclusao_em = null where usuario_id = auth.uid() and interno.tem_papel('anunciante')
$$;

/**
 * O que a tela de exclusão mostra: o período pago em vigor, o último
 * pagamento (para o aviso dos 7 dias de desistência) e a exclusão agendada.
 */
create function public.situacao_da_minha_conta() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pagoAte', interno.pago_ate(auth.uid()),
    'ultimoPagamento', (
      select max(pg.pago_em) from public.pagamentos pg
      where pg.devolvido_em is null
        and (pg.anunciante_id in (select a.id from public.anunciantes a where a.usuario_id = auth.uid())
             or pg.evento_id in (select e.id from public.eventos e where e.usuario_id = auth.uid()))
    ),
    'exclusaoEm', (select p.exclusao_em from public.perfis_usuario p where p.usuario_id = auth.uid())
  )
  where interno.tem_papel('anunciante')
$$;

/** Exclusões agendadas que chegaram ao dia (pg_cron, 06:10). Depois, o site apaga os arquivos da fila. */
create function interno.aplicar_exclusoes_agendadas() returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  for v_usuario in select p.usuario_id from public.perfis_usuario p where p.exclusao_em <= interno.hoje() loop
    perform interno.executar_exclusao(v_usuario);
  end loop;
  if exists (select 1 from public.arquivos_para_apagar) then
    -- Até a abertura, a produção fica em prod.acheaquiro.com.br; na abertura, trocar para acheaquiro.com.br.
    perform net.http_post(
      url := 'https://prod.acheaquiro.com.br/api/tarefas/apagar-arquivos',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  end if;
end
$$;

/** Quem vai ser excluído no fim do período não recebe lembrete de renovação nem aviso de preço. */
create function interno.sem_lembrete_para_quem_sai() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.anunciante_id is not null
     and new.tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'extra_lembrete_7_dias', 'extra_lembrete_vencimento', 'aviso_preco')
     and exists (
       select 1 from public.anunciantes a
       join public.perfis_usuario p on p.usuario_id = a.usuario_id
       where a.id = new.anunciante_id and p.exclusao_em is not null
     ) then
    return null;
  end if;
  return new;
end
$$;
create trigger sem_lembrete_para_quem_sai before insert on public.avisos_email
for each row execute function interno.sem_lembrete_para_quem_sai();

revoke execute on function interno.pago_ate(uuid) from public, anon, authenticated;
revoke execute on function interno.executar_exclusao(uuid) from public, anon, authenticated;
revoke execute on function interno.aplicar_exclusoes_agendadas() from public, anon, authenticated;
revoke execute on function interno.sem_lembrete_para_quem_sai() from public, anon, authenticated;
revoke execute on function public.excluir_minha_conta(boolean) from public, anon;
revoke execute on function public.desistir_da_exclusao() from public, anon;
revoke execute on function public.situacao_da_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta(boolean) to authenticated;
grant execute on function public.desistir_da_exclusao() to authenticated;
grant execute on function public.situacao_da_minha_conta() to authenticated;

select cron.schedule('exclusoes-agendadas', '10 9 * * *', 'select interno.aplicar_exclusoes_agendadas()');
