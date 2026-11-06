-- Negociações (opção B, decisões N1 a N6 de 06/11/2026): cada cliente (o
-- anunciante, importado da Receita ou não, com conta ou sem) tem as próprias
-- negociações, uma aberta por tipo (assinatura ou upgrade). Elas se abrem e se
-- fecham sozinhas com o que acontece no sistema: contato registrado, "Fechei com
-- este comércio", cadastro assistido, proposta e pagamento. A etapa não é
-- gravada: é calculada dos fatos (interno.etapa_da_negociacao), para nunca ficar
-- fora de sincronia. "Perdida" é marcada à mão, com o motivo.
--
-- N1: o responsável é qualquer pessoa da equipe. N5: a reserva continua só no
-- "Fechei com este comércio"; uma negociação aberta não bloqueia os outros.

-- ---------------------------------------------------------------------------
-- Motivos de perda (N3): editáveis pela administração
-- ---------------------------------------------------------------------------

create table public.motivos_perda (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  nome text not null check (length(trim(nome)) between 2 and 60),
  -- Usado pelo banco nos fechamentos automáticos; só o nome pode mudar.
  codigo_sistema text check (codigo_sistema in ('nao_procurar', 'devolucao')),
  ativo boolean not null default true,
  ordem smallint not null default 100,
  criado_em timestamptz not null default now(),
  unique (cidade_id, nome),
  unique (cidade_id, codigo_sistema),
  check (codigo_sistema is null or ativo)
);

insert into public.motivos_perda (cidade_id, nome, codigo_sistema, ordem)
select c.id, m.nome, m.codigo, m.ordem
from public.cidades c
cross join (values
  ('Preço', null, 10),
  ('Já anuncia em outro lugar', null, 20),
  ('Sem interesse', null, 30),
  ('Sem retorno', null, 40),
  ('Fechou o negócio', null, 50),
  ('Ficou no plano Gratuito', null, 60),
  ('Pediu para não ser procurado', 'nao_procurar', 70),
  ('Devolução ou contestação do pagamento', 'devolucao', 80),
  ('Outro', null, 90)
) as m (nome, codigo, ordem);

create trigger auditar after insert or update or delete on public.motivos_perda for each row execute function interno.auditar();
alter table public.motivos_perda enable row level security;
create policy "visitante sem acesso" on public.motivos_perda as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso" on public.motivos_perda for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
create policy "representante lê os ativos" on public.motivos_perda for select to authenticated
  using (ativo and (select interno.meu_representante_id()) is not null);
create policy "administrador lê e altera" on public.motivos_perda for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- ---------------------------------------------------------------------------
-- Negociações
-- ---------------------------------------------------------------------------

create table public.negociacoes (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null,
  anunciante_id uuid not null,
  tipo text not null check (tipo in ('assinatura', 'upgrade')),
  responsavel_id uuid not null references auth.users (id) on delete restrict,
  situacao text not null default 'aberta' check (situacao in ('aberta', 'ganha', 'perdida')),
  -- Próxima ação (N4): quando voltar a falar e o que fazer.
  proxima_acao_em date,
  proxima_acao text not null default '' check (length(proxima_acao) <= 200),
  motivo_perda_id uuid references public.motivos_perda (id),
  observacao_perda text not null default '' check (length(observacao_perda) <= 300),
  pagamento_id uuid references public.pagamentos (id),
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz,
  fechada_por uuid references auth.users (id),
  atualizado_em timestamptz not null default now(),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade,
  check ((situacao = 'aberta') = (fechada_em is null)),
  check (situacao <> 'perdida' or motivo_perda_id is not null),
  check (situacao <> 'ganha' or pagamento_id is not null)
);
create unique index negociacoes_uma_aberta_por_tipo on public.negociacoes (anunciante_id, tipo) where situacao = 'aberta';
create index negociacoes_anunciante_idx on public.negociacoes (anunciante_id, aberta_em desc);
create index negociacoes_responsavel_idx on public.negociacoes (responsavel_id, situacao);
create index negociacoes_situacao_idx on public.negociacoes (cidade_id, situacao, proxima_acao_em);
create index negociacoes_pagamento_idx on public.negociacoes (pagamento_id) where pagamento_id is not null;

create trigger marcar_atualizacao before update on public.negociacoes for each row execute function interno.marcar_atualizacao();
create trigger auditar after update or delete on public.negociacoes for each row execute function interno.auditar();

-- Grava-se só pelas funções abaixo (security definer): as políticas são de leitura.
alter table public.negociacoes enable row level security;
create policy "visitante sem acesso" on public.negociacoes as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso" on public.negociacoes for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
create policy "representante lê as que são dele" on public.negociacoes for select to authenticated
  using (responsavel_id = (select auth.uid()) and (select interno.meu_representante_id()) is not null);
create policy "administrador lê todas" on public.negociacoes for select to authenticated
  using ((select interno.eh_admin()));

alter table public.atendimentos add column negociacao_id uuid references public.negociacoes (id) on delete set null;
alter table public.propostas add column negociacao_id uuid references public.negociacoes (id) on delete set null;
create index atendimentos_negociacao_idx on public.atendimentos (negociacao_id) where negociacao_id is not null;
create index propostas_negociacao_idx on public.propostas (negociacao_id) where negociacao_id is not null;

-- ---------------------------------------------------------------------------
-- Regras internas
-- ---------------------------------------------------------------------------

