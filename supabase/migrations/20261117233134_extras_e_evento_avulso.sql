-- Contratação de extras e pagamento do evento avulso (decisões B3, P1 a P4 e
-- E1 a E3 de 17/11/2026):
-- - extras no catálogo: Agenda (comércios, R$ 39,90 por mês, anual de 10
--   mensalidades, com desconto de Fundador) e Evento avulso (R$ 49,90 por
--   bloco de 7 dias, sem desconto de Fundador, cobrança "por evento");
-- - extras_contratados: cada extra tem vencimento próprio, no mesmo dia do mês
--   (ou do ano) em que foi pago (B3), também para quem tem plano pago;
-- - pagamentos (P1): a mesma tabela recebe o pagamento do extra e o do evento
--   avulso, com a fila, os totais por conta, a devolução e a comissão num
--   lugar só. O evento avulso é pago pelo evento, porque o produtor pode não
--   ser anunciante (B5);
-- - comissão de extra (20%) com atendimento de representante e carteira (5%)
--   sem ele; desconto do representante só no 1º pagamento da venda;
-- - devolução: o extra, no 1º pagamento da contratação, em até 7 dias; o
--   evento avulso, até 7 dias depois do pagamento e até a véspera do primeiro
--   dia do evento (E1); a contestação no cartão encerra o extra;
-- - vencimento diário: o extra que vence e não é renovado na tolerância
--   (7 dias) acaba (E2), com aviso; lembretes de 7 dias antes e do dia;
-- - Agenda: o comércio aparece com o Premium ou com o extra Agenda em dia; o
--   evento avulso, com cortesia ou com todos os blocos pagos; as datas de um
--   evento pago só mudam dentro dos blocos pagos (E3).
-- As contas (período, Fundador, valores, comissões) são feitas no servidor
-- pelas regras de packages/domain/extras.ts, testadas; o banco grava numa
-- transação e confere o que dá para conferir. Regras de vencimento repetidas
-- aqui em SQL, como as do plano (decisão Q1): mudou uma, muda a outra.

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

alter table public.extras drop constraint extras_cobranca_check;
alter table public.extras
  add constraint extras_cobranca_check check (cobranca in ('mensal', 'por_dia', 'por_evento')),
  -- Extras que só fazem sentido para comércios (o autônomo não tem loja, vitrine, encarte nem Agenda própria).
  add column so_comercio boolean not null default false;

update public.extras set so_comercio = true
where codigo in ('encarte-adicional', 'pacote-produtos', 'endereco-adicional');

insert into public.extras (cidade_id, codigo, nome, descricao, unidade, valor_mensal_centavos, cobranca,
                           aceita_desconto_fundador, permite_anual, meses_cobrados_no_anual, so_comercio, regras)
select c.id, n.codigo, n.nome, n.descricao, n.unidade, n.valor, n.cobranca, n.fundador, n.anual, 10, n.so_comercio, n.regras::jsonb
from public.cidades c,
  (values
    ('agenda', 'Agenda',
     'Os shows e eventos do seu comércio no seu perfil e na Agenda do site, quantos quiser. Já vem no plano Premium.',
     null, 3990, 'mensal', true, true, true, '{}'),
    ('evento-avulso', 'Evento avulso',
     'Festa, feira, festival ou show na Agenda do site, com programação e barracas, quantos dias e atrações quiser dentro do período.',
     'por bloco de 7 dias', 4990, 'por_evento', false, false, false, '{"dias_por_bloco":7}')
  ) as n (codigo, nome, descricao, unidade, valor, cobranca, fundador, anual, so_comercio, regras)
where c.slug = 'rio-das-ostras';

-- ---------------------------------------------------------------------------
-- Extras contratados
-- ---------------------------------------------------------------------------

