-- Pagamento antes do aceite (decisão de 17/11/2026, na primeira venda):
-- - o pagamento do plano pode ser registrado depois do convite, antes do
--   aceite ("Aguardando o anunciante" e "Em análise"). O anúncio só aparece
--   depois do aceite e da aprovação da equipe. Quem pagou continua com 7 dias
--   do pagamento para desistir (podeDevolver e DIAS_PARA_DESISTIR, em
--   packages/domain). Sem o aceite, a responsabilidade é do anunciante, que
--   pode pedir ajuda à equipe;
-- - o anunciante recebe um e-mail com o pagamento, a validade e o prazo para
--   desistir;
-- - o vencimento diário vale também para quem pagou e ainda não foi aprovado
--   (efeitoDoVencimento em packages/domain/cobranca.ts): o autônomo fica sem
--   plano e, aprovado, espera um novo pagamento; o comércio vai para o
--   Gratuito; o Fundador perde a condição;
-- - "Recusar" não vale para cadastro com pagamento não devolvido.
-- Correção: desde 20261028110000 a trava de aviso repetido é um índice
-- parcial (sem as propostas), e o "on conflict" sem o "where" do índice não o
-- encontra. Os lembretes de vencimento falhavam todo dia, e o vencimento e o
-- aviso de novo preço falhariam no primeiro aviso.

-- ---------------------------------------------------------------------------
-- E-mail do pagamento recebido antes do aceite
-- ---------------------------------------------------------------------------

alter table public.avisos_email drop constraint avisos_email_tipo_check;
alter table public.avisos_email add constraint avisos_email_tipo_check
  check (tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'plano_vencido', 'aviso_preco', 'escala_fundador', 'proposta', 'denuncia',
                  'pagamento_antes_do_aceite'));

/**
 * Põe na fila o e-mail ao anunciante que pagou antes do aceite: o valor, o
 * dia em que a validade começa e até quando pode desistir (7 dias do
 * pagamento, como DIAS_PARA_DESISTIR em packages/domain).
 */