/** O cliente é o importado enquanto a cópia do "Fechei" não substitui ele. */
create function interno.cliente_do_anunciante(p_anunciante uuid) returns uuid
language sql stable security definer
set search_path = ''
as $$
  select coalesce(a.importado_id, a.id) from public.anunciantes a where a.id = p_anunciante
$$;

/** Plano pago em dia ou dentro da tolerância, como em criar_proposta. */
create function interno.tem_plano_em_dia(p_anunciante uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assinaturas s
    join public.anunciantes a on a.id = s.anunciante_id
    where s.anunciante_id = p_anunciante
      and a.plano_id = s.plano_id
      and s.vence_em + interno.tolerancia_vencimento(a.cidade_id) >= interno.hoje()
  )
$$;

/** A negociação aberta do cliente nesse tipo, ou uma nova. p_trocar passa a responsabilidade a quem agiu. */
create function interno.garantir_negociacao(p_anunciante uuid, p_tipo text, p_responsavel uuid, p_trocar boolean) returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  cliente uuid := interno.cliente_do_anunciante(p_anunciante);
  cidade uuid;
  atual uuid;
begin
  select a.cidade_id into cidade from public.anunciantes a where a.id = cliente;
  insert into public.negociacoes (cidade_id, anunciante_id, tipo, responsavel_id)
  values (cidade, cliente, p_tipo, p_responsavel)
  on conflict (anunciante_id, tipo) where situacao = 'aberta' do nothing
  returning id into atual;
  if atual is not null then
    return atual;
  end if;
  select n.id into atual from public.negociacoes n where n.anunciante_id = cliente and n.tipo = p_tipo and n.situacao = 'aberta';
  if p_trocar then
    update public.negociacoes set responsavel_id = p_responsavel where id = atual and responsavel_id <> p_responsavel;
  end if;
  return atual;
end
$$;

/**
 * Etapa de uma negociação aberta, calculada dos fatos: a proposta em vigor vem
 * primeiro; depois, o cadastro (a cópia do "Fechei", com a reserva em vigor ou o
 * convite enviado, ou o próprio rascunho); depois, se o comerciante já aceitou.
 */
create function interno.etapa_da_negociacao(p_anunciante uuid, p_tipo text) returns text
language plpgsql stable security definer
set search_path = ''
as $$
declare
  a record;
  c record;
  hoje date := interno.hoje();
begin
  if exists (
    select 1 from public.propostas p
    where p.anunciante_id = p_anunciante and p.tipo = p_tipo and p.situacao = 'aceita' and p.expira_em >= hoje
  ) then
    return 'proposta_aceita';
  end if;
  if exists (
    select 1 from public.propostas p
    where p.anunciante_id = p_anunciante and p.tipo = p_tipo and p.situacao = 'aguardando_aceite' and p.expira_em >= hoje
  ) then
    return 'proposta_enviada';
  end if;
  if p_tipo = 'upgrade' then
    return 'contato';
  end if;

  select an.status, an.usuario_id, an.email_convite into a from public.anunciantes an where an.id = p_anunciante;
  select co.usuario_id, co.email_convite, co.criado_em into c from public.anunciantes co where co.importado_id = p_anunciante;
  if c.criado_em is not null then
    if c.usuario_id is not null or c.email_convite is not null then
      return 'convite_enviado';
    end if;
    if c.criado_em > now() - make_interval(days => interno.dias_reserva_importado()) then
      return 'em_cadastro';
    end if;
  end if;
  if a.status = 'rascunho' then
    return case when a.email_convite is null and a.usuario_id is null then 'em_cadastro' else 'convite_enviado' end;
  end if;
  if a.status = 'aguardando_anunciante' then
    return 'convite_enviado';
  end if;
  if a.usuario_id is not null then
    return 'aceitou';
  end if;
  return 'contato';
end
$$;