create table public.extras_contratados (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  -- Registro financeiro: não some com o cadastro (como os pagamentos).
  anunciante_id uuid not null references public.anunciantes (id) on delete restrict,
  extra_id uuid not null references public.extras (id),
  periodicidade text not null check (periodicidade in ('mensal', 'anual')),
  -- Dia em que a contratação começou: os vencimentos caem sempre nesse dia (B3).
  ancora date not null,
  vence_em date not null check (vence_em > ancora),
  -- Representante que atendeu a venda (recebe a comissão do 1º pagamento).
  representante_id uuid references public.representantes (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  motivo_encerramento text check (motivo_encerramento in ('vencimento', 'devolucao', 'contestacao')),
  check ((encerrado_em is null) = (motivo_encerramento is null))
);
-- Um extra em vigor de cada tipo por anunciante.
create unique index extras_contratados_em_vigor on public.extras_contratados (anunciante_id, extra_id) where encerrado_em is null;
create index extras_contratados_vence_em_idx on public.extras_contratados (cidade_id, vence_em) where encerrado_em is null;

create trigger marcar_atualizacao before update on public.extras_contratados for each row execute function interno.marcar_atualizacao();
create trigger auditar after insert or update or delete on public.extras_contratados for each row execute function interno.auditar();

alter table public.extras_contratados enable row level security;
create policy "visitante sem acesso" on public.extras_contratados as restrictive for all to anon using (false) with check (false);
create policy "administrador lê e altera" on public.extras_contratados for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
create policy "anunciante lê os próprios extras" on public.extras_contratados for select to authenticated
  using ((select interno.tem_papel('anunciante')) and exists (
    select 1 from public.anunciantes a where a.id = anunciante_id and a.usuario_id = (select auth.uid())));
create policy "representante lê os extras dos que trouxe" on public.extras_contratados for select to authenticated
  using (exists (
    select 1 from public.anunciantes a where a.id = anunciante_id and a.representante_id = (select interno.meu_representante_id())));

-- ---------------------------------------------------------------------------
-- Pagamentos: extra e evento avulso
-- ---------------------------------------------------------------------------

alter table public.pagamentos drop constraint pagamentos_tipo_check;
alter table public.pagamentos
  alter column plano_id drop not null,
  alter column anunciante_id drop not null,
  alter column periodicidade drop not null,
  add column extra_contratado_id uuid references public.extras_contratados (id),
  add column evento_id uuid references public.eventos (id) on delete restrict,
  -- Blocos de 7 dias que o pagamento do evento avulso cobre.
  add column blocos smallint check (blocos > 0),
  add constraint pagamentos_tipo_check check (tipo in ('plano', 'upgrade', 'extra', 'evento')),
  add constraint pagamentos_plano_do_tipo check ((tipo in ('plano', 'upgrade')) = (plano_id is not null)),
  add constraint pagamentos_extra_do_tipo check ((tipo = 'extra') = (extra_contratado_id is not null)),
  add constraint pagamentos_evento_do_tipo check ((tipo = 'evento') = (evento_id is not null) and (tipo = 'evento') = (blocos is not null)),
  -- O evento avulso não tem periodicidade; o produtor pode não ser anunciante.
  add constraint pagamentos_periodicidade_do_tipo check ((tipo = 'evento') = (periodicidade is null)),
  add constraint pagamentos_anunciante_do_tipo check (tipo = 'evento' or anunciante_id is not null);
create index pagamentos_extra_idx on public.pagamentos (extra_contratado_id) where extra_contratado_id is not null;
create index pagamentos_evento_idx on public.pagamentos (evento_id) where evento_id is not null;

/** Conta que recebe pela forma de pagamento (Pix ou maquininha). */
create function interno.conta_da_forma(p_cidade uuid, p_forma public.forma_recebimento) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  conta uuid;
begin
  select c.id into conta from public.contas_recebimento c
  where c.cidade_id = p_cidade and c.ativa and c.meio = case when p_forma = 'pix' then 'pix' else 'maquininha' end;
  if conta is null then
    raise exception 'Não há conta ativa para esta forma de pagamento.';
  end if;
  return conta;
end
$$;

/** Comissão de venda (20%) e de carteira de um pagamento de extra ou de evento, com as mesmas travas do plano. */
create function interno.gravar_comissoes_do_extra(
  p_pagamento uuid,
  p_cidade uuid,
  p_representante_do_anunciante uuid,
  p_representante uuid,
  p_comissao_base integer,
  p_comissao_percentual numeric,
  p_comissao_valor integer,
  p_comissao_libera_em date,
  p_carteira_representante uuid,
  p_carteira_base integer,
  p_carteira_percentual numeric,
  p_carteira_valor integer
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_comissao_valor is not null then
    if p_representante is null then
      raise exception 'Comissão sem representante.';
    end if;
    insert into public.comissoes (cidade_id, representante_id, pagamento_id, origem, base_centavos, percentual, valor_centavos, libera_em)
    values (p_cidade, p_representante, p_pagamento, 'extra', p_comissao_base, p_comissao_percentual, p_comissao_valor, p_comissao_libera_em);
  end if;
  if p_carteira_valor is not null then
    -- O pagamento com atendimento é a venda, recebendo ou não quem atendeu.
    if p_representante is not null then
      raise exception 'Um pagamento não gera comissão de venda e de carteira ao mesmo tempo.';
    end if;
    if p_carteira_representante is distinct from p_representante_do_anunciante
       or not exists (select 1 from public.representantes r where r.id = p_carteira_representante and r.ativo and r.recebe_comissao) then
      raise exception 'A carteira é do representante ativo que trouxe o anunciante.';
    end if;
    insert into public.comissoes (cidade_id, representante_id, pagamento_id, origem, base_centavos, percentual, valor_centavos, libera_em)
    values (p_cidade, p_carteira_representante, p_pagamento, 'carteira', p_carteira_base, p_carteira_percentual, p_carteira_valor, p_comissao_libera_em);
  end if;
end
$$;

/**
 * Grava o pagamento de um extra mensal (ou anual) e a contratação dele, com
 * as comissões, numa transação. p_contratacao: a contratação em vigor que o
 * pagamento renova, ou null para uma contratação nova (a primeira, ou depois
 * da tolerância, quando a antiga acaba aqui mesmo se o vencimento diário
 * ainda não passou). Os valores vêm de calcularPagamentoExtra (packages/domain).
 */
create function public.registrar_pagamento_extra(
  p_anunciante uuid,
  p_extra uuid,
  p_contratacao uuid,
  p_periodicidade text,
  p_numero integer,
  p_vence_anterior date,
  p_ancora date,
  p_periodo_inicio date,
  p_vence_em date,
  p_valor_cheio integer,
  p_desconto_fundador integer,
  p_desconto_representante integer,
  p_forma public.forma_recebimento,
  p_parcelas integer,
  p_codigo_autorizacao text,
  p_pago_em date,
  p_confirmado_em date,
  p_comprovante text,
  p_observacao text,
  p_representante uuid,
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
  e record;
  atual record;
  validos integer;
  contratacao uuid := p_contratacao;
  novo uuid;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra pagamentos.';
  end if;
  select an.id, an.cidade_id, an.status, an.tipo, an.representante_id into a from public.anunciantes an where an.id = p_anunciante for update;
  if a.id is null then
    raise exception 'Anunciante não encontrado.';
  end if;
  if a.status not in ('aguardando_anunciante', 'em_analise', 'aguardando_pagamento', 'publicado', 'pausado', 'escondido_por_vencimento') then
    raise exception 'Este cadastro não recebe pagamento na situação atual.';
  end if;
  select x.* into e from public.extras x where x.id = p_extra and x.cidade_id = a.cidade_id;
  if e.id is null or not e.ativo or e.cobranca <> 'mensal' or e.valor_mensal_centavos <= 0 then
    raise exception 'Extra inválido para contratação mensal.';
  end if;
  if e.so_comercio and a.tipo <> 'comercio' then
    raise exception 'Este extra é só para comércios.';
  end if;
  if p_periodicidade = 'anual' and not e.permite_anual then
    raise exception 'Este extra só pode ser contratado mês a mês.';
  end if;
  if coalesce(p_desconto_representante, 0) > 0 and (p_representante is null or p_numero <> 1) then
    raise exception 'O desconto do representante só vale no 1º pagamento de uma venda com atendimento.';
  end if;

  -- A contratação em vigor precisa estar como o servidor leu.
  select c.* into atual from public.extras_contratados c
  where c.anunciante_id = p_anunciante and c.extra_id = p_extra and c.encerrado_em is null for update;
  if contratacao is null then
    if atual.id is not null then
      if p_pago_em <= atual.vence_em + interno.tolerancia_vencimento(a.cidade_id) then
        raise exception 'O anunciante já tem este extra: registre a renovação.';
      end if;
      update public.extras_contratados set encerrado_em = now(), motivo_encerramento = 'vencimento' where id = atual.id;
    end if;
    if p_numero <> 1 or p_vence_anterior is not null then
      raise exception 'Outro pagamento deste extra foi registrado agora. Atualize a página.';
    end if;
  else
    select count(*) into validos from public.pagamentos pg where pg.extra_contratado_id = contratacao and pg.devolvido_em is null;
    if atual.id is distinct from contratacao or atual.vence_em is distinct from p_vence_anterior or validos + 1 <> p_numero then
      raise exception 'Outro pagamento deste extra foi registrado agora. Atualize a página.';
    end if;
  end if;

  if contratacao is null then
    insert into public.extras_contratados (cidade_id, anunciante_id, extra_id, periodicidade, ancora, vence_em, representante_id)
    values (a.cidade_id, p_anunciante, p_extra, p_periodicidade, p_ancora, p_vence_em, p_representante)
    returning id into contratacao;
  else
    update public.extras_contratados
    set periodicidade = p_periodicidade, vence_em = p_vence_em, representante_id = coalesce(representante_id, p_representante)
    where id = contratacao;
  end if;

  insert into public.pagamentos (
    cidade_id, anunciante_id, tipo, extra_contratado_id, periodicidade, numero, periodo_inicio, vence_em, valor_cheio_centavos,
    desconto_fundador_centavos, desconto_representante_centavos, valor_centavos, forma, parcelas, codigo_autorizacao, conta_id,
    pago_em, confirmado_em, comprovante_caminho, representante_id, observacao, registrado_por
  ) values (
    a.cidade_id, p_anunciante, 'extra', contratacao, p_periodicidade, p_numero, p_periodo_inicio, p_vence_em, p_valor_cheio,
    p_desconto_fundador, coalesce(p_desconto_representante, 0), p_valor_cheio - p_desconto_fundador - coalesce(p_desconto_representante, 0),
    p_forma, p_parcelas, nullif(p_codigo_autorizacao, ''), interno.conta_da_forma(a.cidade_id, p_forma), p_pago_em, p_confirmado_em,
    nullif(p_comprovante, ''), p_representante, coalesce(p_observacao, ''), auth.uid()
  ) returning id into novo;

  perform interno.gravar_comissoes_do_extra(novo, a.cidade_id, a.representante_id, p_representante, p_comissao_base, p_comissao_percentual,
    p_comissao_valor, p_comissao_libera_em, p_carteira_representante, p_carteira_base, p_carteira_percentual, p_carteira_valor);
  return novo;
end
$$;

/** Blocos de 7 dias de um evento, do primeiro ao último dia (blocosDoEventoAvulso em packages/domain). */
create function interno.blocos_do_evento(p_inicio date, p_fim date) returns integer
language sql immutable
as $$ select ceil((p_fim - p_inicio + 1) / 7.0)::integer $$;

/** Blocos já pagos do evento avulso (pagamentos não devolvidos). */
create function interno.blocos_pagos_do_evento(p_evento uuid) returns integer
language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum(pg.blocos), 0)::integer from public.pagamentos pg where pg.evento_id = p_evento and pg.devolvido_em is null
$$;

/**
 * Grava o pagamento do evento avulso (os blocos que faltam pagar) e as
 * comissões. p_data_inicio e p_data_fim são as datas que o pagamento cobre:
 * no pagamento complementar (E3), as datas novas do evento, gravadas aqui
 * junto com o pagamento. Os valores vêm de calcularPagamentoEvento (packages/domain).
 */
create function public.registrar_pagamento_evento(
  p_evento uuid,
  p_data_inicio date,
  p_data_fim date,
  p_numero integer,
  p_blocos integer,
  p_valor_cheio integer,
  p_desconto_representante integer,
  p_forma public.forma_recebimento,
  p_parcelas integer,
  p_codigo_autorizacao text,
  p_pago_em date,
  p_confirmado_em date,
  p_comprovante text,
  p_observacao text,
  p_representante uuid,
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
  ev record;
  representante_do_anunciante uuid;
  validos integer;
  ja_pagos integer;
  valor_bloco integer;
  novo uuid;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra pagamentos.';
  end if;
  select e.* into ev from public.eventos e where e.id = p_evento for update;
  if ev.id is null or ev.origem <> 'avulso' then
    raise exception 'Só o evento avulso é pago por bloco de 7 dias.';
  end if;
  if ev.situacao = 'cancelado' then
    raise exception 'Este evento foi cancelado.';
  end if;
  if p_data_fim < interno.hoje() then
    raise exception 'Este evento já terminou.';
  end if;
  select x.valor_mensal_centavos into valor_bloco from public.extras x
  where x.cidade_id = ev.cidade_id and x.codigo = 'evento-avulso' and x.ativo;
  if valor_bloco is null then
    raise exception 'O evento avulso está desligado no catálogo.';
  end if;

  select count(*) into validos from public.pagamentos pg where pg.evento_id = p_evento and pg.devolvido_em is null;
  ja_pagos := interno.blocos_pagos_do_evento(p_evento);
  if validos + 1 <> p_numero or ja_pagos + p_blocos <> interno.blocos_do_evento(p_data_inicio, p_data_fim) then
    raise exception 'Outro pagamento deste evento foi registrado agora, ou as datas mudaram. Atualize a página.';
  end if;
  if p_valor_cheio <> p_blocos * valor_bloco then
    raise exception 'O valor não confere com o preço do bloco no catálogo. Atualize a página.';
  end if;
  if coalesce(p_desconto_representante, 0) > 0 and p_representante is null then
    raise exception 'O desconto do representante só vale numa venda com atendimento.';
  end if;
  if ev.anunciante_id is not null then
    select an.representante_id into representante_do_anunciante from public.anunciantes an where an.id = ev.anunciante_id;
  end if;

  insert into public.pagamentos (
    cidade_id, anunciante_id, tipo, evento_id, blocos, numero, periodo_inicio, vence_em, valor_cheio_centavos,
    desconto_representante_centavos, valor_centavos, forma, parcelas, codigo_autorizacao, conta_id,
    pago_em, confirmado_em, comprovante_caminho, representante_id, observacao, registrado_por
  ) values (
    ev.cidade_id, ev.anunciante_id, 'evento', p_evento, p_blocos, p_numero, p_data_inicio,
    p_data_inicio + (ja_pagos + p_blocos) * 7, p_valor_cheio, coalesce(p_desconto_representante, 0),
    p_valor_cheio - coalesce(p_desconto_representante, 0), p_forma, p_parcelas, nullif(p_codigo_autorizacao, ''),
    interno.conta_da_forma(ev.cidade_id, p_forma), p_pago_em, p_confirmado_em, nullif(p_comprovante, ''), p_representante,
    coalesce(p_observacao, ''), auth.uid()
  ) returning id into novo;

  perform interno.gravar_comissoes_do_extra(novo, ev.cidade_id, representante_do_anunciante, p_representante, p_comissao_base,
    p_comissao_percentual, p_comissao_valor, p_comissao_libera_em, p_carteira_representante, p_carteira_base, p_carteira_percentual,
    p_carteira_valor);
  -- As datas mudam depois do pagamento, para a trava dos blocos (interno.conferir_blocos_do_evento) já contar com ele.
  if p_data_inicio <> ev.data_inicio or p_data_fim <> ev.data_fim then
    update public.eventos set data_inicio = p_data_inicio, data_fim = p_data_fim where id = p_evento;
  end if;
  return novo;
end
$$;

revoke execute on function interno.conta_da_forma(uuid, public.forma_recebimento) from public, anon, authenticated;
revoke execute on function interno.gravar_comissoes_do_extra(uuid, uuid, uuid, uuid, integer, numeric, integer, date, uuid, integer, numeric, integer) from public, anon, authenticated;
revoke execute on function interno.blocos_pagos_do_evento(uuid) from public, anon;
grant execute on function interno.blocos_pagos_do_evento(uuid) to authenticated;
revoke execute on function public.registrar_pagamento_extra(uuid, uuid, uuid, text, integer, date, date, date, date, integer, integer, integer,
  public.forma_recebimento, integer, text, date, date, text, text, uuid, integer, numeric, integer, date, uuid, integer, numeric, integer) from public, anon;
grant execute on function public.registrar_pagamento_extra(uuid, uuid, uuid, text, integer, date, date, date, date, integer, integer, integer,
  public.forma_recebimento, integer, text, date, date, text, text, uuid, integer, numeric, integer, date, uuid, integer, numeric, integer) to authenticated;
revoke execute on function public.registrar_pagamento_evento(uuid, date, date, integer, integer, integer, integer, public.forma_recebimento, integer, text,
  date, date, text, text, uuid, integer, numeric, integer, date, uuid, integer, numeric, integer) from public, anon;
grant execute on function public.registrar_pagamento_evento(uuid, date, date, integer, integer, integer, integer, public.forma_recebimento, integer, text,
  date, date, text, text, uuid, integer, numeric, integer, date, uuid, integer, numeric, integer) to authenticated;
-- As funções internas de gravação rodam dentro das públicas, com as permissões de quem chama (o administrador).
grant execute on function interno.conta_da_forma(uuid, public.forma_recebimento) to authenticated;
grant execute on function interno.gravar_comissoes_do_extra(uuid, uuid, uuid, uuid, integer, numeric, integer, date, uuid, integer, numeric, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Devolução e contestação
-- ---------------------------------------------------------------------------

/**
 * Como antes (migration 20261028110000) para o plano e o upgrade, olhando só
 * os pagamentos do plano. Extra: o 1º pagamento da contratação, sem
 * pagamentos seguintes dela; a contratação acaba. Evento avulso: até 7 dias
 * depois do pagamento e até a véspera do primeiro dia do evento (E1); sem os
 * blocos pagos, o evento sai da Agenda (interno.evento_liberado). O prazo de
 * 7 dias é conferido no servidor (podeDevolver e podeDevolverEvento).
 */
create or replace function public.registrar_devolucao(p_pagamento uuid, p_motivo text) returns void
language plpgsql volatile
set search_path = ''
as $$
declare
  pg record;
  inicio_evento date;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra devoluções.';
  end if;
  select * into pg from public.pagamentos where id = p_pagamento for update;
  if pg.id is null or pg.devolvido_em is not null then
    raise exception 'Pagamento não encontrado ou já devolvido.';
  end if;
  if pg.tipo <> 'evento' and pg.numero <> 1 then
    raise exception 'Só o primeiro pagamento de uma contratação pode ser devolvido.';
  end if;
  if pg.tipo in ('plano', 'upgrade') and exists (
       select 1 from public.pagamentos o
       where o.anunciante_id = pg.anunciante_id and o.id <> pg.id and o.devolvido_em is null and o.tipo in ('plano', 'upgrade')
         and (pg.tipo = 'plano' or o.registrado_em > pg.registrado_em)) then
    raise exception 'Há pagamentos seguintes deste anunciante. Fale com o responsável pelo sistema.';
  end if;
  if pg.tipo = 'extra' and exists (
       select 1 from public.pagamentos o where o.extra_contratado_id = pg.extra_contratado_id and o.id <> pg.id and o.devolvido_em is null) then
    raise exception 'Há pagamentos seguintes deste extra. Fale com o responsável pelo sistema.';
  end if;
  if pg.tipo = 'evento' then
    select e.data_inicio into inicio_evento from public.eventos e where e.id = pg.evento_id;
    if interno.hoje() >= inicio_evento then
      raise exception 'O evento já começou: não há mais devolução.';
    end if;
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
  elsif pg.tipo = 'plano' then
    delete from public.assinaturas where anunciante_id = pg.anunciante_id;
    perform interno.tirar_plano(pg.anunciante_id, pg.tornou_fundador);
  elsif pg.tipo = 'extra' then
    update public.extras_contratados set encerrado_em = now(), motivo_encerramento = 'devolucao'
    where id = pg.extra_contratado_id and encerrado_em is null;
  end if;
end
$$;

/**
 * Como antes (migration 20261028110000) para o plano e o upgrade, olhando só
 * os pagamentos do plano. Extra: a contratação acaba, como o plano sai na
 * contestação. Evento avulso: os blocos do pagamento deixam de valer.
 */
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
  if pg.anunciante_id is not null then
    perform 1 from public.anunciantes where id = pg.anunciante_id for update;
  end if;

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

  if pg.tipo = 'extra' then
    update public.extras_contratados set encerrado_em = now(), motivo_encerramento = 'contestacao'
    where id = pg.extra_contratado_id and encerrado_em is null;
    return;
  end if;
  if pg.tipo = 'evento' then
    return;
  end if;
  if pg.tipo = 'upgrade' then
    perform interno.desfazer_upgrade(p_pagamento);
    return;
  end if;

  -- A assinatura só volta atrás quando o contestado é o último pagamento válido do plano.
  if not exists (select 1 from public.pagamentos o where o.anunciante_id = pg.anunciante_id and o.devolvido_em is null
                 and o.tipo in ('plano', 'upgrade') and o.registrado_em > pg.registrado_em) then
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
-- Negociações: o pagamento de extra e de evento fica fora (entram com as propostas de extras, B6)
-- ---------------------------------------------------------------------------

create or replace function interno.pagamento_na_negociacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tipo text := case when new.tipo = 'upgrade' then 'upgrade' else 'assinatura' end;
  atendeu uuid;
begin
  if new.tipo not in ('plano', 'upgrade') then
    return null;
  end if;
  if new.representante_id is not null then
    select r.usuario_id into atendeu from public.representantes r where r.id = new.representante_id;
  end if;
  update public.negociacoes n
  set situacao = 'ganha', pagamento_id = new.id, fechada_em = now(), fechada_por = new.registrado_por,
      responsavel_id = coalesce(atendeu, n.responsavel_id), proxima_acao_em = null, proxima_acao = ''
  where n.anunciante_id = new.anunciante_id and n.tipo = v_tipo and n.situacao = 'aberta';
  if not found and (new.tipo = 'upgrade' or new.numero = 1) then
    insert into public.negociacoes (cidade_id, anunciante_id, tipo, responsavel_id, situacao, pagamento_id, fechada_em, fechada_por)
    values (new.cidade_id, new.anunciante_id, v_tipo, coalesce(atendeu, new.registrado_por), 'ganha', new.id, now(), new.registrado_por);
  end if;
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- Comissões que o representante vê: com o nome do evento avulso
-- ---------------------------------------------------------------------------

create or replace function public.minhas_comissoes()
returns table (
  id uuid, origem text, descricao text, base_centavos integer, percentual numeric, valor_centavos integer,
  libera_em date, cancelada boolean, pago_em date, criado_em timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select c.id, c.origem, coalesce(a.nome, ev.nome, pt.nome, ''), c.base_centavos, c.percentual, c.valor_centavos,
         c.libera_em, c.cancelada_em is not null, pr.pago_em, c.criado_em
  from public.comissoes c
  left join public.pagamentos pg on pg.id = c.pagamento_id
  left join public.anunciantes a on a.id = pg.anunciante_id
  left join public.eventos ev on ev.id = pg.evento_id
  left join public.patrocinios pt on pt.id = c.patrocinio_id
  left join public.pagamentos_representante pr on pr.id = c.pagamento_representante_id
  where c.representante_id = interno.meu_representante_id()
  order by c.criado_em desc
$$;

-- ---------------------------------------------------------------------------
-- Agenda: quem aparece e as datas do evento pago
-- ---------------------------------------------------------------------------

/**
 * Como antes (migration 20261117173424), com o extra Agenda em vigor para o
 * comércio e os blocos pagos para o evento avulso. Repete
 * impedimentoParaAparecerNaAgenda (packages/domain/agenda.ts).
 */
create or replace function interno.evento_liberado(p_evento uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case e.origem
      when 'orgao_publico' then true
      when 'avulso' then e.cortesia_em is not null
        or interno.blocos_pagos_do_evento(e.id) >= interno.blocos_do_evento(e.data_inicio, e.data_fim)
      when 'comercio' then exists (
        select 1 from public.anunciantes a
        join public.planos p on p.id = a.plano_id
        where a.id = e.anunciante_id and a.status = 'publicado'
          and (p.inclui_agenda or exists (
            select 1 from public.extras_contratados c
            join public.extras x on x.id = c.extra_id and x.codigo = 'agenda'
            where c.anunciante_id = a.id and c.encerrado_em is null))
      )
      when 'artista' then exists (
        select 1 from public.anunciantes a
        join public.categorias c on c.cidade_id = a.cidade_id and c.slug_lista = 'musicos-e-bandas'
        where a.id = e.anunciante_id and a.status = 'publicado'
          and (a.categoria_principal_id = c.id
               or exists (select 1 from public.anunciante_categorias ac where ac.anunciante_id = a.id and ac.categoria_id = c.id))
      )
    end
    from public.eventos e
    where e.id = p_evento
  ), false)
$$;

/** Evento avulso pago: as datas só mudam dentro dos blocos pagos (E3); o que passar é um pagamento complementar. */
create function interno.conferir_blocos_do_evento() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  pagos integer := interno.blocos_pagos_do_evento(new.id);
begin
  if pagos > 0 and interno.blocos_do_evento(new.data_inicio, new.data_fim) > pagos then
    raise exception 'As datas novas passam dos % bloco(s) de 7 dias já pago(s). Registre o pagamento dos blocos que faltam.', pagos;
  end if;
  if pagos > 0 and new.origem <> 'avulso' then
    raise exception 'Este evento tem pagamento de evento avulso: a origem não muda.';
  end if;
  return new;
end
$$;
create trigger conferir_blocos before update of data_inicio, data_fim, origem on public.eventos
for each row execute function interno.conferir_blocos_do_evento();

-- ---------------------------------------------------------------------------
-- Vencimento dos extras e avisos
-- ---------------------------------------------------------------------------

alter table public.avisos_email drop constraint avisos_email_tipo_check;
alter table public.avisos_email add constraint avisos_email_tipo_check
  check (tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'plano_vencido', 'aviso_preco', 'escala_fundador', 'proposta', 'denuncia',
                  'pagamento_antes_do_aceite', 'extra_lembrete_7_dias', 'extra_lembrete_vencimento', 'extra_vencido'));

/** Nome do anunciante e os extras que vencem num dia, para o texto do e-mail. */
create function interno.dados_do_aviso_de_extras(p_anunciante uuid, p_vence_em date, p_so_em_vigor boolean) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nome', a.nome,
    'tipo', a.tipo,
    'slug', a.slug,
    'venceEm', p_vence_em,
    'extras', coalesce((
      select jsonb_agg(jsonb_build_object('nome', x.nome, 'periodicidade', c.periodicidade) order by x.nome)
      from public.extras_contratados c
      join public.extras x on x.id = c.extra_id
      where c.anunciante_id = a.id and c.vence_em = p_vence_em
        and (c.encerrado_em is null) = p_so_em_vigor
        and (p_so_em_vigor or c.motivo_encerramento = 'vencimento')
    ), '[]'::jsonb)
  )
  from public.anunciantes a
  where a.id = p_anunciante
$$;

/**
 * Extra vencido e não renovado na tolerância (E2): a contratação acaba e o
 * anunciante recebe um aviso (um por dia de vencimento, com todos os extras
 * dele). Rodar de novo no mesmo dia não muda nada. Devolve quantos acabaram.
 */
create function interno.aplicar_vencimentos_extras() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  hoje date := interno.hoje();
  quantos integer;
begin
  with vencidos as (
    update public.extras_contratados c
    set encerrado_em = now(), motivo_encerramento = 'vencimento'
    where c.encerrado_em is null and hoje > c.vence_em + interno.tolerancia_vencimento(c.cidade_id)
    returning c.cidade_id, c.anunciante_id, c.vence_em
  )
  select count(*) into quantos from vencidos;

  insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
  select distinct on (c.anunciante_id, c.vence_em)
         c.cidade_id, c.anunciante_id, 'extra_vencido', c.vence_em, u.email,
         interno.dados_do_aviso_de_extras(c.anunciante_id, c.vence_em, false), 2
  from public.extras_contratados c
  join public.anunciantes a on a.id = c.anunciante_id
  join auth.users u on u.id = a.usuario_id
  where c.motivo_encerramento = 'vencimento' and c.encerrado_em >= now() - interval '1 day'
    and u.email is not null
    -- Quem já contratou de novo (pagamento depois da tolerância) não recebe o aviso.
    and not exists (select 1 from public.extras_contratados n
                    where n.anunciante_id = c.anunciante_id and n.extra_id = c.extra_id and n.encerrado_em is null)
  on conflict (anunciante_id, tipo, referencia) where tipo <> 'proposta' do nothing;
  return quantos;
end
$$;

/** Lembretes de 7 dias antes e do dia do vencimento dos extras. Devolve quantos entraram na fila. */
create function interno.enfileirar_lembretes_extras() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  hoje date := interno.hoje();
  quantos integer;
begin
  insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
  select distinct on (c.anunciante_id, c.vence_em)
         c.cidade_id, c.anunciante_id,
         case when c.vence_em = hoje then 'extra_lembrete_vencimento' else 'extra_lembrete_7_dias' end,
         c.vence_em, u.email, interno.dados_do_aviso_de_extras(c.anunciante_id, c.vence_em, true), 1
  from public.extras_contratados c
  join public.anunciantes a on a.id = c.anunciante_id
  join auth.users u on u.id = a.usuario_id
  where c.encerrado_em is null and c.vence_em in (hoje, hoje + 7)
    and a.status in ('publicado', 'pausado')
    and u.email is not null
  on conflict (anunciante_id, tipo, referencia) where tipo <> 'proposta' do nothing;
  get diagnostics quantos = row_count;
  return quantos;
end
$$;

revoke execute on function interno.dados_do_aviso_de_extras(uuid, date, boolean) from public, anon, authenticated;
revoke execute on function interno.aplicar_vencimentos_extras() from public, anon, authenticated;
revoke execute on function interno.enfileirar_lembretes_extras() from public, anon, authenticated;

-- Logo depois do vencimento e dos lembretes do plano (horários em UTC: Brasília é UTC-3).
select cron.schedule('vencimento-dos-extras', '5 9 * * *', 'select interno.aplicar_vencimentos_extras()');
select cron.schedule('lembretes-dos-extras', '5 11 * * *', 'select interno.enfileirar_lembretes_extras()');
