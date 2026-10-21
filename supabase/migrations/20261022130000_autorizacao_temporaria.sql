-- Autorização temporária de edição (decisão do André em 22/10/2026): o
-- anunciante autoriza um representante a alterar o perfil por um tempo
-- ("nas próximas duas horas, autorizo fulano"). O representante que trouxe o
-- anunciante continua editando sem autorização só no cadastro assistido,
-- antes de o anunciante assumir. Os administradores mexem em tudo. Toda
-- alteração fica na auditoria, com quem fez.

create table public.autorizacoes_edicao (
  id uuid primary key default gen_random_uuid(),
  anunciante_id uuid not null,
  cidade_id uuid not null,
  autorizado_id uuid not null references auth.users (id) on delete cascade,
  criada_por uuid default auth.uid() references auth.users (id) on delete set null,
  criada_em timestamptz not null default now(),
  valida_ate timestamptz not null,
  revogada_em timestamptz,
  -- Até 7 dias; para mais, uma nova autorização.
  check (valida_ate > criada_em and valida_ate <= criada_em + interval '7 days'),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade
);
create index autorizacoes_edicao_autorizado_idx on public.autorizacoes_edicao (autorizado_id, valida_ate);
create index autorizacoes_edicao_anunciante_idx on public.autorizacoes_edicao (anunciante_id);

/** Só representantes ativos podem receber autorização. */
create function interno.eh_representante_ativo(p_usuario uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.representantes r
    join public.perfis_usuario p on p.usuario_id = r.usuario_id
    where r.usuario_id = p_usuario and r.ativo and p.papel = 'representante'
  )
$$;

create function interno.autorizado_agora(p_anunciante uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.autorizacoes_edicao a
    where a.anunciante_id = p_anunciante
      and a.autorizado_id = auth.uid()
      and a.revogada_em is null
      and now() < a.valida_ate
  ) and interno.eh_representante_ativo(auth.uid())
$$;

-- As funções de permissão passam a considerar a autorização em vigor.
create or replace function interno.pode_ver_anunciante(p_anunciante uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.eh_admin() or interno.autorizado_agora(p_anunciante) or exists (
    select 1 from public.anunciantes a
    where a.id = p_anunciante
      and ((a.usuario_id = auth.uid() and interno.tem_papel('anunciante'))
           or (a.representante_id is not null and a.representante_id = interno.meu_representante_id()))
  )
$$;

create or replace function interno.pode_editar_anunciante(p_anunciante uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.eh_admin() or interno.autorizado_agora(p_anunciante) or exists (
    select 1 from public.anunciantes a
    where a.id = p_anunciante
      and ((a.usuario_id = auth.uid() and interno.tem_papel('anunciante'))
           or (a.representante_id is not null
               and a.representante_id = interno.meu_representante_id()
               and a.status in ('rascunho', 'aguardando_anunciante')))
  )
$$;

-- O próprio perfil (tabela anunciantes) também segue a autorização.
create policy "representante autorizado lê o perfil" on public.anunciantes
  for select to authenticated using ((select interno.autorizado_agora(id)));
create policy "representante autorizado altera o perfil" on public.anunciantes
  for update to authenticated using ((select interno.autorizado_agora(id))) with check ((select interno.autorizado_agora(id)));

/**
 * O dono cria e cancela; ninguém muda para quem nem até quando foi dada (para
 * estender, uma nova autorização). Revogar é só preencher revogada_em.
 */
create function interno.proteger_autorizacao() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if interno.eh_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not interno.eh_representante_ativo(new.autorizado_id) then
      raise exception 'Só um representante do Ache Aqui RO pode receber autorização.';
    end if;
    new.criada_por := auth.uid();
    new.criada_em := now();
    new.revogada_em := null;
    return new;
  end if;
  if new.anunciante_id is distinct from old.anunciante_id
     or new.autorizado_id is distinct from old.autorizado_id
     or new.valida_ate is distinct from old.valida_ate
     or new.criada_por is distinct from old.criada_por
     or new.criada_em is distinct from old.criada_em
     or (old.revogada_em is not null and new.revogada_em is distinct from old.revogada_em) then
    raise exception 'A autorização só pode ser cancelada; para mudar, crie outra.';
  end if;
  return new;
end
$$;

create trigger proteger before insert or update on public.autorizacoes_edicao
for each row execute function interno.proteger_autorizacao();
create trigger auditar after insert or update or delete on public.autorizacoes_edicao
for each row execute function interno.auditar();

alter table public.autorizacoes_edicao enable row level security;

create policy "visitante sem acesso" on public.autorizacoes_edicao as restrictive for all to anon using (false) with check (false);
create policy "anunciante vê as autorizações do próprio perfil" on public.autorizacoes_edicao
  for select to authenticated using (exists (
    select 1 from public.anunciantes a where a.id = anunciante_id and a.usuario_id = (select auth.uid())
  ) and (select interno.tem_papel('anunciante')));
create policy "anunciante autoriza no próprio perfil" on public.autorizacoes_edicao
  for insert to authenticated with check (exists (
    select 1 from public.anunciantes a where a.id = anunciante_id and a.usuario_id = (select auth.uid())
  ) and (select interno.tem_papel('anunciante')));
create policy "anunciante cancela autorização do próprio perfil" on public.autorizacoes_edicao
  for update to authenticated using (exists (
    select 1 from public.anunciantes a where a.id = anunciante_id and a.usuario_id = (select auth.uid())
  ) and (select interno.tem_papel('anunciante')));
create policy "representante vê as autorizações recebidas" on public.autorizacoes_edicao
  for select to authenticated using (autorizado_id = (select auth.uid()) and (select interno.tem_papel('representante')));
create policy "administrador lê e altera autorizações" on public.autorizacoes_edicao
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

revoke execute on function interno.eh_representante_ativo(uuid) from public, anon;
revoke execute on function interno.autorizado_agora(uuid) from public, anon;
grant execute on function interno.eh_representante_ativo(uuid) to authenticated;
grant execute on function interno.autorizado_agora(uuid) to authenticated;
