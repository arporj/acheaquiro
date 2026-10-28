-- Propostas do representante e mudança de plano (plano 3B.1, decisões S2 a S8
-- de 28/10/2026):
-- - o representante propõe uma assinatura (a quem não tem plano pago em dia)
--   ou um plano maior, com desconto até a comissão do pagamento; o anunciante
--   aceita entrando na conta (S3); a proposta vale 7 dias para aceitar e
--   pagar, com o preço travado (S4);
-- - o upgrade muda o plano na hora, com a diferença proporcional; a comissão
--   do representante fica numa faixa (upgrades), paga em parcelas que só saem
--   quando o pagamento as cobre (S7), e a venda original fica no valor do
--   plano vendido (S8);
-- - a redução de plano fica agendada para o próximo vencimento (S2);
-- - o perfil público mostra só as fotos, categorias e endereços que cabem no
--   plano em vigor; o resto fica guardado.
-- As contas ficam em packages/domain (assinatura.ts e upgrade.ts, testadas);
-- o banco grava numa transação e confere o que dá para conferir.

-- ---------------------------------------------------------------------------
-- Pagamentos: tipo, plano anterior do upgrade e desconto do representante
-- ---------------------------------------------------------------------------

alter table public.pagamentos
  add column tipo text not null default 'plano' check (tipo in ('plano', 'upgrade')),
  add column plano_anterior_id uuid references public.planos (id),
  add column desconto_representante_centavos integer not null default 0 check (desconto_representante_centavos >= 0);
alter table public.pagamentos drop constraint pagamentos_check1;
alter table public.pagamentos
  add constraint pagamentos_valor_com_descontos check (valor_centavos = valor_cheio_centavos - desconto_fundador_centavos - desconto_representante_centavos),
  add constraint pagamentos_upgrade_tem_plano_anterior check ((tipo = 'upgrade') = (plano_anterior_id is not null));

-- Assinatura: o plano vendido (base das parcelas da venda, decisão S8) e a redução agendada (S2).
alter table public.assinaturas
  add column plano_vendido_id uuid references public.planos (id),
  add column plano_seguinte_id uuid references public.planos (id);
update public.assinaturas s
set plano_vendido_id = (
  select p.plano_id from public.pagamentos p
  where p.anunciante_id = s.anunciante_id and p.devolvido_em is null
  order by p.registrado_em limit 1
);
update public.assinaturas set plano_vendido_id = plano_id where plano_vendido_id is null;
alter table public.assinaturas alter column plano_vendido_id set not null;

-- ---------------------------------------------------------------------------
-- Propostas
-- ---------------------------------------------------------------------------

create table public.propostas (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  anunciante_id uuid not null references public.anunciantes (id) on delete cascade,
  representante_id uuid not null references public.representantes (id),
  -- assinatura: quem não tem plano pago em dia; upgrade: plano maior no meio do período.
  tipo text not null check (tipo in ('assinatura', 'upgrade')),
  plano_id uuid not null references public.planos (id),
  periodicidade text not null check (periodicidade in ('mensal', 'anual')),
  -- Preço travado na proposta (decisão S4), copiado do catálogo.
  valor_mensal_centavos integer not null check (valor_mensal_centavos > 0),
  meses_cobrados_no_anual smallint not null check (meses_cobrados_no_anual between 1 and 12),
  desconto_centavos integer not null default 0 check (desconto_centavos >= 0),
  situacao text not null default 'aguardando_aceite'
    check (situacao in ('aguardando_aceite', 'aceita', 'paga', 'recusada', 'cancelada')),
  criada_em timestamptz not null default now(),
  -- Último dia para aceitar e pagar (7 dias).
  expira_em date not null,
  aceita_em timestamptz,
  respondida_por uuid references auth.users (id),
  pagamento_id uuid references public.pagamentos (id),
  check ((situacao = 'paga') = (pagamento_id is not null)),
  check ((situacao in ('aceita', 'paga')) = (aceita_em is not null))
);
create index propostas_anunciante_idx on public.propostas (anunciante_id, criada_em desc);
create index propostas_representante_idx on public.propostas (representante_id, criada_em desc);
create index propostas_aceitas_idx on public.propostas (cidade_id, expira_em) where situacao = 'aceita';

alter table public.pagamentos add column proposta_id uuid references public.propostas (id);

-- ---------------------------------------------------------------------------
-- Faixas de comissão dos upgrades
-- ---------------------------------------------------------------------------

create table public.upgrades (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  anunciante_id uuid not null references public.anunciantes (id) on delete restrict,
  representante_id uuid not null references public.representantes (id),
  proposta_id uuid references public.propostas (id),
  -- Pagamento proporcional que criou a faixa: a devolução dele cancela a faixa.
  pagamento_id uuid not null references public.pagamentos (id),
  plano_id uuid not null references public.planos (id),
  -- Mensalidade nova menos a maior já comissionada, sem o desconto de Fundador, fixada na venda.
  diferenca_mensal_centavos integer not null check (diferenca_mensal_centavos > 0),
  parcelas_pagas smallint not null default 0 check (parcelas_pagas between 0 and 4),
  concluida boolean not null default false,
  desconto_centavos integer not null default 0 check (desconto_centavos >= 0),
  criado_em timestamptz not null default now(),
  cancelado_em timestamptz
);
create index upgrades_anunciante_idx on public.upgrades (anunciante_id, criado_em);

alter table public.comissoes add column upgrade_id uuid references public.upgrades (id);
alter table public.comissoes drop constraint comissoes_pagamento_id_origem_key;
-- Um pagamento pode levar a parcela da venda e a de mais de um upgrade (decisão S8).
create unique index comissoes_pagamento_origem on public.comissoes (pagamento_id, origem) where upgrade_id is null and pagamento_id is not null;
create unique index comissoes_pagamento_upgrade on public.comissoes (pagamento_id, upgrade_id, origem) where upgrade_id is not null;
alter table public.comissoes add constraint comissoes_upgrade_origem check (upgrade_id is null or origem in ('upgrade', 'contestacao'));

-- ---------------------------------------------------------------------------
-- Avisos: e-mail da proposta
-- ---------------------------------------------------------------------------

alter table public.avisos_email drop constraint avisos_email_tipo_check;
alter table public.avisos_email add constraint avisos_email_tipo_check
  check (tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'plano_vencido', 'aviso_preco', 'escala_fundador', 'proposta'));
