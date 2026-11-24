-- Código do representante na criação da conta (decisão de 24/11/2026, no lugar
-- do campo no envio do cadastro próprio, migration 20261124125805):
--   1. o código informado em /criar-conta vai nos dados da conta
--      (raw_user_meta_data.codigo_representante) e o banco guarda o
--      representante ativo dele na conta (perfis_usuario.representante_indicado_id);
--      código desconhecido ou de representante inativo não indica ninguém;
--   2. o rascunho do cadastro próprio recebe o indicado da conta, e o código
--      deixa de ser informado no envio (public.indicar_representante sai);
--   3. na aprovação, o indicado só vira quem trouxe o anunciante (carteira) se
--      continuar ativo: representante desativado não leva o anunciante, que fica
--      sem carteira até a administração escolher outro representante;
--   4. correção: o rascunho do cadastro próprio abria a negociação com o próprio
--      anunciante como responsável. Agora a negociação é do representante
--      indicado (se ativo) e, sem ele, nenhuma negociação abre.

-- ---------------------------------------------------------------------------
-- Representante ativo do código e do id
-- ---------------------------------------------------------------------------

/** Representante ativo (com a conta ativa) do código, sem diferenciar maiúscula nem espaço; nulo se não houver. */
create function interno.representante_do_codigo(p_codigo text) returns uuid
language sql stable security definer
set search_path = ''
as $$
  select r.id
  from public.representantes r
  join public.perfis_usuario p on p.usuario_id = r.usuario_id
  where r.codigo = lower(trim(coalesce(p_codigo, ''))) and r.ativo and p.ativo
$$;

/** Conta do representante, se ele e a conta estiverem ativos; nulo se não. */
create function interno.usuario_do_representante_ativo(p_representante uuid) returns uuid
language sql stable security definer
set search_path = ''
as $$
  select r.usuario_id
  from public.representantes r
  join public.perfis_usuario p on p.usuario_id = r.usuario_id
  where r.id = p_representante and r.ativo and p.ativo
$$;

/** Se o representante e a conta dele estão ativos (usado na aprovação, por quem aprova). */
create function interno.representante_ativo(p_representante uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.usuario_do_representante_ativo(p_representante) is not null
$$;

revoke execute on function interno.representante_do_codigo(text) from public, anon, authenticated;
revoke execute on function interno.usuario_do_representante_ativo(uuid) from public, anon, authenticated;
revoke execute on function interno.representante_ativo(uuid) from public, anon;
grant execute on function interno.representante_ativo(uuid) to authenticated, service_role;

-- A conferência do link /r/codigo passa a usar a mesma regra.
create or replace function public.codigo_representante_valido(p_codigo text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.representante_do_codigo(p_codigo) is not null
$$;

-- ---------------------------------------------------------------------------
-- 1. Indicado guardado na conta
-- ---------------------------------------------------------------------------

alter table public.perfis_usuario
  add column representante_indicado_id uuid references public.representantes (id) on delete set null;

create index perfis_usuario_representante_indicado_idx on public.perfis_usuario (representante_indicado_id)
  where representante_indicado_id is not null;

comment on column public.perfis_usuario.representante_indicado_id is
  'Representante do código informado ao criar a conta pelo site; passa para o rascunho do cadastro próprio. Só o banco grava.';

create or replace function interno.criar_perfil_usuario() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.perfis_usuario (usuario_id, papel, nome, representante_indicado_id)
  values (
    new.id,
    'anunciante',
    left(coalesce(trim(new.raw_user_meta_data ->> 'nome'), ''), 120),
    interno.representante_do_codigo(new.raw_user_meta_data ->> 'codigo_representante')
  );
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 2 e 3. Rascunho recebe o indicado da conta; aprovação só com ele ativo
-- ---------------------------------------------------------------------------

/**
 * Trava e efeitos do cadastro próprio, depois das outras travas (o nome com
 * "zzz" faz este gatilho rodar por último entre os "before"):
 * - o rascunho do próprio dono recebe o indicado da conta; ninguém o informa;
 * - na aprovação, o indicado vira quem trouxe o anunciante, se ninguém trouxe e
 *   ele continuar ativo;
 * - mudança do dono (ou de quem não é da administração) no perfil publicado ou
 *   pausado marca "Para conferir" (revisar). Pausar e reativar não marcam.
 */
create or replace function interno.cadastro_proprio() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Colunas que mudam sem ser alteração do perfil.
  livres constant text[] := array['status', 'atualizado_em', 'revisar'];
begin
  if coalesce(auth.role(), '') <> 'authenticated' or interno.eh_admin() then
    if tg_op = 'UPDATE' and old.status = 'em_analise' and new.status in ('publicado', 'aguardando_pagamento')
       and new.representante_id is null and new.representante_indicado_id is not null
       and interno.representante_ativo(new.representante_indicado_id) then
      new.representante_id := new.representante_indicado_id;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.representante_indicado_id is not null then
      raise exception 'O representante indicado vem do código informado ao criar a conta.';
    end if;
    if new.usuario_id = auth.uid() then
      select p.representante_indicado_id into new.representante_indicado_id
      from public.perfis_usuario p
      where p.usuario_id = auth.uid();
    end if;
    return new;
  end if;
  if new.representante_indicado_id is distinct from old.representante_indicado_id then
    raise exception 'O representante indicado vem do código informado ao criar a conta.';
  end if;
  if old.status in ('publicado', 'pausado') and (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
    new.revisar := true;
  end if;
  return new;
end
$$;

drop function public.indicar_representante(text);

-- ---------------------------------------------------------------------------
-- 4. Negociação do cadastro
-- ---------------------------------------------------------------------------

/**
 * "Fechei com este comércio" e cadastro assistido: a negociação passa a ser de
 * quem cadastra (ou do representante que trouxe). Cadastro próprio: do
 * representante indicado, se ativo; sem ele, nenhuma negociação abre.
 */
create or replace function interno.cadastro_na_negociacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  responsavel uuid;
begin
  if new.representante_id is not null then
    select r.usuario_id into responsavel from public.representantes r where r.id = new.representante_id;
  elsif new.usuario_id is not null and new.usuario_id = new.cadastrado_por then
    responsavel := interno.usuario_do_representante_ativo(new.representante_indicado_id);
  else
    responsavel := new.cadastrado_por;
  end if;
  if responsavel is not null then
    perform interno.garantir_negociacao(new.id, 'assinatura', responsavel, true);
  end if;
  return null;
end
$$;
