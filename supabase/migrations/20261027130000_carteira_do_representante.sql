-- Carteira do representante (decisões N1 a N3, de 27/10/2026): sobre todo
-- pagamento do anunciante que ele trouxe e que já não está na fase de venda
-- (depois dos 135% do plano, ou depois do 1º mês de um extra), o representante
-- recebe 5%, enquanto estiver ativo. O percentual fica nas configurações,
-- editável na administração. Quando o representante sai (desativado ou com o
-- papel trocado), a carteira acaba: os anunciantes dele ficam sem
-- representante e as parcelas de venda ainda não pagas pelo anunciante deixam
-- de gerar comissão. As comissões já geradas continuam valendo.

alter table public.comissoes drop constraint comissoes_origem_check;
alter table public.comissoes add constraint comissoes_origem_check check (origem in ('plano', 'extra', 'patrocinio', 'upgrade', 'carteira'));

insert into public.configuracoes (cidade_id, chave, valor)
values ((select id from public.cidades where slug = 'rio-das-ostras'), 'percentual_carteira', '5'::jsonb);

-- ---------------------------------------------------------------------------
-- Representante que sai: a carteira acaba
-- ---------------------------------------------------------------------------

create function interno.encerrar_carteira() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform set_config('app.vinculo_convite', 'sim', true);
  -- Os rascunhos sem conta ligada continuam com ele, para a equipe decidir o que fazer.
  update public.anunciantes set representante_id = null where representante_id = new.id and usuario_id is not null;
  update public.assinaturas set representante_id = null where representante_id = new.id;
  perform set_config('app.vinculo_convite', '', true);
  return null;
end
$$;

create trigger encerrar_carteira after update of ativo on public.representantes
for each row when (old.ativo and not new.ativo)
execute function interno.encerrar_carteira();

-- ---------------------------------------------------------------------------
-- Registro do pagamento, agora com a comissão de carteira
-- ---------------------------------------------------------------------------

drop function public.registrar_pagamento_plano(
  uuid, uuid, text, integer, date, date, date, date, integer, integer, public.forma_recebimento, integer, text, date, date, text, text,
  uuid, date, boolean, integer, numeric, integer, date
);

/**
 * Grava o pagamento do plano, a assinatura, o plano em vigor, o Fundador, a
 * publicação do perfil e as comissões (de venda e de carteira), numa
 * transação. Os valores vêm do servidor (calcularPagamentoPlano, em
 * packages/domain). O banco confere que ninguém registrou outro pagamento do
 * mesmo anunciante no meio do caminho (número e vencimento anterior esperados)
 * e que a carteira é do representante ativo que trouxe o anunciante.
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
  p_carteira_valor integer
) returns uuid
language plpgsql volatile
set search_path = ''
as $$
declare
  a record;
  ass record;
  validos integer;
  conta uuid;
  novo uuid;
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
  select count(*) into validos from public.pagamentos pg where pg.anunciante_id = p_anunciante and pg.devolvido_em is null;
  if validos + 1 <> p_numero or ass.vence_em is distinct from p_vence_anterior then
    raise exception 'Outro pagamento deste anunciante foi registrado agora. Atualize a página.';
  end if;

  select c.id into conta from public.contas_recebimento c
  where c.cidade_id = a.cidade_id and c.ativa and c.meio = case when p_forma = 'pix' then 'pix' else 'maquininha' end;
  if conta is null then
    raise exception 'Não há conta ativa para esta forma de pagamento.';
  end if;

  insert into public.pagamentos (
    cidade_id, anunciante_id, plano_id, periodicidade, numero, periodo_inicio, vence_em, valor_cheio_centavos,
    desconto_fundador_centavos, valor_centavos, forma, parcelas, codigo_autorizacao, conta_id, pago_em, confirmado_em,
    comprovante_caminho, representante_id, tornou_fundador, observacao, registrado_por
  ) values (
    a.cidade_id, p_anunciante, p_plano, p_periodicidade, p_numero, p_periodo_inicio, p_vence_em, p_valor_cheio,
    p_desconto_fundador, p_valor_cheio - p_desconto_fundador, p_forma, p_parcelas, nullif(p_codigo_autorizacao, ''), conta, p_pago_em,
    p_confirmado_em, nullif(p_comprovante, ''), p_representante, p_tornou_fundador, coalesce(p_observacao, ''), auth.uid()
  ) returning id into novo;

  insert into public.assinaturas (anunciante_id, cidade_id, plano_id, periodicidade, ancora, vence_em, representante_id)
  values (p_anunciante, a.cidade_id, p_plano, p_periodicidade, p_ancora, p_vence_em, p_representante)
  on conflict (anunciante_id) do update
  set plano_id = excluded.plano_id, periodicidade = excluded.periodicidade, ancora = excluded.ancora,
      vence_em = excluded.vence_em, representante_id = coalesce(public.assinaturas.representante_id, excluded.representante_id);

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

  if p_carteira_valor is not null then
    if p_comissao_valor is not null then
      raise exception 'Um pagamento não gera comissão de venda e de carteira ao mesmo tempo.';
    end if;
    if p_carteira_representante is distinct from a.representante_id
       or not exists (select 1 from public.representantes r where r.id = p_carteira_representante and r.ativo and r.recebe_comissao) then
      raise exception 'A carteira é do representante ativo que trouxe o anunciante.';
    end if;
    insert into public.comissoes (cidade_id, representante_id, pagamento_id, origem, base_centavos, percentual, valor_centavos, libera_em)
    values (a.cidade_id, p_carteira_representante, novo, 'carteira', p_carteira_base, p_carteira_percentual, p_carteira_valor, p_comissao_libera_em);
  end if;
  return novo;
end
$$;

revoke execute on function public.registrar_pagamento_plano(
  uuid, uuid, text, integer, date, date, date, date, integer, integer, public.forma_recebimento, integer, text, date, date, text, text,
  uuid, date, boolean, integer, numeric, integer, date, uuid, integer, numeric, integer
) from public, anon;
grant execute on function public.registrar_pagamento_plano(
  uuid, uuid, text, integer, date, date, date, date, integer, integer, public.forma_recebimento, integer, text, date, date, text, text,
  uuid, date, boolean, integer, numeric, integer, date, uuid, integer, numeric, integer
) to authenticated;
