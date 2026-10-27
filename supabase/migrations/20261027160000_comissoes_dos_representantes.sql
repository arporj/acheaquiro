-- Comissões dos representantes (plano 3A, decisões de 27/10/2026):
-- - pagamento ao representante: sempre o saldo liberado inteiro (P2), com a
--   chave Pix do momento, o comprovante opcional e o registro de atividades;
-- - contestação no cartão: o pagamento passa a valer como devolvido (P1: o
--   plano sai como na devolução); a comissão ainda não paga é cancelada e a já
--   paga vira um desconto no próximo pagamento ao representante;
-- - comissão de patrocínio: 20% para o representante que atendeu o
--   patrocinador, gravada junto com o pagamento do patrocínio;
-- - o representante que vendeu e saiu antes do 1º pagamento recebe a comissão
--   dele (P3): o anunciante só perde o representante depois desse pagamento;
-- - a lista de comissões do representante, com o nome do anunciante ou do
--   patrocinador (ele não lê pagamentos nem patrocínios).

-- ---------------------------------------------------------------------------
-- Pagamento ao representante
-- ---------------------------------------------------------------------------

create table public.pagamentos_representante (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  representante_id uuid not null references public.representantes (id),
  valor_centavos integer not null check (valor_centavos > 0),
  pago_em date not null,
  -- Chave Pix usada, como estava no dia (o representante pode trocar depois).
  chave_pix text not null check (length(chave_pix) between 1 and 100),
  comprovante_caminho text check (comprovante_caminho ~ '^representantes/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|pdf)$'),
  observacao text not null default '' check (length(observacao) <= 300),
  registrado_por uuid not null references auth.users (id),
  registrado_em timestamptz not null default now()
);
create index pagamentos_representante_idx on public.pagamentos_representante (representante_id, pago_em);

create trigger auditar after insert or update or delete on public.pagamentos_representante for each row execute function interno.auditar();

alter table public.pagamentos_representante enable row level security;
create policy "visitante sem acesso" on public.pagamentos_representante as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso" on public.pagamentos_representante for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
create policy "representante lê os próprios" on public.pagamentos_representante for select to authenticated
  using (representante_id = (select interno.meu_representante_id()));
create policy "administrador lê e altera" on public.pagamentos_representante for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- ---------------------------------------------------------------------------
-- Comissões: patrocínio, contestação e pagamento ao representante
-- ---------------------------------------------------------------------------

alter table public.comissoes
  alter column pagamento_id drop not null,
  add column patrocinio_id uuid references public.patrocinios (id) on delete restrict,
  add column pagamento_representante_id uuid references public.pagamentos_representante (id);
alter table public.comissoes drop constraint comissoes_origem_check;
alter table public.comissoes drop constraint comissoes_valor_centavos_check;
alter table public.comissoes
  add constraint comissoes_origem_check check (origem in ('plano', 'extra', 'patrocinio', 'upgrade', 'carteira', 'contestacao')),
  -- A contestação é um desconto: valor negativo, descontado do próximo pagamento.
  add constraint comissoes_valor_check check (case when origem = 'contestacao' then valor_centavos < 0 else valor_centavos > 0 end),
  add constraint comissoes_de_onde check ((pagamento_id is null) <> (patrocinio_id is null)),
  add constraint comissoes_paga_ou_cancelada check (not (pagamento_representante_id is not null and cancelada_em is not null));
create unique index comissoes_patrocinio_unica on public.comissoes (patrocinio_id) where patrocinio_id is not null;
create index comissoes_a_pagar_idx on public.comissoes (representante_id) where pagamento_representante_id is null and cancelada_em is null;

alter table public.patrocinios add column representante_id uuid references public.representantes (id);

-- ---------------------------------------------------------------------------
-- Contestação no cartão
-- ---------------------------------------------------------------------------