-- Mais de uma proposta no mesmo dia: cada uma tem o seu e-mail.
alter table public.avisos_email drop constraint avisos_email_anunciante_id_tipo_referencia_key;
create unique index avisos_email_unico on public.avisos_email (anunciante_id, tipo, referencia) where tipo <> 'proposta';

-- ---------------------------------------------------------------------------
-- Auditoria e RLS
-- ---------------------------------------------------------------------------

create trigger auditar after insert or update or delete on public.propostas for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.upgrades for each row execute function interno.auditar();

alter table public.propostas enable row level security;
alter table public.upgrades enable row level security;

create policy "visitante sem acesso" on public.propostas as restrictive for all to anon using (false) with check (false);
create policy "visitante sem acesso" on public.upgrades as restrictive for all to anon using (false) with check (false);
create policy "administrador lê e altera" on public.propostas for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
create policy "administrador lê e altera" on public.upgrades for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
-- Propostas: o anunciante lê as dele e o representante as que fez; as mudanças passam pelas funções abaixo.
create policy "anunciante lê as próprias propostas" on public.propostas for select to authenticated
  using ((select interno.tem_papel('anunciante')) and exists (
    select 1 from public.anunciantes a where a.id = anunciante_id and a.usuario_id = (select auth.uid())));
create policy "representante lê as propostas que fez" on public.propostas for select to authenticated
  using (representante_id = (select interno.meu_representante_id()));
-- Faixas: o representante lê as dele; o anunciante, nenhuma (é comissão).
create policy "representante lê as próprias faixas" on public.upgrades for select to authenticated
  using (representante_id = (select interno.meu_representante_id()));
create policy "anunciante sem acesso às faixas" on public.upgrades for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));

-- ---------------------------------------------------------------------------
-- Contexto da proposta: o que o representante e o anunciante precisam para a conta
-- ---------------------------------------------------------------------------

/**
 * Plano em vigor, assinatura, Fundador e o maior plano já comissionado de um
 * anunciante, para calcular a proposta (packages/domain). Lê o representante
 * ativo (qualquer um pode atender, decisão de 23/10/2026), o dono do perfil e
 * a administração. Sem dados de contato nem valores pagos.
 */
create function public.contexto_da_proposta(p_anunciante uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  a record;
  s record;
  ultimo record;
begin
  select an.id, an.nome, an.slug, an.tipo, an.status, an.cidade_id, an.usuario_id, an.fundador_desde, an.plano_id
  into a from public.anunciantes an where an.id = p_anunciante;
  if a.id is null
     or not (interno.eh_admin() or interno.meu_representante_id() is not null or a.usuario_id = auth.uid()) then
    raise exception 'Anunciante não encontrado.';
  end if;
  select * into s from public.assinaturas where anunciante_id = a.id;
  select p.periodo_inicio, p.vence_em into ultimo from public.pagamentos p
  where p.anunciante_id = a.id and p.devolvido_em is null and p.tipo = 'plano'
  order by p.registrado_em desc limit 1;
  return jsonb_build_object(
    'anunciante', jsonb_build_object('id', a.id, 'nome', a.nome, 'slug', a.slug, 'tipo', a.tipo, 'status', a.status,
                                     'temConta', a.usuario_id is not null, 'fundadorDesde', a.fundador_desde, 'planoId', a.plano_id),
    'assinatura', case when s.anunciante_id is null then null else jsonb_build_object(
      'planoId', s.plano_id, 'periodicidade', s.periodicidade, 'ancora', s.ancora, 'venceEm', s.vence_em,
      'periodoInicio', ultimo.periodo_inicio, 'planoSeguinteId', s.plano_seguinte_id) end,
    'pagamentosValidos', (select count(*) from public.pagamentos p where p.anunciante_id = a.id and p.devolvido_em is null and p.tipo = 'plano'),
    'algumAnual', exists (select 1 from public.pagamentos p where p.anunciante_id = a.id and p.devolvido_em is null and p.tipo = 'plano' and p.periodicidade = 'anual'),
    -- Maior mensalidade já comissionada: a do plano vendido com representante e a dos upgrades com comissão.
    'maiorComissionadaCentavos', greatest(
      coalesce((select pl.valor_mensal_centavos from public.planos pl where pl.id = s.plano_vendido_id and s.representante_id is not null), 0),
      coalesce((select max(pl.valor_mensal_centavos) from public.upgrades u join public.planos pl on pl.id = u.plano_id
                where u.anunciante_id = a.id and u.cancelado_em is null), 0)),
    'planos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'nivel', p.nivel, 'valorMensalCentavos', p.valor_mensal_centavos,
                                          'mesesCobradosNoAnual', p.meses_cobrados_no_anual) order by p.nivel)
      from public.planos p where p.cidade_id = a.cidade_id and p.tipo = a.tipo and p.ativo and p.valor_mensal_centavos > 0
    ), '[]'::jsonb)
  );
end
$$;

revoke execute on function public.contexto_da_proposta(uuid) from public, anon;
grant execute on function public.contexto_da_proposta(uuid) to authenticated;