/** Quem pode ver a ficha: o administrador, ou o representante nos perfis no ar e nos que são dele. */
create function interno.pode_ver_cliente(p_cliente uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.eh_admin() or (
    interno.meu_representante_id() is not null and exists (
      select 1 from public.anunciantes a
      where a.id = p_cliente
        and (a.status = 'publicado'
             or a.representante_id = interno.meu_representante_id()
             or exists (select 1 from public.anunciantes co where co.importado_id = a.id and co.representante_id = interno.meu_representante_id())
             or exists (select 1 from public.negociacoes n where n.anunciante_id = a.id and n.responsavel_id = auth.uid()))
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos: as negociações acompanham o que acontece no sistema
-- ---------------------------------------------------------------------------

/**
 * Contato registrado (dispara depois de "preparar", que define o autor): entra
 * na negociação aberta ou abre uma de assinatura. Quem tem plano em dia não abre
 * negociação com um contato: pode ser só atendimento (a negociação de upgrade se
 * abre pela ficha ou pela proposta).
 */
create function interno.contato_na_negociacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  cliente uuid := interno.cliente_do_anunciante(new.anunciante_id);
begin
  select n.id into new.negociacao_id
  from public.negociacoes n
  where n.anunciante_id = cliente and n.situacao = 'aberta'
  order by n.aberta_em
  limit 1;
  if new.negociacao_id is null
     and not interno.tem_plano_em_dia(cliente)
     and not exists (select 1 from public.nao_procurar np where np.anunciante_id = cliente) then
    new.negociacao_id := interno.garantir_negociacao(cliente, 'assinatura', new.autor_id, false);
  end if;
  return new;
end
$$;
create trigger vincular_negociacao before insert on public.atendimentos
for each row execute function interno.contato_na_negociacao();

/** "Fechei com este comércio" e cadastro assistido: a negociação passa a ser de quem cadastra. */
create function interno.cadastro_na_negociacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  responsavel uuid;
begin
  if new.representante_id is not null then
    select r.usuario_id into responsavel from public.representantes r where r.id = new.representante_id;
  end if;
  responsavel := coalesce(responsavel, new.cadastrado_por);
  if responsavel is not null then
    perform interno.garantir_negociacao(new.id, 'assinatura', responsavel, true);
  end if;
  return null;
end
$$;
create trigger cadastro_na_negociacao after insert on public.anunciantes
for each row when (new.origem = 'cadastro')
execute function interno.cadastro_na_negociacao();

/** Indicado por um representante depois de cadastrado (pedido de perfil com o código): abre a negociação com ele. */
create function interno.indicacao_na_negociacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  responsavel uuid;
begin
  select r.usuario_id into responsavel from public.representantes r where r.id = new.representante_id;
  if responsavel is not null and not interno.tem_plano_em_dia(new.id) then
    perform interno.garantir_negociacao(new.id, 'assinatura', responsavel, false);
  end if;
  return null;
end
$$;
create trigger indicacao_na_negociacao after update of representante_id on public.anunciantes
for each row when (old.representante_id is null and new.representante_id is not null and new.importado_id is null)
execute function interno.indicacao_na_negociacao();

/** Proposta: entra na negociação do tipo dela, que passa a ser de quem propôs. */
create function interno.proposta_na_negociacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  responsavel uuid;
begin
  select r.usuario_id into responsavel from public.representantes r where r.id = new.representante_id;
  new.negociacao_id := interno.garantir_negociacao(new.anunciante_id, new.tipo, responsavel, true);
  return new;
end
$$;
create trigger vincular_negociacao before insert on public.propostas
for each row execute function interno.proposta_na_negociacao();

/**
 * Pagamento: a negociação vira ganha, em nome de quem atendeu. Sem negociação
 * aberta, a 1ª venda ou o upgrade entram já como ganhos, para o histórico e o
 * resumo; a renovação não é negociação.
 */
create function interno.pagamento_na_negociacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tipo text := case when new.tipo = 'upgrade' then 'upgrade' else 'assinatura' end;
  atendeu uuid;
begin
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
create trigger pagamento_na_negociacao after insert on public.pagamentos
for each row execute function interno.pagamento_na_negociacao();

/** Devolução ou contestação: a venda não vingou. */
create function interno.devolucao_na_negociacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.negociacoes n
  set situacao = 'perdida', fechada_em = now(), fechada_por = new.devolvido_por,
      observacao_perda = left(coalesce(new.motivo_devolucao, ''), 300),
      motivo_perda_id = (select m.id from public.motivos_perda m where m.cidade_id = n.cidade_id and m.codigo_sistema = 'devolucao')
  where n.pagamento_id = new.id and n.situacao = 'ganha';
  return null;
end
$$;
create trigger devolucao_na_negociacao after update of devolvido_em on public.pagamentos
for each row when (old.devolvido_em is null and new.devolvido_em is not null)
execute function interno.devolucao_na_negociacao();

/** Pediu para não ser mais procurado: as negociações abertas terminam. */
create function interno.nao_procurar_na_negociacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.negociacoes n
  set situacao = 'perdida', fechada_em = now(), fechada_por = auth.uid(), proxima_acao_em = null, proxima_acao = '',
      motivo_perda_id = (select m.id from public.motivos_perda m where m.cidade_id = n.cidade_id and m.codigo_sistema = 'nao_procurar')
  where n.anunciante_id = new.anunciante_id and n.situacao = 'aberta';
  return null;
end
$$;
create trigger nao_procurar_na_negociacao after insert on public.nao_procurar
for each row execute function interno.nao_procurar_na_negociacao();

/** Aceite do comerciante: o cadastro novo substitui o importado e leva as negociações (como já fazia com os contatos). */
create or replace function interno.trocar_importado() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  imp record;
begin
  select a.id, a.slug, a.usuario_id into imp from public.anunciantes a where a.id = new.importado_id for update;
  if imp.id is null then
    return null;
  end if;
  if imp.usuario_id is not null then
    raise exception 'O comércio importado já tem dono. Fale com a equipe.';
  end if;
  perform set_config('app.vinculo_convite', 'sim', true);
  update public.dados_receita set anunciante_id = new.id where anunciante_id = imp.id;
  update public.atendimentos set anunciante_id = new.id where anunciante_id = imp.id;
  update public.negociacoes set anunciante_id = new.id where anunciante_id = imp.id;
  delete from public.anunciantes where id = imp.id;
  update public.anunciantes
  set slug = imp.slug, status = 'publicado', aprovado_em = now(), revisar = true, importado_id = null
  where id = new.id;
  perform set_config('app.vinculo_convite', '', true);
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- Ações da ficha
-- ---------------------------------------------------------------------------

/** Abre à mão (por exemplo, o upgrade de quem já tem plano). */
create function public.abrir_negociacao(p_anunciante uuid, p_tipo text) returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  cliente uuid := interno.cliente_do_anunciante(p_anunciante);
begin
  if cliente is null or not interno.pode_ver_cliente(cliente) then
    raise exception 'Cliente não encontrado.';
  end if;
  if p_tipo not in ('assinatura', 'upgrade') then
    raise exception 'Tipo de negociação inválido.';
  end if;
  if exists (select 1 from public.nao_procurar np where np.anunciante_id = cliente) and not interno.eh_admin() then
    raise exception 'Este cliente pediu para não ser mais procurado.';
  end if;
  if exists (select 1 from public.negociacoes n where n.anunciante_id = cliente and n.tipo = p_tipo and n.situacao = 'aberta') then
    raise exception 'Já existe uma negociação aberta deste tipo.';
  end if;
  return interno.garantir_negociacao(cliente, p_tipo, auth.uid(), false);
end
$$;

/** Confere que quem age é o administrador ou o responsável, e devolve a negociação. */
create function interno.negociacao_para_alterar(p_negociacao uuid) returns public.negociacoes
language plpgsql stable security definer
set search_path = ''
as $$
declare
  n public.negociacoes;
begin
  select * into n from public.negociacoes x where x.id = p_negociacao;
  if n.id is null then
    raise exception 'Negociação não encontrada.';
  end if;
  if not interno.eh_admin() and not (n.responsavel_id = auth.uid() and interno.meu_representante_id() is not null) then
    raise exception 'Só o responsável ou a administração alteram esta negociação.';
  end if;
  return n;
end
$$;

create function public.salvar_proxima_acao(p_negociacao uuid, p_dia date, p_texto text) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  n public.negociacoes := interno.negociacao_para_alterar(p_negociacao);
begin
  if n.situacao <> 'aberta' then
    raise exception 'A negociação já foi encerrada.';
  end if;
  update public.negociacoes
  set proxima_acao_em = p_dia, proxima_acao = trim(coalesce(p_texto, ''))
  where id = n.id;
end
$$;

create function public.marcar_negociacao_perdida(p_negociacao uuid, p_motivo uuid, p_observacao text) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  n public.negociacoes := interno.negociacao_para_alterar(p_negociacao);
begin
  if n.situacao <> 'aberta' then
    raise exception 'A negociação já foi encerrada.';
  end if;
  if not exists (select 1 from public.motivos_perda m where m.id = p_motivo and m.cidade_id = n.cidade_id and m.ativo) then
    raise exception 'Escolha o motivo.';
  end if;
  update public.negociacoes
  set situacao = 'perdida', motivo_perda_id = p_motivo, observacao_perda = trim(coalesce(p_observacao, '')),
      fechada_em = now(), fechada_por = auth.uid(), proxima_acao_em = null, proxima_acao = ''
  where id = n.id;
end
$$;

create function public.reabrir_negociacao(p_negociacao uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  n public.negociacoes := interno.negociacao_para_alterar(p_negociacao);
begin
  if n.situacao <> 'perdida' then
    raise exception 'Só uma negociação perdida pode ser reaberta.';
  end if;
  if exists (select 1 from public.nao_procurar np where np.anunciante_id = n.anunciante_id) then
    raise exception 'Este cliente pediu para não ser mais procurado. Só a equipe desfaz, na prospecção.';
  end if;
  if exists (select 1 from public.negociacoes x where x.anunciante_id = n.anunciante_id and x.tipo = n.tipo and x.situacao = 'aberta') then
    raise exception 'Já existe uma negociação aberta deste tipo.';
  end if;
  update public.negociacoes
  set situacao = 'aberta', motivo_perda_id = null, observacao_perda = '', pagamento_id = null, fechada_em = null, fechada_por = null
  where id = n.id;
end
$$;

/** Só a administração passa a negociação para outra pessoa da equipe (por exemplo, quando um representante sai). */
create function public.trocar_responsavel_negociacao(p_negociacao uuid, p_usuario uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração troca o responsável.';
  end if;
  if not exists (
    select 1 from public.perfis_usuario p
    where p.usuario_id = p_usuario and p.ativo and p.papel in ('administrador', 'representante')
  ) then
    raise exception 'Escolha uma pessoa ativa da equipe.';
  end if;
  update public.negociacoes set responsavel_id = p_usuario where id = p_negociacao and situacao = 'aberta';
  if not found then
    raise exception 'Negociação aberta não encontrada.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Leitura: Clientes, Negociações, ficha e resumo
-- ---------------------------------------------------------------------------

/**
 * Lista única de clientes, com filtros. O representante vê os perfis no ar e os
 * dele; o administrador, todos. A cópia do "Fechei" não aparece: o cliente é o
 * importado até o comerciante aceitar. p_meus: só os que são da pessoa
 * (responsável, carteira ou com contato dela).
 */
create function public.clientes_lista(
  p_busca text default null,
  p_categoria uuid default null,
  p_bairro uuid default null,
  p_tipo text default null,
  p_situacao text default null,
  p_etapa text default null,
  p_conta text default null,
  p_meus boolean default false,
  p_responsavel uuid default null,
  p_pagina integer default 1
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  admin boolean := interno.eh_admin();
  meu_rep uuid := interno.meu_representante_id();
  termo text := nullif(interno.normalizar(trim(coalesce(p_busca, ''))), '');
  pagina integer := greatest(coalesce(p_pagina, 1), 1);
  resultado jsonb;
begin
  if not admin and meu_rep is null then
    raise exception 'Sem permissão.';
  end if;

  with base as (
    select a.id, a.nome, a.usuario_id, n.id as negociacao_id, n.tipo as negociacao_tipo, n.situacao as negociacao_situacao,
           n.responsavel_id, n.proxima_acao_em
    from public.anunciantes a
    left join lateral (
      select x.id, x.tipo, x.situacao, x.responsavel_id, x.proxima_acao_em
      from public.negociacoes x
      where x.anunciante_id = a.id
      order by (x.situacao = 'aberta') desc, x.aberta_em desc
      limit 1
    ) n on true
    where a.importado_id is null
      and (admin or a.status = 'publicado' or a.representante_id = meu_rep or n.responsavel_id = auth.uid())
      and (termo is null or interno.normalizar(a.nome) like '%' || replace(replace(replace(termo, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      and (p_categoria is null or a.categoria_principal_id = p_categoria)
      and (p_tipo is null or a.tipo::text = p_tipo)
      and (p_bairro is null or exists (select 1 from public.enderecos e where e.anunciante_id = a.id and e.bairro_id = p_bairro))
      and (p_conta is null or (p_conta = 'com') = (a.usuario_id is not null))
      and (p_situacao is null
           or (p_situacao = 'sem' and n.id is null)
           or n.situacao = p_situacao)
      and (p_responsavel is null or n.responsavel_id = p_responsavel)
      and (not coalesce(p_meus, false)
           or n.responsavel_id = auth.uid()
           or (meu_rep is not null and a.representante_id = meu_rep)
           or exists (select 1 from public.atendimentos t where t.anunciante_id = a.id and t.autor_id = auth.uid()))
  ),
  filtrada as (
    select b.*, case when b.negociacao_situacao = 'aberta' then interno.etapa_da_negociacao(b.id, b.negociacao_tipo) end as etapa
    from base b
    where p_etapa is null or b.negociacao_situacao = 'aberta'
  ),
  final as (
    select f.* from filtrada f where p_etapa is null or f.etapa = p_etapa
  ),
  pagina_atual as (
    select f.* from final f order by f.nome, f.id limit 30 offset (pagina - 1) * 30
  )
  select jsonb_build_object(
    'total', (select count(*) from final),
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'nome', a.nome,
        'slug', a.slug,
        'tipo', a.tipo,
        'status', a.status,
        'origem', a.origem,
        'categoria', cat.nome,
        'bairro', ender.bairro,
        'endereco', ender.endereco,
        'tem_conta', a.usuario_id is not null,
        'plano', pl.nome,
        'vence_em', ass.vence_em,
        'nao_procurar', exists (select 1 from public.nao_procurar np where np.anunciante_id = a.id),
        'razao_social', dr.razao_social,
        'telefones', case when a.usuario_id is null then dr.telefones end,
        'email', case when a.usuario_id is null then dr.email end,
        'negociacao', case when p.negociacao_id is null then null else jsonb_build_object(
          'id', p.negociacao_id,
          'tipo', p.negociacao_tipo,
          'situacao', p.negociacao_situacao,
          'etapa', p.etapa,
          'responsavel', coalesce(nullif(resp.nome, ''), 'Sem nome'),
          'minha', p.responsavel_id = auth.uid(),
          'proxima_acao_em', p.proxima_acao_em
        ) end,
        'ultimo_contato', (
          select jsonb_build_object('dia', t.dia, 'autor', coalesce(nullif(pu.nome, ''), 'Sem nome'))
          from public.atendimentos t
          left join public.perfis_usuario pu on pu.usuario_id = t.autor_id
          where t.anunciante_id = a.id
          order by t.dia desc, t.criado_em desc
          limit 1
        )
      ) order by a.nome, a.id)
      from pagina_atual p
      join public.anunciantes a on a.id = p.id
      left join public.categorias cat on cat.id = a.categoria_principal_id
      left join public.planos pl on pl.id = a.plano_id
      left join public.assinaturas ass on ass.anunciante_id = a.id
      left join public.dados_receita dr on dr.anunciante_id = a.id
      left join public.perfis_usuario resp on resp.usuario_id = p.responsavel_id
      left join lateral (
        select b.nome as bairro, e.logradouro || ', ' || e.numero as endereco
        from public.enderecos e
        left join public.bairros b on b.id = e.bairro_id
        where e.anunciante_id = a.id
        order by e.principal desc
        limit 1
      ) ender on true
    ), '[]'::jsonb)
  ) into resultado;
  return resultado;
end
$$;

/**
 * Negociações, com filtros. O representante vê as dele e aquelas em que registrou
 * contato; o administrador, todas. p_atrasadas: próxima ação com data vencida.
 */
create function public.negociacoes_lista(
  p_situacao text default 'aberta',
  p_etapa text default null,
  p_tipo text default null,
  p_responsavel uuid default null,
  p_atrasadas boolean default false,
  p_busca text default null,
  p_inicio date default null,
  p_fim date default null,
  p_pagina integer default 1
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  admin boolean := interno.eh_admin();
  meu_rep uuid := interno.meu_representante_id();
  termo text := nullif(interno.normalizar(trim(coalesce(p_busca, ''))), '');
  pagina integer := greatest(coalesce(p_pagina, 1), 1);
  hoje date := interno.hoje();
  resultado jsonb;
begin
  if not admin and meu_rep is null then
    raise exception 'Sem permissão.';
  end if;

  with base as (
    select n.*, a.nome as cliente, a.usuario_id as cliente_usuario,
           case when n.situacao = 'aberta' then interno.etapa_da_negociacao(n.anunciante_id, n.tipo) end as etapa
    from public.negociacoes n
    join public.anunciantes a on a.id = n.anunciante_id
    where (p_situacao is null or n.situacao = p_situacao)
      and (p_tipo is null or n.tipo = p_tipo)
      and (p_responsavel is null or n.responsavel_id = p_responsavel)
      and (not coalesce(p_atrasadas, false) or (n.situacao = 'aberta' and n.proxima_acao_em < hoje))
      and (p_inicio is null or (n.aberta_em at time zone 'America/Sao_Paulo')::date >= p_inicio)
      and (p_fim is null or (n.aberta_em at time zone 'America/Sao_Paulo')::date <= p_fim)
      and (termo is null or interno.normalizar(a.nome) like '%' || replace(replace(replace(termo, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      and (admin
           or n.responsavel_id = auth.uid()
           or exists (select 1 from public.atendimentos t where t.negociacao_id = n.id and t.autor_id = auth.uid()))
  ),
  final as (
    select b.* from base b where p_etapa is null or b.etapa = p_etapa
  ),
  pagina_atual as (
    select f.* from final f
    order by (f.situacao = 'aberta' and f.proxima_acao_em < hoje) desc, f.proxima_acao_em nulls last, f.aberta_em desc
    limit 30 offset (pagina - 1) * 30
  )
  select jsonb_build_object(
    'total', (select count(*) from final),
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'anunciante_id', p.anunciante_id,
        'cliente', p.cliente,
        'tem_conta', p.cliente_usuario is not null,
        'tipo', p.tipo,
        'situacao', p.situacao,
        'etapa', p.etapa,
        'responsavel', coalesce(nullif(resp.nome, ''), 'Sem nome'),
        'responsavel_ativo', coalesce(resp.ativo, false),
        'minha', p.responsavel_id = auth.uid(),
        'proxima_acao_em', p.proxima_acao_em,
        'proxima_acao', case when admin or p.responsavel_id = auth.uid() then p.proxima_acao else '' end,
        'motivo', mot.nome,
        'aberta_em', p.aberta_em,
        'fechada_em', p.fechada_em,
        'contatos', (select count(*) from public.atendimentos t where t.negociacao_id = p.id),
        'ultimo_contato', (select max(t.dia) from public.atendimentos t where t.negociacao_id = p.id)
      ) order by (p.situacao = 'aberta' and p.proxima_acao_em < hoje) desc, p.proxima_acao_em nulls last, p.aberta_em desc)
      from pagina_atual p
      left join public.perfis_usuario resp on resp.usuario_id = p.responsavel_id
      left join public.motivos_perda mot on mot.id = p.motivo_perda_id
    ), '[]'::jsonb)
  ) into resultado;
  return resultado;
end
$$;

/**
 * Ficha do cliente: tudo num lugar só, com ou sem conta. Aceita o id da cópia do
 * "Fechei" e devolve o cliente. O representante vê as próprias anotações; dos
 * outros, só quem fez e o dia (decisão de 24/10/2026), sem observação nem valores.
 */
create function public.ficha_cliente(p_anunciante uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  admin boolean := interno.eh_admin();
  meu_rep uuid := interno.meu_representante_id();
  cliente uuid := interno.cliente_do_anunciante(p_anunciante);
  a record;
  resultado jsonb;
begin
  if cliente is null or not interno.pode_ver_cliente(cliente) then
    raise exception 'Cliente não encontrado.';
  end if;
  select an.* into a from public.anunciantes an where an.id = cliente;

  select jsonb_build_object(
    'cliente', jsonb_build_object(
      'id', a.id,
      'nome', a.nome,
      'slug', a.slug,
      'tipo', a.tipo,
      'status', a.status,
      'origem', a.origem,
      'tem_conta', a.usuario_id is not null,
      'whatsapp', a.whatsapp,
      'telefone', a.telefone,
      'categoria', (select c.nome from public.categorias c where c.id = a.categoria_principal_id),
      'plano', (select p.nome from public.planos p where p.id = a.plano_id),
      'fundador', a.fundador_desde is not null,
      'plano_em_dia', interno.tem_plano_em_dia(a.id),
      'vence_em', (select s.vence_em from public.assinaturas s where s.anunciante_id = a.id),
      'nao_procurar', exists (select 1 from public.nao_procurar np where np.anunciante_id = a.id),
      'meu_cadastro', a.representante_id is not null and a.representante_id = meu_rep,
      'carteira', (select coalesce(nullif(p.nome, ''), r.codigo) from public.representantes r left join public.perfis_usuario p on p.usuario_id = r.usuario_id where r.id = a.representante_id),
      'endereco', (
        select e.logradouro || ', ' || e.numero || coalesce(' · ' || b.nome, '')
        from public.enderecos e left join public.bairros b on b.id = e.bairro_id
        where e.anunciante_id = a.id order by e.principal desc limit 1
      )
    ),
    'receita', (select jsonb_build_object('razao_social', d.razao_social, 'telefones', d.telefones, 'email', d.email) from public.dados_receita d where d.anunciante_id = a.id),
    'copia', (
      select jsonb_build_object(
        'id', co.id,
        'autor', coalesce(nullif(pu.nome, ''), r.codigo),
        'minha', co.representante_id = meu_rep,
        'ate', ((co.criado_em + make_interval(days => interno.dias_reserva_importado())) at time zone 'America/Sao_Paulo')::date,
        'convite_enviado', co.usuario_id is not null or co.email_convite is not null,
        'vencida', co.usuario_id is null and co.email_convite is null and co.criado_em <= now() - make_interval(days => interno.dias_reserva_importado())
      )
      from public.anunciantes co
      left join public.representantes r on r.id = co.representante_id
      left join public.perfis_usuario pu on pu.usuario_id = r.usuario_id
      where co.importado_id = a.id
      limit 1
    ),
    'negociacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'tipo', n.tipo,
        'situacao', n.situacao,
        'etapa', case when n.situacao = 'aberta' then interno.etapa_da_negociacao(n.anunciante_id, n.tipo) end,
        'responsavel', coalesce(nullif(resp.nome, ''), 'Sem nome'),
        'responsavel_id', n.responsavel_id,
        'responsavel_ativo', coalesce(resp.ativo, false),
        'minha', n.responsavel_id = auth.uid(),
        'pode_alterar', admin or n.responsavel_id = auth.uid(),
        'proxima_acao_em', case when admin or n.responsavel_id = auth.uid() then n.proxima_acao_em end,
        'proxima_acao', case when admin or n.responsavel_id = auth.uid() then n.proxima_acao else '' end,
        'motivo', mot.nome,
        'observacao_perda', case when admin or n.responsavel_id = auth.uid() then n.observacao_perda else '' end,
        'aberta_em', n.aberta_em,
        'fechada_em', n.fechada_em
      ) order by (n.situacao = 'aberta') desc, n.aberta_em desc)
      from public.negociacoes n
      left join public.perfis_usuario resp on resp.usuario_id = n.responsavel_id
      left join public.motivos_perda mot on mot.id = n.motivo_perda_id
      where n.anunciante_id = a.id
    ), '[]'::jsonb),
    'linha_do_tempo', coalesce((
      select jsonb_agg(ev.item order by ev.quando desc)
      from (
        -- Contatos (também os registrados na cópia do "Fechei").
        select t.criado_em as quando, jsonb_build_object(
          'quando', t.criado_em,
          'dia', t.dia,
          'tipo', 'contato',
          'autor', coalesce(nullif(pu.nome, ''), 'Sem nome'),
          'texto', case when admin or t.autor_id = auth.uid() then t.observacao else '' end
        ) as item
        from public.atendimentos t
        left join public.perfis_usuario pu on pu.usuario_id = t.autor_id
        where t.anunciante_id = a.id or t.anunciante_id in (select co.id from public.anunciantes co where co.importado_id = a.id)

        union all
        -- "Fechei com este comércio" em andamento.
        select co.criado_em, jsonb_build_object(
          'quando', co.criado_em,
          'tipo', 'fechou',
          'autor', coalesce(nullif(pu.nome, ''), r.codigo),
          'texto', ''
        )
        from public.anunciantes co
        left join public.representantes r on r.id = co.representante_id
        left join public.perfis_usuario pu on pu.usuario_id = r.usuario_id
        where co.importado_id = a.id

        union all
        -- O comerciante aceitou e o perfil foi ao ar.
        select a.aprovado_em, jsonb_build_object('quando', a.aprovado_em, 'tipo', 'aceite', 'autor', null, 'texto', '')
        where a.aprovado_em is not null and a.origem = 'cadastro'

        union all
        -- Propostas: o plano e o valor só para a administração e para quem propôs.
        select pr.criada_em, jsonb_build_object(
          'quando', pr.criada_em,
          'tipo', 'proposta',
          'autor', coalesce(nullif(pu.nome, ''), r.codigo),
          'situacao', pr.situacao,
          'texto', case when admin or pr.representante_id = meu_rep then pl.nome || ' (' || pr.periodicidade || ')' else '' end
        )
        from public.propostas pr
        join public.representantes r on r.id = pr.representante_id
        left join public.perfis_usuario pu on pu.usuario_id = r.usuario_id
        left join public.planos pl on pl.id = pr.plano_id
        where pr.anunciante_id = a.id

        union all
        -- Pagamentos: o valor só para a administração e para quem atendeu.
        select pg.registrado_em, jsonb_build_object(
          'quando', pg.registrado_em,
          'dia', pg.pago_em,
          'tipo', case when pg.devolvido_em is null then 'pagamento' else 'pagamento_devolvido' end,
          'autor', coalesce(nullif(pu.nome, ''), r.codigo),
          'valor_centavos', case when admin or pg.representante_id = meu_rep then pg.valor_centavos end,
          'texto', case when admin or pg.representante_id = meu_rep then pl.nome || ' (' || pg.periodicidade || ')' else '' end
        )
        from public.pagamentos pg
        left join public.representantes r on r.id = pg.representante_id
        left join public.perfis_usuario pu on pu.usuario_id = r.usuario_id
        left join public.planos pl on pl.id = pg.plano_id
        where pg.anunciante_id = a.id

        union all
        -- Negociação perdida, com o motivo.
        select n.fechada_em, jsonb_build_object(
          'quando', n.fechada_em,
          'tipo', 'perdida',
          'autor', null,
          'texto', mot.nome
        )
        from public.negociacoes n
        left join public.motivos_perda mot on mot.id = n.motivo_perda_id
        where n.anunciante_id = a.id and n.situacao = 'perdida'
      ) ev
    ), '[]'::jsonb)
  ) into resultado;
  return resultado;
end
$$;

/**
 * Resumo por pessoa no período, só para o administrador: contatos, comércios,
 * cadastros iniciados, negociações abertas hoje e ganhas e perdidas no período,
 * com o valor das ganhas. Entra quem teve alguma dessas no período.
 */
create function public.resumo_negociacoes(p_inicio date, p_fim date)
returns table (
  usuario_id uuid,
  nome text,
  papel public.papel_usuario,
  ativo boolean,
  contatos bigint,
  comercios bigint,
  cadastros_iniciados bigint,
  abertas bigint,
  atrasadas bigint,
  ganhas bigint,
  perdidas bigint,
  valor_vendido_centavos bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not interno.eh_admin() then
    raise exception 'Sem permissão.';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Escolha um período de até 400 dias.';
  end if;

  return query
    with contatos as (
      select t.autor_id as pessoa, count(*) as contatos, count(distinct t.anunciante_id) as comercios
      from public.atendimentos t
      where t.dia between p_inicio and p_fim
      group by t.autor_id
    ),
    cadastros as (
      select r.usuario_id as pessoa, count(*) as cadastros
      from public.anunciantes a
      join public.representantes r on r.id = a.representante_id
      where (a.criado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
        and a.origem = 'cadastro'
      group by r.usuario_id
    ),
    negocios as (
      select n.responsavel_id as pessoa,
             count(*) filter (where n.situacao = 'aberta') as abertas,
             count(*) filter (where n.situacao = 'aberta' and n.proxima_acao_em < interno.hoje()) as atrasadas,
             count(*) filter (where n.situacao = 'ganha' and (n.fechada_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim) as ganhas,
             count(*) filter (where n.situacao = 'perdida' and (n.fechada_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim) as perdidas,
             coalesce(sum(pg.valor_centavos) filter (where n.situacao = 'ganha' and (n.fechada_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim), 0) as valor
      from public.negociacoes n
      left join public.pagamentos pg on pg.id = n.pagamento_id
      group by n.responsavel_id
    ),
    pessoas as (
      select c.pessoa from contatos c
      union select k.pessoa from cadastros k
      union select g.pessoa from negocios g
    )
    select p.pessoa, pu.nome, pu.papel, pu.ativo,
           coalesce(c.contatos, 0), coalesce(c.comercios, 0), coalesce(k.cadastros, 0),
           coalesce(g.abertas, 0), coalesce(g.atrasadas, 0), coalesce(g.ganhas, 0), coalesce(g.perdidas, 0), coalesce(g.valor, 0)::bigint
    from pessoas p
    left join public.perfis_usuario pu on pu.usuario_id = p.pessoa
    left join contatos c on c.pessoa = p.pessoa
    left join cadastros k on k.pessoa = p.pessoa
    left join negocios g on g.pessoa = p.pessoa
    order by coalesce(g.ganhas, 0) desc, coalesce(c.contatos, 0) desc, pu.nome;
end
$$;

-- As telas de "Meus contatos" e "Contatos" e a busca de Propostas deram lugar a Clientes e Negociações.
drop function public.contatos_registrados(date, date, uuid, text);
drop function public.resumo_contatos(date, date);
drop function interno.etapa_do_anunciante(uuid);
drop function public.anunciantes_para_proposta(text);

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

revoke execute on function interno.cliente_do_anunciante(uuid) from public, anon, authenticated;
revoke execute on function interno.tem_plano_em_dia(uuid) from public, anon, authenticated;
revoke execute on function interno.garantir_negociacao(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke execute on function interno.etapa_da_negociacao(uuid, text) from public, anon, authenticated;
revoke execute on function interno.pode_ver_cliente(uuid) from public, anon, authenticated;
revoke execute on function interno.negociacao_para_alterar(uuid) from public, anon, authenticated;

revoke execute on function public.abrir_negociacao(uuid, text) from public, anon;
revoke execute on function public.salvar_proxima_acao(uuid, date, text) from public, anon;
revoke execute on function public.marcar_negociacao_perdida(uuid, uuid, text) from public, anon;
revoke execute on function public.reabrir_negociacao(uuid) from public, anon;
revoke execute on function public.trocar_responsavel_negociacao(uuid, uuid) from public, anon;
revoke execute on function public.clientes_lista(text, uuid, uuid, text, text, text, text, boolean, uuid, integer) from public, anon;
revoke execute on function public.negociacoes_lista(text, text, text, uuid, boolean, text, date, date, integer) from public, anon;
revoke execute on function public.ficha_cliente(uuid) from public, anon;
revoke execute on function public.resumo_negociacoes(date, date) from public, anon;

grant execute on function public.abrir_negociacao(uuid, text) to authenticated;
grant execute on function public.salvar_proxima_acao(uuid, date, text) to authenticated;
grant execute on function public.marcar_negociacao_perdida(uuid, uuid, text) to authenticated;
grant execute on function public.reabrir_negociacao(uuid) to authenticated;
grant execute on function public.trocar_responsavel_negociacao(uuid, uuid) to authenticated;
grant execute on function public.clientes_lista(text, uuid, uuid, text, text, text, text, boolean, uuid, integer) to authenticated;
grant execute on function public.negociacoes_lista(text, text, text, uuid, boolean, text, date, date, integer) to authenticated;
grant execute on function public.ficha_cliente(uuid) to authenticated;
grant execute on function public.resumo_negociacoes(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Código do representante no pedido de perfil (C1)
-- ---------------------------------------------------------------------------

-- Quem indicou: o visitante informa o código no pedido, e o servidor guarda o representante ativo.
alter table public.pedidos_perfil add column representante_id uuid references public.representantes (id) on delete set null;

-- A Prospecção virou um filtro de Clientes: estas duas leituras ficaram sem uso.
drop function public.ultimos_contatos(uuid[]);
drop function public.situacao_importados(uuid[]);