alter table public.pagamentos add column tipo_devolucao text check (tipo_devolucao in ('devolucao', 'contestacao'));
update public.pagamentos set tipo_devolucao = 'devolucao' where devolvido_em is not null;
alter table public.pagamentos add constraint pagamentos_tipo_devolucao check ((devolvido_em is null) = (tipo_devolucao is null));
-- A contestação pode tirar um pagamento do meio da sequência: o número deixa de ser único.
drop index public.pagamentos_numero_valido;

/**
 * Plano que sai por devolução ou contestação (decisões de 27/10/2026): o
 * comércio volta ao Gratuito, o autônomo sai do ar aguardando um novo
 * pagamento e o Fundador ganho com o pagamento acaba.
 */
create function interno.tirar_plano(p_anunciante uuid, p_tornou_fundador boolean) returns void
language plpgsql
set search_path = ''
as $$
declare
  a record;
  gratuito uuid;
begin
  select an.id, an.tipo, an.cidade_id into a from public.anunciantes an where an.id = p_anunciante for update;
  if a.tipo = 'comercio' then
    select p.id into gratuito from public.planos p
    where p.cidade_id = a.cidade_id and p.tipo = 'comercio' and p.ativo and p.valor_mensal_centavos = 0
    order by p.nivel limit 1;
    if gratuito is null then
      raise exception 'A cidade não tem plano Gratuito de comércio ativo.';
    end if;
  end if;
  update public.anunciantes
  set plano_id = gratuito,
      fundador = case when p_tornou_fundador then false else fundador end,
      fundador_desde = case when p_tornou_fundador then null else fundador_desde end,
      status = case when a.tipo = 'profissional' and status in ('publicado', 'pausado', 'escondido_por_vencimento') then 'aguardando_pagamento' else status end
  where id = p_anunciante;
end
$$;

/** Devolução do primeiro pagamento, como antes, agora com o tipo e a saída do plano em interno.tirar_plano. */
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
  if exists (select 1 from public.pagamentos o where o.anunciante_id = pg.anunciante_id and o.id <> pg.id and o.devolvido_em is null) then
    raise exception 'Há pagamentos seguintes deste anunciante. Fale com o responsável pelo sistema.';
  end if;
  if exists (select 1 from public.comissoes c where c.pagamento_id = p_pagamento and c.pagamento_representante_id is not null) then
    raise exception 'A comissão deste pagamento já foi paga ao representante. Registre como contestação.';
  end if;

  update public.pagamentos
  set devolvido_em = now(), devolvido_por = auth.uid(), motivo_devolucao = p_motivo, tipo_devolucao = 'devolucao'
  where id = p_pagamento;
  update public.comissoes set cancelada_em = now() where pagamento_id = p_pagamento and cancelada_em is null;
  delete from public.assinaturas where anunciante_id = pg.anunciante_id;
  perform interno.tirar_plano(pg.anunciante_id, pg.tornou_fundador);
end
$$;

/**
 * Contestação de um pagamento no cartão: o pagamento passa a valer como
 * devolvido, o plano sai (como na devolução), a comissão ainda não paga é
 * cancelada e a já paga vira um desconto no próximo pagamento ao
 * representante. Se era o último pagamento, a assinatura volta ao vencimento
 * anterior (ou é apagada, sem outro pagamento).
 */
create function public.registrar_contestacao(p_pagamento uuid, p_motivo text) returns void
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
      insert into public.comissoes (cidade_id, representante_id, pagamento_id, origem, base_centavos, percentual, valor_centavos, libera_em)
      values (c.cidade_id, c.representante_id, p_pagamento, 'contestacao', c.base_centavos, c.percentual, -c.valor_centavos,
              (now() at time zone 'America/Sao_Paulo')::date);
    end if;
  end loop;

  -- A assinatura só volta atrás quando o contestado é o último pagamento válido.
  if not exists (select 1 from public.pagamentos o where o.anunciante_id = pg.anunciante_id and o.devolvido_em is null and o.registrado_em > pg.registrado_em) then
    select o.vence_em into anterior from public.pagamentos o
    where o.anunciante_id = pg.anunciante_id and o.devolvido_em is null
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