create function interno.avisar_pagamento_antes_do_aceite(p_pagamento uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra pagamentos.';
  end if;
  insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
  select pg.cidade_id, a.id, 'pagamento_antes_do_aceite', pg.pago_em, u.email,
         interno.dados_do_aviso(a.id) || jsonb_build_object(
           'valorCentavos', pg.valor_centavos,
           'pagoEm', pg.pago_em,
           'periodoInicio', pg.periodo_inicio,
           'desistirAte', pg.pago_em + 7),
         0
  from public.pagamentos pg
  join public.anunciantes a on a.id = pg.anunciante_id
  join auth.users u on u.id = a.usuario_id
  where pg.id = p_pagamento and u.email is not null
  on conflict (anunciante_id, tipo, referencia) where tipo <> 'proposta' do nothing;
end
$$;

revoke execute on function interno.avisar_pagamento_antes_do_aceite(uuid) from public, anon;
grant execute on function interno.avisar_pagamento_antes_do_aceite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Registro do pagamento do plano
-- ---------------------------------------------------------------------------

create or replace function public.registrar_pagamento_plano(
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
  -- Descontos prometidos nos upgrades que saem neste pagamento (com a 1ª parcela, decisão S7).
  desconto_faixas integer := coalesce((select sum(coalesce((i ->> 'desconto')::integer, 0)) from jsonb_array_elements(coalesce(p_parcelas_upgrade, '[]'::jsonb)) i), 0);
  desconto_venda integer := coalesce(p_desconto_representante, 0) - desconto_faixas;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra pagamentos.';
  end if;
  select an.id, an.cidade_id, an.status, an.tipo, an.representante_id into a from public.anunciantes an where an.id = p_anunciante for update;
  if a.id is null then
    raise exception 'Anunciante não encontrado.';
  end if;
  -- Antes da aprovação, só depois do convite: o anunciante precisa ter como aceitar.
  if a.status = 'rascunho' then
    raise exception 'Envie o convite ao anunciante antes de registrar o pagamento.';
  end if;
  if a.status not in ('aguardando_anunciante', 'em_analise', 'aguardando_pagamento', 'publicado', 'pausado', 'escondido_por_vencimento') then
    raise exception 'Este cadastro não recebe pagamento na situação atual.';
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
       or pr.desconto_centavos <> desconto_venda then
      raise exception 'O pagamento não confere com a proposta aceita.';
    end if;
  elsif desconto_venda <> 0 then
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
      -- Pago antes do aceite: a aprovação continua sendo da equipe, depois do aceite.
      aprovado_em = case when status in ('aguardando_anunciante', 'em_analise') then aprovado_em else coalesce(aprovado_em, now()) end,
      aprovado_por = case when status in ('aguardando_anunciante', 'em_analise') then aprovado_por else coalesce(aprovado_por, auth.uid()) end
  where id = p_anunciante;

  if a.status in ('aguardando_anunciante', 'em_analise') then
    perform interno.avisar_pagamento_antes_do_aceite(novo);
  end if;

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
    if coalesce((item ->> 'desconto')::integer, 0) > 0
       and (faixa.parcelas_pagas <> 0 or (item ->> 'desconto')::integer > faixa.desconto_centavos) then
      raise exception 'O desconto do upgrade só sai na 1ª parcela e até o valor prometido na proposta.';
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

-- ---------------------------------------------------------------------------
-- "Recusar" com pagamento registrado
-- ---------------------------------------------------------------------------

/** O cadastro com pagamento não devolvido não volta para rascunho: a equipe registra a devolução antes. */
create function interno.impedir_recusa_com_pagamento() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.pagamentos pg where pg.anunciante_id = new.id and pg.devolvido_em is null) then
    raise exception 'Este cadastro tem pagamento registrado: registre a devolução antes de recusar.';
  end if;
  return new;
end
$$;

create trigger impedir_recusa_com_pagamento before update of status on public.anunciantes
for each row
when (new.status = 'rascunho' and old.status <> 'rascunho')
execute function interno.impedir_recusa_com_pagamento();

-- ---------------------------------------------------------------------------
-- Vencimento: também para quem pagou e ainda não foi aprovado
-- ---------------------------------------------------------------------------

/**
 * Plano vencido e não pago na tolerância (situacaoCobranca = 'vencida'),
 * pelas regras de efeitoDoVencimento: o autônomo publicado sai do ar; o
 * autônomo ainda não aprovado (pagou antes do aceite) fica sem plano e,
 * aprovado, espera um novo pagamento; o comércio vai para o Gratuito; o
 * Fundador perde a condição de vez (perdeCondicaoFundador). Rodar de novo no
 * mesmo dia não muda nada. Devolve quantos anunciantes mudaram.
 */
create or replace function interno.aplicar_vencimentos() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  hoje date := interno.hoje();
  r record;
  gratuito uuid;
  aprovado boolean;
  mudou integer := 0;
  email text;
begin
  for r in
    select a.id, a.tipo, a.status, a.plano_id, a.fundador, a.cidade_id, a.usuario_id, s.vence_em
    from public.assinaturas s
    join public.anunciantes a on a.id = s.anunciante_id
    where hoje > s.vence_em + interno.tolerancia_vencimento(s.cidade_id)
      and a.status in ('publicado', 'pausado', 'escondido_por_vencimento', 'aguardando_anunciante', 'em_analise')
    for update of a
  loop
    aprovado := r.status not in ('aguardando_anunciante', 'em_analise');
    gratuito := null;
    if r.tipo = 'comercio' then
      select p.id into gratuito from public.planos p
      where p.cidade_id = r.cidade_id and p.tipo = 'comercio' and p.ativo and p.valor_mensal_centavos = 0
      order by p.nivel limit 1;
    end if;
    -- Já aplicado: autônomo escondido (ou sem plano, antes da aprovação), comércio no Gratuito, e sem Fundador.
    continue when not r.fundador
      and ((r.tipo = 'profissional' and (r.status = 'escondido_por_vencimento' or (not aprovado and r.plano_id is null)))
           or (r.tipo = 'comercio' and r.plano_id is not distinct from gratuito));

    update public.anunciantes
    set status = case when r.tipo = 'profissional' and aprovado then 'escondido_por_vencimento' else status end,
        plano_id = case
          when r.tipo = 'comercio' and gratuito is not null then gratuito
          when r.tipo = 'profissional' and not aprovado then null
          else plano_id
        end,
        fundador = false,
        fundador_desde = null
    where id = r.id;
    mudou := mudou + 1;

    select u.email into email from auth.users u where u.id = r.usuario_id;
    if email is not null then
      insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
      values (r.cidade_id, r.id, 'plano_vencido', r.vence_em, email,
              interno.dados_do_aviso(r.id) || jsonb_build_object('eraFundador', r.fundador, 'antesDaAprovacao', not aprovado), 2)
      on conflict (anunciante_id, tipo, referencia) where tipo <> 'proposta' do nothing;
    end if;
  end loop;
  return mudou;
end
$$;

/** Lembretes de 7 dias antes e do dia do vencimento (item 4.15). Devolve quantos entraram na fila. */
create or replace function interno.enfileirar_lembretes() returns integer
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
  on conflict (anunciante_id, tipo, referencia) where tipo <> 'proposta' do nothing;
  get diagnostics quantos = row_count;
  return quantos;
end
$$;

/**
 * Põe na fila o aviso de novo preço de cada assinante: a partir de qual
 * vencimento e quanto ele vai pagar (p_avisos: [{anuncianteId, aPartirDe,
 * valorCentavos}], calculados por avisoDePreco). Sai antes dos lembretes.
 * Devolve quantos entraram.
 */
create or replace function public.avisar_novo_preco(p_avisos jsonb) returns integer
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
    on conflict (anunciante_id, tipo, referencia) where tipo <> 'proposta' do update
    set dados = excluded.dados, para = excluded.para, situacao = 'pendente', tentativas = 0, erro = null, criado_em = now(), enviado_em = null;
    if found then
      quantos := quantos + 1;
    end if;
  end loop;
  return quantos;
end
$$;