/** Busca de anunciantes com conta para o representante propor (nome e plano, que já são públicos). */
create function public.anunciantes_para_proposta(p_termo text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo, 'plano', x.plano) order by x.nome), '[]'::jsonb)
  from (
    select a.id, a.nome, a.tipo, p.nome as plano
    from public.anunciantes a
    left join public.planos p on p.id = a.plano_id
    where interno.meu_representante_id() is not null
      and a.usuario_id is not null
      and a.status in ('aguardando_pagamento', 'publicado', 'pausado', 'escondido_por_vencimento')
      and length(trim(coalesce(p_termo, ''))) >= 2
      and interno.normalizar(a.nome) like
        '%' || replace(replace(replace(interno.normalizar(p_termo), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by a.nome
    limit 20
  ) x
$$;

revoke execute on function public.anunciantes_para_proposta(text) from public, anon;
grant execute on function public.anunciantes_para_proposta(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Criar, aceitar, recusar e cancelar
-- ---------------------------------------------------------------------------

/**
 * O representante cria a proposta; o servidor já conferiu o desconto com as
 * regras do domínio (até a comissão do pagamento), e o registro do pagamento
 * confere de novo. O banco copia o preço do catálogo, decide o tipo (upgrade
 * quando há assinatura paga em dia) e põe o e-mail na fila.
 */
create function public.criar_proposta(p_anunciante uuid, p_plano uuid, p_periodicidade text, p_desconto integer) returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  rep uuid := interno.meu_representante_id();
  a record;
  pl record;
  s record;
  atual integer;
  v_tipo text;
  v_periodicidade text := p_periodicidade;
  nova uuid;
begin
  if rep is null then
    raise exception 'Só o representante faz propostas.';
  end if;
  select an.id, an.cidade_id, an.tipo, an.status, an.usuario_id into a from public.anunciantes an where an.id = p_anunciante;
  if a.id is null or a.usuario_id is null or a.status not in ('aguardando_pagamento', 'publicado', 'pausado', 'escondido_por_vencimento') then
    raise exception 'Este anunciante não pode receber proposta agora: ele precisa ter conta e cadastro aprovado.';
  end if;
  select p.id, p.valor_mensal_centavos, p.meses_cobrados_no_anual into pl from public.planos p
  where p.id = p_plano and p.cidade_id = a.cidade_id and p.tipo = a.tipo and p.ativo and p.valor_mensal_centavos > 0;
  if pl.id is null then
    raise exception 'Escolha um plano pago deste tipo de anunciante.';
  end if;
  if p_desconto is null or p_desconto < 0 then
    raise exception 'Desconto inválido.';
  end if;

  select ss.plano_id, ss.periodicidade, ss.vence_em into s from public.assinaturas ss where ss.anunciante_id = a.id;
  if s.plano_id is not null and s.vence_em + interno.tolerancia_vencimento(a.cidade_id) >= interno.hoje()
     and exists (select 1 from public.anunciantes an where an.id = a.id and an.plano_id = s.plano_id) then
    select p.valor_mensal_centavos into atual from public.planos p where p.id = s.plano_id;
    if pl.valor_mensal_centavos <= atual then
      raise exception 'A proposta precisa ser de um plano maior que o atual. Para um plano menor, o anunciante fala com a equipe.';
    end if;
    v_tipo := 'upgrade';
    v_periodicidade := s.periodicidade;
  else
    if p_periodicidade not in ('mensal', 'anual') then
      raise exception 'Escolha mensal ou anual.';
    end if;
    v_tipo := 'assinatura';
  end if;

  insert into public.propostas (cidade_id, anunciante_id, representante_id, tipo, plano_id, periodicidade,
                                valor_mensal_centavos, meses_cobrados_no_anual, desconto_centavos, expira_em)
  values (a.cidade_id, a.id, rep, v_tipo, pl.id, v_periodicidade, pl.valor_mensal_centavos, pl.meses_cobrados_no_anual,
          p_desconto, interno.hoje() + 7)
  returning id into nova;

  insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
  select a.cidade_id, a.id, 'proposta', interno.hoje(), u.email,
         interno.dados_do_aviso(a.id) || jsonb_build_object(
           'propostaId', nova,
           'representante', (select coalesce(nullif(pu.nome, ''), r.codigo) from public.representantes r
                             left join public.perfis_usuario pu on pu.usuario_id = r.usuario_id where r.id = rep),
           'planoNovo', (select p.nome from public.planos p where p.id = pl.id),
           'expiraEm', interno.hoje() + 7),
         0
  from auth.users u where u.id = a.usuario_id and u.email is not null;
  return nova;
end
$$;

/** O dono do perfil aceita a proposta (entrando na conta, decisão S3); as outras abertas dele são canceladas. */
create function public.aceitar_proposta(p_proposta uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  pr record;
begin
  select p.* into pr from public.propostas p
  join public.anunciantes a on a.id = p.anunciante_id
  where p.id = p_proposta and a.usuario_id = auth.uid()
  for update of p;
  if pr.id is null then
    raise exception 'Proposta não encontrada.';
  end if;
  if pr.situacao <> 'aguardando_aceite' then
    raise exception 'Esta proposta já foi respondida ou cancelada.';
  end if;
  if interno.hoje() > pr.expira_em then
    raise exception 'Esta proposta venceu. Peça uma nova ao representante.';
  end if;
  update public.propostas set situacao = 'aceita', aceita_em = now(), respondida_por = auth.uid() where id = pr.id;
  update public.propostas set situacao = 'cancelada'
  where anunciante_id = pr.anunciante_id and id <> pr.id and situacao in ('aguardando_aceite', 'aceita');
end
$$;

create function public.recusar_proposta(p_proposta uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.propostas p set situacao = 'recusada', respondida_por = auth.uid()
  where p.id = p_proposta and p.situacao = 'aguardando_aceite'
    and exists (select 1 from public.anunciantes a where a.id = p.anunciante_id and a.usuario_id = auth.uid());
  if not found then
    raise exception 'Proposta não encontrada ou já respondida.';
  end if;
end
$$;

/** O representante que fez (ou a administração) cancela a proposta ainda não paga. */
create function public.cancelar_proposta(p_proposta uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.propostas p set situacao = 'cancelada'
  where p.id = p_proposta and p.situacao in ('aguardando_aceite', 'aceita')
    and (p.representante_id = interno.meu_representante_id() or interno.eh_admin());
  if not found then
    raise exception 'Proposta não encontrada ou já encerrada.';
  end if;
end
$$;

do $$
declare
  f text;
begin
  foreach f in array array['criar_proposta(uuid, uuid, text, integer)', 'aceitar_proposta(uuid)', 'recusar_proposta(uuid)', 'cancelar_proposta(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;

/** Proposta aceita e no prazo, deste anunciante e do tipo esperado: trava para o pagamento. */
create function interno.proposta_para_pagar(p_proposta uuid, p_anunciante uuid, p_tipo text) returns public.propostas
language plpgsql volatile
set search_path = ''
as $$
declare
  pr public.propostas;
begin
  select * into pr from public.propostas where id = p_proposta for update;
  if pr.id is null or pr.anunciante_id <> p_anunciante or pr.tipo <> p_tipo then
    raise exception 'Proposta não encontrada para este anunciante.';
  end if;
  if pr.situacao <> 'aceita' then
    raise exception 'A proposta precisa estar aceita pelo anunciante.';
  end if;
  if interno.hoje() > pr.expira_em then
    raise exception 'A proposta venceu: o representante precisa fazer outra.';
  end if;
  return pr;
end
$$;

-- ---------------------------------------------------------------------------
-- Registro do pagamento do plano, agora com proposta, desconto e faixas
-- ---------------------------------------------------------------------------

drop function public.registrar_pagamento_plano(
  uuid, uuid, text, integer, date, date, date, date, integer, integer, public.forma_recebimento, integer, text, date, date, text, text,
  uuid, date, boolean, integer, numeric, integer, date, uuid, integer, numeric, integer
);

/**
 * Como antes (migration 20261027130000), com:
 * - p_proposta: proposta de assinatura aceita, que fixa plano, período,
 *   representante e desconto, e passa a paga;
 * - p_desconto_representante: desconto do representante no 1º pagamento;
 * - p_parcelas_upgrade: parcelas das faixas neste pagamento
 *   ([{faixa, parcelasAntes, parcelasPagasDepois, concluida, base, percentual, valor}]),
 *   calculadas por calcularPagamentoPlano.
 * Só os pagamentos do tipo plano contam no número.
 */
create function public.registrar_pagamento_plano(
  p_anunciante uuid,
  p_plano uuid,
  p_periodicidade text,
  p_numero integer,
  p_vence_anterior date,
  p_ancora date,
  p_periodo_inicio date,
  p_vence_em date,
  p_valor_cheio integer,
  p_desconto_fundador integer,
  p_forma public.forma_recebimento,
  p_parcelas integer,
  p_codigo_autorizacao text,
  p_pago_em date,
  p_confirmado_em date,
  p_comprovante text,
  p_observacao text,
  p_representante uuid,
  p_fundador_desde date,
  p_tornou_fundador boolean,
  p_comissao_base integer,
  p_comissao_percentual numeric,
  p_comissao_valor integer,
  p_comissao_libera_em date,
  p_carteira_representante uuid,
  p_carteira_base integer,
  p_carteira_percentual numeric,
  p_carteira_valor integer,
  p_proposta uuid,
  p_desconto_representante integer,
  p_parcelas_upgrade jsonb
) returns uuid
language plpgsql volatile
set search_path = ''
as $$
declare
  a record;
  ass record;
  pr public.propostas;
  validos integer;
  conta uuid;
  novo uuid;
  item jsonb;
  faixa record;
  comissoes_upgrade integer := 0;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra pagamentos.';
  end if;
  select an.id, an.cidade_id, an.status, an.tipo, an.representante_id into a from public.anunciantes an where an.id = p_anunciante for update;
  if a.id is null then
    raise exception 'Anunciante não encontrado.';
  end if;
  if a.status not in ('aguardando_pagamento', 'publicado', 'pausado', 'escondido_por_vencimento') then
    raise exception 'O cadastro precisa estar aprovado para receber pagamento.';
  end if;
  if not exists (select 1 from public.planos p where p.id = p_plano and p.cidade_id = a.cidade_id and p.tipo = a.tipo and p.valor_mensal_centavos > 0) then
    raise exception 'Plano inválido para este anunciante.';
  end if;

  select s.vence_em into ass from public.assinaturas s where s.anunciante_id = p_anunciante;
  select count(*) into validos from public.pagamentos pg where pg.anunciante_id = p_anunciante and pg.devolvido_em is null and pg.tipo = 'plano';
  if validos + 1 <> p_numero or ass.vence_em is distinct from p_vence_anterior then
    raise exception 'Outro pagamento deste anunciante foi registrado agora. Atualize a página.';
  end if;

  if p_proposta is not null then
    pr := interno.proposta_para_pagar(p_proposta, p_anunciante, 'assinatura');
    if pr.plano_id <> p_plano or pr.periodicidade <> p_periodicidade or pr.representante_id is distinct from p_representante
       or pr.desconto_centavos <> coalesce(p_desconto_representante, 0) then
      raise exception 'O pagamento não confere com a proposta aceita.';
    end if;
  elsif coalesce(p_desconto_representante, 0) <> 0 then
    raise exception 'Desconto do representante só com a proposta aceita.';
  end if;

  select c.id into conta from public.contas_recebimento c
  where c.cidade_id = a.cidade_id and c.ativa and c.meio = case when p_forma = 'pix' then 'pix' else 'maquininha' end;
  if conta is null then
    raise exception 'Não há conta ativa para esta forma de pagamento.';
  end if;

  insert into public.pagamentos (
    cidade_id, anunciante_id, plano_id, periodicidade, numero, periodo_inicio, vence_em, valor_cheio_centavos,
    desconto_fundador_centavos, desconto_representante_centavos, valor_centavos, forma, parcelas, codigo_autorizacao, conta_id,
    pago_em, confirmado_em, comprovante_caminho, representante_id, tornou_fundador, observacao, registrado_por, proposta_id
  ) values (
    a.cidade_id, p_anunciante, p_plano, p_periodicidade, p_numero, p_periodo_inicio, p_vence_em, p_valor_cheio,
    p_desconto_fundador, coalesce(p_desconto_representante, 0), p_valor_cheio - p_desconto_fundador - coalesce(p_desconto_representante, 0),
    p_forma, p_parcelas, nullif(p_codigo_autorizacao, ''), conta, p_pago_em, p_confirmado_em, nullif(p_comprovante, ''),
    p_representante, p_tornou_fundador, coalesce(p_observacao, ''), auth.uid(), p_proposta
  ) returning id into novo;

  insert into public.assinaturas (anunciante_id, cidade_id, plano_id, periodicidade, ancora, vence_em, representante_id, plano_vendido_id)
  values (p_anunciante, a.cidade_id, p_plano, p_periodicidade, p_ancora, p_vence_em, p_representante, p_plano)
  on conflict (anunciante_id) do update
  set plano_id = excluded.plano_id, periodicidade = excluded.periodicidade, ancora = excluded.ancora,
      vence_em = excluded.vence_em, plano_seguinte_id = null,
      representante_id = coalesce(public.assinaturas.representante_id, excluded.representante_id);

  update public.anunciantes
  set plano_id = p_plano,
      plano_escolhido_id = p_plano,
      periodicidade_escolhida = p_periodicidade,
      fundador = p_fundador_desde is not null,
      fundador_desde = p_fundador_desde,
      status = case when status in ('aguardando_pagamento', 'escondido_por_vencimento') then 'publicado' else status end,
      aprovado_em = coalesce(aprovado_em, now()),
      aprovado_por = coalesce(aprovado_por, auth.uid())
  where id = p_anunciante;

  if p_comissao_valor is not null then
    if p_representante is null then
      raise exception 'Comissão sem representante.';
    end if;
    insert into public.comissoes (cidade_id, representante_id, pagamento_id, origem, base_centavos, percentual, valor_centavos, libera_em)
    values (a.cidade_id, p_representante, novo, 'plano', p_comissao_base, p_comissao_percentual, p_comissao_valor, p_comissao_libera_em);
  end if;

  -- Parcelas dos upgrades: a faixa precisa estar como o servidor leu.
  for item in select * from jsonb_array_elements(coalesce(p_parcelas_upgrade, '[]'::jsonb)) loop
    select u.* into faixa from public.upgrades u where u.id = (item ->> 'faixa')::uuid for update;
    if faixa.id is null or faixa.anunciante_id <> p_anunciante or faixa.cancelado_em is not null or faixa.concluida
       or faixa.parcelas_pagas <> (item ->> 'parcelasAntes')::integer then
      raise exception 'Outro pagamento deste anunciante foi registrado agora. Atualize a página.';
    end if;
    update public.upgrades set parcelas_pagas = (item ->> 'parcelasPagasDepois')::smallint, concluida = (item ->> 'concluida')::boolean
    where id = faixa.id;
    if (item ->> 'valor') is not null then
      insert into public.comissoes (cidade_id, representante_id, pagamento_id, upgrade_id, origem, base_centavos, percentual, valor_centavos, libera_em)
      values (a.cidade_id, faixa.representante_id, novo, faixa.id, 'upgrade', (item ->> 'base')::integer, (item ->> 'percentual')::numeric,
              (item ->> 'valor')::integer, p_comissao_libera_em);
      comissoes_upgrade := comissoes_upgrade + 1;
    end if;
  end loop;

  if p_carteira_valor is not null then
    if p_comissao_valor is not null or comissoes_upgrade > 0 then
      raise exception 'Um pagamento não gera comissão de venda e de carteira ao mesmo tempo.';
    end if;
    if p_carteira_representante is distinct from a.representante_id
       or not exists (select 1 from public.representantes r where r.id = p_carteira_representante and r.ativo and r.recebe_comissao) then
      raise exception 'A carteira é do representante ativo que trouxe o anunciante.';
    end if;
    insert into public.comissoes (cidade_id, representante_id, pagamento_id, origem, base_centavos, percentual, valor_centavos, libera_em)
    values (a.cidade_id, p_carteira_representante, novo, 'carteira', p_carteira_base, p_carteira_percentual, p_carteira_valor, p_comissao_libera_em);
  end if;

  if p_proposta is not null then
    update public.propostas set situacao = 'paga', pagamento_id = novo where id = p_proposta;
  end if;
  return novo;
end
$$;

revoke execute on function public.registrar_pagamento_plano(
  uuid, uuid, text, integer, date, date, date, date, integer, integer, public.forma_recebimento, integer, text, date, date, text, text,
  uuid, date, boolean, integer, numeric, integer, date, uuid, integer, numeric, integer, uuid, integer, jsonb
) from public, anon;
grant execute on function public.registrar_pagamento_plano(
  uuid, uuid, text, integer, date, date, date, date, integer, integer, public.forma_recebimento, integer, text, date, date, text, text,
  uuid, date, boolean, integer, numeric, integer, date, uuid, integer, numeric, integer, uuid, integer, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- Pagamento do upgrade
-- ---------------------------------------------------------------------------

/**
 * Mudança para um plano maior no meio do período (calcularPagamentoUpgrade):
 * grava o pagamento proporcional, muda o plano na hora (o vencimento não
 * muda), cria a faixa do representante e, se coube, a 1ª parcela (S7), ou a
 * carteira. p_faixa: {representante, diferenca, desconto, parcelasPagasDepois,
 * concluida, base, percentual, valor} ou null sem comissão de venda.
 */
create function public.registrar_pagamento_upgrade(
  p_anunciante uuid,
  p_plano uuid,
  p_proposta uuid,
  p_vence_atual date,
  p_valor integer,
  p_desconto_representante integer,
  p_forma public.forma_recebimento,
  p_parcelas integer,
  p_codigo_autorizacao text,
  p_pago_em date,
  p_confirmado_em date,
  p_comprovante text,
  p_observacao text,
  p_faixa jsonb,
  p_libera_em date,
  p_carteira_representante uuid,
  p_carteira_base integer,
  p_carteira_percentual numeric,
  p_carteira_valor integer
) returns uuid
language plpgsql volatile
set search_path = ''
as $$
declare
  a record;
  s record;
  pr public.propostas;
  conta uuid;
  novo uuid;
  faixa uuid;
  rep uuid := (p_faixa ->> 'representante')::uuid;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra pagamentos.';
  end if;
  select an.id, an.cidade_id, an.tipo, an.status, an.representante_id into a from public.anunciantes an where an.id = p_anunciante for update;
  if a.id is null or a.status not in ('publicado', 'pausado') then
    raise exception 'O anunciante precisa estar no ar, com o plano pago em dia, para mudar de plano.';
  end if;
  select ss.* into s from public.assinaturas ss where ss.anunciante_id = p_anunciante for update;
  if s.anunciante_id is null or s.vence_em is distinct from p_vence_atual then
    raise exception 'Outro pagamento deste anunciante foi registrado agora. Atualize a página.';
  end if;
  if p_pago_em >= s.vence_em then
    raise exception 'No dia do vencimento ou depois, registre a renovação já no plano novo.';
  end if;
  if not exists (
    select 1 from public.planos novo_p, public.planos atual_p
    where novo_p.id = p_plano and atual_p.id = s.plano_id and novo_p.cidade_id = a.cidade_id and novo_p.tipo = a.tipo
      and novo_p.valor_mensal_centavos > atual_p.valor_mensal_centavos
  ) then
    raise exception 'O plano novo precisa ser maior que o atual.';
  end if;

  if p_proposta is not null then
    pr := interno.proposta_para_pagar(p_proposta, p_anunciante, 'upgrade');
    if pr.plano_id <> p_plano or (rep is not null and rep <> pr.representante_id) or pr.desconto_centavos < coalesce(p_desconto_representante, 0) then
      raise exception 'O pagamento não confere com a proposta aceita.';
    end if;
  elsif coalesce(p_desconto_representante, 0) <> 0 or rep is not null then
    raise exception 'Comissão e desconto do representante só com a proposta aceita.';
  end if;

  select c.id into conta from public.contas_recebimento c
  where c.cidade_id = a.cidade_id and c.ativa and c.meio = case when p_forma = 'pix' then 'pix' else 'maquininha' end;
  if conta is null then
    raise exception 'Não há conta ativa para esta forma de pagamento.';
  end if;

  insert into public.pagamentos (
    cidade_id, anunciante_id, tipo, plano_id, plano_anterior_id, periodicidade, numero, periodo_inicio, vence_em,
    valor_cheio_centavos, desconto_fundador_centavos, desconto_representante_centavos, valor_centavos, forma, parcelas,
    codigo_autorizacao, conta_id, pago_em, confirmado_em, comprovante_caminho, representante_id, observacao, registrado_por, proposta_id
  ) values (
    a.cidade_id, p_anunciante, 'upgrade', p_plano, s.plano_id, s.periodicidade, 1, p_pago_em, s.vence_em,
    p_valor, 0, coalesce(p_desconto_representante, 0), p_valor - coalesce(p_desconto_representante, 0), p_forma, p_parcelas,
    nullif(p_codigo_autorizacao, ''), conta, p_pago_em, p_confirmado_em, nullif(p_comprovante, ''), rep, coalesce(p_observacao, ''),
    auth.uid(), p_proposta
  ) returning id into novo;

  update public.assinaturas set plano_id = p_plano, plano_seguinte_id = null where anunciante_id = p_anunciante;
  update public.anunciantes set plano_id = p_plano, plano_escolhido_id = p_plano where id = p_anunciante;

  if p_faixa is not null then
    insert into public.upgrades (cidade_id, anunciante_id, representante_id, proposta_id, pagamento_id, plano_id,
                                 diferenca_mensal_centavos, parcelas_pagas, concluida, desconto_centavos)
    values (a.cidade_id, p_anunciante, rep, p_proposta, novo, p_plano, (p_faixa ->> 'diferenca')::integer,
            (p_faixa ->> 'parcelasPagasDepois')::smallint, (p_faixa ->> 'concluida')::boolean, (p_faixa ->> 'desconto')::integer)
    returning id into faixa;
    if (p_faixa ->> 'valor') is not null then
      insert into public.comissoes (cidade_id, representante_id, pagamento_id, upgrade_id, origem, base_centavos, percentual, valor_centavos, libera_em)
      values (a.cidade_id, rep, novo, faixa, 'upgrade', (p_faixa ->> 'base')::integer, (p_faixa ->> 'percentual')::numeric,
              (p_faixa ->> 'valor')::integer, p_libera_em);
    end if;
  end if;

  if p_carteira_valor is not null then
    if (p_faixa ->> 'valor') is not null then
      raise exception 'Um pagamento não gera comissão de venda e de carteira ao mesmo tempo.';
    end if;
    if p_carteira_representante is distinct from a.representante_id
       or not exists (select 1 from public.representantes r where r.id = p_carteira_representante and r.ativo and r.recebe_comissao) then
      raise exception 'A carteira é do representante ativo que trouxe o anunciante.';
    end if;
    insert into public.comissoes (cidade_id, representante_id, pagamento_id, origem, base_centavos, percentual, valor_centavos, libera_em)
    values (a.cidade_id, p_carteira_representante, novo, 'carteira', p_carteira_base, p_carteira_percentual, p_carteira_valor, p_libera_em);
  end if;

  if p_proposta is not null then
    update public.propostas set situacao = 'paga', pagamento_id = novo where id = p_proposta;
  end if;
  return novo;
end
$$;

revoke execute on function public.registrar_pagamento_upgrade(
  uuid, uuid, uuid, date, integer, integer, public.forma_recebimento, integer, text, date, date, text, text, jsonb, date, uuid, integer, numeric, integer
) from public, anon;
grant execute on function public.registrar_pagamento_upgrade(
  uuid, uuid, uuid, date, integer, integer, public.forma_recebimento, integer, text, date, date, text, text, jsonb, date, uuid, integer, numeric, integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- Redução de plano agendada para o próximo vencimento (S2)
-- ---------------------------------------------------------------------------

/** Agenda (ou, com p_plano nulo, desfaz) a redução: o período pago continua no plano atual. */
create function public.agendar_reducao(p_anunciante uuid, p_plano uuid) returns void
language plpgsql volatile
set search_path = ''
as $$
declare
  s record;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração muda o plano.';
  end if;
  select ss.plano_id, ss.cidade_id into s from public.assinaturas ss where ss.anunciante_id = p_anunciante for update;
  if s.plano_id is null then
    raise exception 'Este anunciante não tem assinatura.';
  end if;
  if p_plano is not null and not exists (
    select 1 from public.planos novo_p, public.planos atual_p
    where novo_p.id = p_plano and atual_p.id = s.plano_id and novo_p.cidade_id = s.cidade_id and novo_p.tipo = atual_p.tipo
      and novo_p.ativo and novo_p.valor_mensal_centavos > 0 and novo_p.valor_mensal_centavos < atual_p.valor_mensal_centavos
  ) then
    raise exception 'Escolha um plano pago menor que o atual.';
  end if;
  update public.assinaturas set plano_seguinte_id = p_plano where anunciante_id = p_anunciante;
end
$$;

revoke execute on function public.agendar_reducao(uuid, uuid) from public, anon;
grant execute on function public.agendar_reducao(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Devolução e contestação do pagamento de upgrade: volta ao plano anterior
-- ---------------------------------------------------------------------------

/** Desfaz o upgrade: plano anterior de volta e faixa cancelada (as comissões o chamador já tratou). */
create function interno.desfazer_upgrade(p_pagamento uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  pg record;
begin
  select * into pg from public.pagamentos where id = p_pagamento;
  update public.assinaturas set plano_id = pg.plano_anterior_id where anunciante_id = pg.anunciante_id;
  update public.anunciantes set plano_id = pg.plano_anterior_id, plano_escolhido_id = pg.plano_anterior_id where id = pg.anunciante_id;
  update public.upgrades set cancelado_em = now() where pagamento_id = p_pagamento and cancelado_em is null;
end
$$;

create or replace function public.registrar_devolucao(p_pagamento uuid, p_motivo text) returns void
language plpgsql volatile
set search_path = ''
as $$
declare
  pg record;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra devoluções.';
  end if;
  select * into pg from public.pagamentos where id = p_pagamento for update;
  if pg.id is null or pg.devolvido_em is not null then
    raise exception 'Pagamento não encontrado ou já devolvido.';
  end if;
  if pg.numero <> 1 then
    raise exception 'Só o primeiro pagamento de uma contratação pode ser devolvido.';
  end if;
  if exists (select 1 from public.pagamentos o where o.anunciante_id = pg.anunciante_id and o.id <> pg.id and o.devolvido_em is null
             and (pg.tipo = 'plano' or o.registrado_em > pg.registrado_em)) then
    raise exception 'Há pagamentos seguintes deste anunciante. Fale com o responsável pelo sistema.';
  end if;
  if exists (select 1 from public.comissoes c where c.pagamento_id = p_pagamento and c.pagamento_representante_id is not null) then
    raise exception 'A comissão deste pagamento já foi paga ao representante. Registre como contestação.';
  end if;

  update public.pagamentos
  set devolvido_em = now(), devolvido_por = auth.uid(), motivo_devolucao = p_motivo, tipo_devolucao = 'devolucao'
  where id = p_pagamento;
  update public.comissoes set cancelada_em = now() where pagamento_id = p_pagamento and cancelada_em is null;
  if pg.tipo = 'upgrade' then
    perform interno.desfazer_upgrade(p_pagamento);
  else
    delete from public.assinaturas where anunciante_id = pg.anunciante_id;
    perform interno.tirar_plano(pg.anunciante_id, pg.tornou_fundador);
  end if;
end
$$;

/** Como antes (migration 20261027160000), com o upgrade desfeito e o desconto da faixa no lugar certo. */
create or replace function public.registrar_contestacao(p_pagamento uuid, p_motivo text) returns void
language plpgsql volatile
set search_path = ''
as $$
declare
  pg record;
  c record;
  anterior record;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra contestações.';
  end if;
  select * into pg from public.pagamentos where id = p_pagamento for update;
  if pg.id is null or pg.devolvido_em is not null then
    raise exception 'Pagamento não encontrado, já devolvido ou já contestado.';
  end if;
  if pg.forma = 'pix' then
    raise exception 'Só pagamento no cartão tem contestação.';
  end if;
  perform 1 from public.anunciantes where id = pg.anunciante_id for update;

  update public.pagamentos
  set devolvido_em = now(), devolvido_por = auth.uid(), motivo_devolucao = p_motivo, tipo_devolucao = 'contestacao'
  where id = p_pagamento;

  for c in select * from public.comissoes where pagamento_id = p_pagamento and cancelada_em is null and origem <> 'contestacao' loop
    if c.pagamento_representante_id is null then
      update public.comissoes set cancelada_em = now() where id = c.id;
    else
      insert into public.comissoes (cidade_id, representante_id, pagamento_id, upgrade_id, origem, base_centavos, percentual, valor_centavos, libera_em)
      values (c.cidade_id, c.representante_id, p_pagamento, c.upgrade_id, 'contestacao', c.base_centavos, c.percentual, -c.valor_centavos,
              (now() at time zone 'America/Sao_Paulo')::date);
    end if;
  end loop;

  if pg.tipo = 'upgrade' then
    perform interno.desfazer_upgrade(p_pagamento);
    return;
  end if;

  -- A assinatura só volta atrás quando o contestado é o último pagamento válido.
  if not exists (select 1 from public.pagamentos o where o.anunciante_id = pg.anunciante_id and o.devolvido_em is null and o.registrado_em > pg.registrado_em) then
    select o.vence_em into anterior from public.pagamentos o
    where o.anunciante_id = pg.anunciante_id and o.devolvido_em is null and o.tipo = 'plano'
    order by o.registrado_em desc limit 1;
    if anterior.vence_em is null then
      delete from public.assinaturas where anunciante_id = pg.anunciante_id;
    else
      update public.assinaturas set vence_em = anterior.vence_em where anunciante_id = pg.anunciante_id;
    end if;
  end if;
  perform interno.tirar_plano(pg.anunciante_id, pg.tornou_fundador);
end
$$;

-- ---------------------------------------------------------------------------
-- Perfil público: só o que cabe no plano em vigor
-- ---------------------------------------------------------------------------

/** Categorias que aparecem: a principal e as adicionais até o limite do plano (as outras ficam guardadas). */
create function interno.categorias_visiveis(p_anunciante uuid) returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select a.categoria_principal_id from public.anunciantes a where a.id = p_anunciante
  union all
  select x.categoria_id from (
    select ac.categoria_id
    from public.anunciantes a
    join public.anunciante_categorias ac on ac.anunciante_id = a.id
    join public.categorias c on c.id = ac.categoria_id
    left join public.planos p on p.id = a.plano_id
    where a.id = p_anunciante and c.id <> a.categoria_principal_id and c.ativa
    order by c.nome
    limit (select coalesce(p.limite_categorias_adicionais, 0) from public.anunciantes a2 left join public.planos p on p.id = a2.plano_id where a2.id = p_anunciante)
  ) x
$$;

create or replace function interno.anunciante_json(p_id uuid, p_completo boolean) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', a.id,
    'slug', a.slug,
    'cidadeId', ci.slug,
    'tipo', a.tipo,
    'origem', a.origem,
    -- Importado que já tem dono (convite enviado): some a seção "Este comércio é seu?".
    'assumido', a.usuario_id is not null,
    'nome', a.nome,
    'categoriaId', cp.slug_lista,
    -- Só as que cabem no plano em vigor (plano menor: o resto fica guardado).
    'categoriasAdicionais', coalesce((
      select jsonb_agg(c.slug_lista order by c.nome)
      from public.categorias c
      where c.id in (select interno.categorias_visiveis(a.id)) and c.id <> a.categoria_principal_id
    ), '[]'::jsonb),
    'planoId', p.codigo,
    'fundador', a.fundador,
    'descricao', a.descricao,
    'whatsapp', a.whatsapp,
    'telefone', a.telefone,
    'instagram', a.instagram,
    'formasPagamento', to_jsonb(a.formas_pagamento),
    'registroConselho', a.registro_conselho,
    'fotoPerfil', jsonb_build_object('id', a.id, 'caminho', (
      select interno.caminho_foto(f.chave, f.formato) from public.fotos f
      where f.anunciante_id = a.id and f.finalidade = 'perfil' and f.situacao = 'publicado'
      order by f.ordem limit 1
    )),
    'galeria', case when p_completo then coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'caminho', interno.caminho_foto(g.chave, g.formato), 'legenda', g.legenda, 'parId', g.par_id, 'papelNoPar', g.papel_no_par) order by g.ordem)
      from (
        select f.* from public.fotos f
        where f.anunciante_id = a.id and f.finalidade = 'galeria' and f.situacao = 'publicado'
        order by f.ordem
        limit coalesce(p.limite_fotos, 0)
      ) g
    ), '[]'::jsonb) else '[]'::jsonb end,
    'horario', case when p_completo then coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'intervalos', d.intervalos) order by d.dia)
      from (
        select h.dia_semana as dia,
          jsonb_agg(jsonb_build_object('abre', to_char(h.abre, 'HH24:MI'), 'fecha', to_char(h.fecha, 'HH24:MI')) order by h.abre) as intervalos
        from public.horarios h where h.anunciante_id = a.id
        group by h.dia_semana
      ) d
    ), '[]'::jsonb) else '[]'::jsonb end,
    'atendeTodaCidade', case when a.tipo = 'profissional' then a.atende_toda_cidade end,
    'bairrosAtendidos', case when a.tipo = 'profissional' then coalesce((
      select jsonb_agg(b.slug order by b.nome)
      from public.anunciante_bairros ab join public.bairros b on b.id = ab.bairro_id
      where ab.anunciante_id = a.id and ab.finalidade = 'atendimento'
    ), '[]'::jsonb) end,
    'enderecos', case when a.tipo = 'comercio' then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', e.id,
        'logradouro', e.logradouro,
        'numero', e.numero,
        'complemento', e.complemento,
        'bairroId', e.bairro_slug,
        'latitude', extensions.st_y(e.local::extensions.geometry),
        'longitude', extensions.st_x(e.local::extensions.geometry)
      )) order by e.principal desc, e.criado_em)
      from (
        select en.*, b.slug as bairro_slug
        from public.enderecos en join public.bairros b on b.id = en.bairro_id
        where en.anunciante_id = a.id
        order by en.principal desc, en.criado_em
        limit coalesce(p.limite_enderecos, 1)
      ) e
    ), '[]'::jsonb) end,
    'encartes', case when a.tipo = 'comercio' then '[]'::jsonb end,
    'produtos', case when a.tipo = 'comercio' then '[]'::jsonb end,
    'entrega', case when a.tipo = 'comercio' and a.faz_entrega then jsonb_build_object(
      'todaCidade', a.entrega_toda_cidade,
      'bairros', coalesce((
        select jsonb_agg(b.slug order by b.nome)
        from public.anunciante_bairros ab join public.bairros b on b.id = ab.bairro_id
        where ab.anunciante_id = a.id and ab.finalidade = 'entrega'
      ), '[]'::jsonb)
    ) end,
    'siteProprio', case when a.tipo = 'comercio' then a.site_proprio end
  ))
  from public.anunciantes a
  join public.cidades ci on ci.id = a.cidade_id
  join public.categorias cp on cp.id = a.categoria_principal_id
  left join public.planos p on p.id = a.plano_id
  where a.id = p_id and a.status = 'publicado'
