-- O desconto que o representante promete num upgrade sai no pagamento que leva
-- a 1ª parcela da faixa (decisão S7): no mensal, na renovação seguinte. A
-- função de 20261028110000 só aceitava desconto com a proposta de assinatura;
-- agora o desconto do pagamento é o da venda (proposta) mais o das faixas, e
-- cada faixa só dá desconto na 1ª parcela e até o valor prometido.

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