revoke execute on function public.registrar_contestacao(uuid, text) from public, anon;
grant execute on function public.registrar_contestacao(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Representante que vendeu e saiu antes do 1º pagamento (P3)
-- ---------------------------------------------------------------------------

/** A saída só tira o representante dos anunciantes que já pagaram; os outros esperam o 1º pagamento. */
create or replace function interno.encerrar_carteira() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform set_config('app.vinculo_convite', 'sim', true);
  update public.anunciantes a set representante_id = null
  where a.representante_id = new.id and a.usuario_id is not null
    and exists (select 1 from public.assinaturas s where s.anunciante_id = a.id);
  perform set_config('app.vinculo_convite', '', true);
  return null;
end
$$;

/** Depois do 1º pagamento, o anunciante de um representante que já saiu fica sem representante. */
create function interno.desligar_representante_inativo() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform set_config('app.vinculo_convite', 'sim', true);
  update public.anunciantes a set representante_id = null
  where a.id = new.anunciante_id
    and exists (select 1 from public.representantes r where r.id = a.representante_id and not r.ativo);
  perform set_config('app.vinculo_convite', '', true);
  return null;
end
$$;

create trigger desligar_representante_inativo after insert on public.pagamentos
for each row execute function interno.desligar_representante_inativo();

-- ---------------------------------------------------------------------------
-- Pagamento do saldo ao representante
-- ---------------------------------------------------------------------------

/**
 * Registra o pagamento do saldo liberado inteiro (decisão P2). O servidor
 * manda as comissões que considera liberadas (situacaoComissao, em
 * packages/domain) e o total; o banco confere que são do representante, não
 * pagas, não canceladas, já liberadas e que o total bate.
 */
create function public.registrar_pagamento_representante(
  p_representante uuid,
  p_comissoes uuid[],
  p_valor integer,
  p_pago_em date,
  p_comprovante text,
  p_observacao text
) returns uuid
language plpgsql volatile
set search_path = ''
as $$
declare
  rep record;
  total integer;
  quantas integer;
  novo uuid;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra pagamentos aos representantes.';
  end if;
  select r.id, r.cidade_id, r.chave_pix into rep from public.representantes r where r.id = p_representante for update;
  if rep.id is null then
    raise exception 'Representante não encontrado.';
  end if;
  if rep.chave_pix is null then
    raise exception 'O representante ainda não informou a chave Pix na área dele.';
  end if;
  select coalesce(sum(c.valor_centavos), 0), count(*) into total, quantas
  from public.comissoes c
  where c.id = any (p_comissoes) and c.representante_id = p_representante
    and c.pagamento_representante_id is null and c.cancelada_em is null
    and c.libera_em <= (now() at time zone 'America/Sao_Paulo')::date;
  if quantas <> coalesce(array_length(p_comissoes, 1), 0) or total <> p_valor then
    raise exception 'O saldo do representante mudou. Atualize a página.';
  end if;
  if total <= 0 then
    raise exception 'Não há saldo a pagar.';
  end if;

  insert into public.pagamentos_representante (cidade_id, representante_id, valor_centavos, pago_em, chave_pix, comprovante_caminho, observacao, registrado_por)
  values (rep.cidade_id, p_representante, total, p_pago_em, rep.chave_pix, nullif(p_comprovante, ''), coalesce(p_observacao, ''), auth.uid())
  returning id into novo;
  update public.comissoes set pagamento_representante_id = novo where id = any (p_comissoes);
  return novo;
end
$$;

revoke execute on function public.registrar_pagamento_representante(uuid, uuid[], integer, date, text, text) from public, anon;
grant execute on function public.registrar_pagamento_representante(uuid, uuid[], integer, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pagamento do patrocínio com a comissão de quem atendeu
-- ---------------------------------------------------------------------------

/**
 * Grava (ou corrige) o pagamento do patrocínio e a comissão do representante
 * que atendeu (20%, calculada no servidor). Comissão já paga ao representante
 * trava a mudança do valor e do representante.
 */
create function public.registrar_pagamento_patrocinio(
  p_patrocinio uuid,
  p_valor integer,
  p_pago_em date,
  p_preco_fundador boolean,
  p_observacao text,
  p_representante uuid,
  p_comissao_base integer,
  p_comissao_percentual numeric,
  p_comissao_valor integer,
  p_comissao_libera_em date
) returns void
language plpgsql volatile
set search_path = ''
as $$
declare
  pat record;
  atual record;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração registra pagamentos de patrocínio.';
  end if;
  select p.id, p.cidade_id into pat from public.patrocinios p where p.id = p_patrocinio for update;
  if pat.id is null then
    raise exception 'Patrocínio não encontrado.';
  end if;
  select c.* into atual from public.comissoes c where c.patrocinio_id = p_patrocinio;
  if atual.id is not null and atual.pagamento_representante_id is not null
     and (atual.representante_id is distinct from p_representante or atual.valor_centavos is distinct from p_comissao_valor) then
    raise exception 'A comissão deste patrocínio já foi paga ao representante: o valor e o representante não mudam mais.';
  end if;

  insert into public.pagamentos_patrocinio (patrocinio_id, valor_centavos, preco_fundador, pago_em, observacao)
  values (p_patrocinio, p_valor, p_preco_fundador, p_pago_em, coalesce(p_observacao, ''))
  on conflict (patrocinio_id) do update
  set valor_centavos = excluded.valor_centavos, preco_fundador = excluded.preco_fundador,
      pago_em = excluded.pago_em, observacao = excluded.observacao;
  update public.patrocinios set representante_id = p_representante where id = p_patrocinio;

  if atual.id is not null and atual.pagamento_representante_id is null then
    delete from public.comissoes where id = atual.id;
  end if;
  if p_comissao_valor is not null and (atual.id is null or atual.pagamento_representante_id is null) then
    if p_representante is null then
      raise exception 'Comissão sem representante.';
    end if;
    insert into public.comissoes (cidade_id, representante_id, patrocinio_id, origem, base_centavos, percentual, valor_centavos, libera_em)
    values (pat.cidade_id, p_representante, p_patrocinio, 'patrocinio', p_comissao_base, p_comissao_percentual, p_comissao_valor, p_comissao_libera_em);
  end if;
end
$$;

revoke execute on function public.registrar_pagamento_patrocinio(uuid, integer, date, boolean, text, uuid, integer, numeric, integer, date) from public, anon;
grant execute on function public.registrar_pagamento_patrocinio(uuid, integer, date, boolean, text, uuid, integer, numeric, integer, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Comissões que o representante vê
-- ---------------------------------------------------------------------------

/** As comissões do representante logado, com o nome do anunciante ou do patrocinador. */
create function public.minhas_comissoes()
returns table (
  id uuid, origem text, descricao text, base_centavos integer, percentual numeric, valor_centavos integer,
  libera_em date, cancelada boolean, pago_em date, criado_em timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select c.id, c.origem, coalesce(a.nome, pt.nome, ''), c.base_centavos, c.percentual, c.valor_centavos,
         c.libera_em, c.cancelada_em is not null, pr.pago_em, c.criado_em
  from public.comissoes c
  left join public.pagamentos pg on pg.id = c.pagamento_id
  left join public.anunciantes a on a.id = pg.anunciante_id
  left join public.patrocinios pt on pt.id = c.patrocinio_id
  left join public.pagamentos_representante pr on pr.id = c.pagamento_representante_id
  where c.representante_id = interno.meu_representante_id()
  order by c.criado_em desc
$$;

revoke execute on function public.minhas_comissoes() from public, anon;
grant execute on function public.minhas_comissoes() to authenticated;