$$;

/** Como antes (migration 20261023100000); a busca por categoria só acha as categorias que cabem no plano. */
create or replace function public.anunciantes_publicos(
  p_cidade text,
  p_categorias text[] default null,
  p_termo text default null,
  p_so_fundadores boolean default false,
  p_limite integer default 500
) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(interno.anunciante_json(x.id, false) order by x.nome), '[]'::jsonb)
  from (
    select a.id, a.nome
    from public.anunciantes a
    join public.cidades c on c.id = a.cidade_id
    where c.slug = p_cidade
      and a.status = 'publicado'
      and (not p_so_fundadores or a.fundador)
      and (
        (p_categorias is null and p_termo is null)
        or exists (
          select 1 from public.categorias cat
          where cat.slug_lista = any (p_categorias) and cat.cidade_id = c.id
            and cat.id in (select interno.categorias_visiveis(a.id))
        )
        or (length(trim(coalesce(p_termo, ''))) >= 2
          -- % e _ digitados valem como texto, não como curinga.
          and interno.normalizar(a.nome) like
            '%' || replace(replace(replace(interno.normalizar(p_termo), '\', '\\'), '%', '\%'), '_', '\_') || '%')
      )
    order by a.nome
    limit least(greatest(p_limite, 1), 1000)
  ) x
$$;

-- ---------------------------------------------------------------------------
-- Leitura das propostas com os nomes (anunciante, plano e representante)
-- ---------------------------------------------------------------------------

/**
 * Propostas que quem chama pode ver: o representante, as que fez; o dono do
 * perfil, as do anunciante dele; a administração, todas. p_anunciante e
 * p_situacao filtram (nulos: sem filtro). Sem dados de contato.
 */
create function public.propostas_visiveis(p_anunciante uuid default null, p_situacao text default null) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id, 'tipo', pr.tipo, 'situacao', pr.situacao, 'periodicidade', pr.periodicidade,
    'anuncianteId', pr.anunciante_id, 'anunciante', a.nome, 'anuncianteSlug', a.slug,
    'planoId', pr.plano_id, 'plano', p.nome, 'valorMensalCentavos', pr.valor_mensal_centavos,
    'mesesCobradosNoAnual', pr.meses_cobrados_no_anual, 'descontoCentavos', pr.desconto_centavos,
    'representanteId', pr.representante_id, 'representante', coalesce(nullif(pu.nome, ''), r.codigo),
    'criadaEm', pr.criada_em, 'expiraEm', pr.expira_em, 'aceitaEm', pr.aceita_em, 'pagamentoId', pr.pagamento_id
  ) order by pr.criada_em desc), '[]'::jsonb)
  from public.propostas pr
  join public.anunciantes a on a.id = pr.anunciante_id
  join public.planos p on p.id = pr.plano_id
  join public.representantes r on r.id = pr.representante_id
  left join public.perfis_usuario pu on pu.usuario_id = r.usuario_id
  where (p_anunciante is null or pr.anunciante_id = p_anunciante)
    and (p_situacao is null or pr.situacao = p_situacao)
    and (interno.eh_admin()
      or pr.representante_id = interno.meu_representante_id()
      or (a.usuario_id = auth.uid() and interno.tem_papel('anunciante')))
$$;

revoke execute on function public.propostas_visiveis(uuid, text) from public, anon;
grant execute on function public.propostas_visiveis(uuid, text) to authenticated;
