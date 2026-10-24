-- Prospecção pelo representante (decisões de 23/10/2026):
-- - o representante converte o comércio importado da Receita para o
--   comerciante: informa o e-mail dele, o convite sai na hora, sem confirmação
--   da equipe, e o perfil fica ligado à conta do comerciante (o representante
--   nunca é dono do perfil; fica como quem trouxe);
-- - quem pede para não ser mais procurado sai da lista de prospecção
--   (Política de Privacidade v2, item 2.4; termo de confidencialidade, item 4.5).

-- ---------------------------------------------------------------------------
-- Conversão do importado
-- ---------------------------------------------------------------------------

/**
 * Primeiro passo: guarda o e-mail do comerciante e marca o representante que
 * trouxe. O servidor manda o convite depois (chave de serviço) e liga a conta
 * com vincular_conta_importado.
 */
create function public.preparar_conversao_importado(p_anunciante uuid, p_email text) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  rep uuid := interno.meu_representante_id();
  cadastro record;
begin
  if rep is null then
    raise exception 'Só o representante converte um comércio importado.';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 254 then
    raise exception 'E-mail inválido.';
  end if;
  select a.id, a.origem, a.usuario_id, a.status into cadastro from public.anunciantes a where a.id = p_anunciante for update;
  if cadastro.id is null or cadastro.origem <> 'receita' or cadastro.status <> 'publicado' then
    raise exception 'Este comércio não está na prospecção.';
  end if;
  if cadastro.usuario_id is not null then
    raise exception 'Este comércio já tem dono.';
  end if;
  perform set_config('app.vinculo_convite', 'sim', true);
  update public.anunciantes set email_convite = lower(p_email), representante_id = rep where id = p_anunciante;
  perform set_config('app.vinculo_convite', '', true);
end
$$;

/** Segundo passo: liga a conta convidada ao comércio, conferindo o e-mail. */
create function public.vincular_conta_importado(p_anunciante uuid, p_usuario uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  cadastro record;
begin
  select a.id, a.origem, a.usuario_id, a.email_convite, a.representante_id into cadastro
  from public.anunciantes a where a.id = p_anunciante for update;
  if cadastro.id is null or cadastro.origem <> 'receita' then
    raise exception 'Comércio não encontrado.';
  end if;
  if not (interno.eh_admin() or (cadastro.representante_id is not null and cadastro.representante_id = interno.meu_representante_id())) then
    raise exception 'Sem permissão para ligar a conta deste comércio.';
  end if;
  if cadastro.usuario_id is not null and cadastro.usuario_id <> p_usuario then
    raise exception 'Este comércio já está ligado a outra conta.';
  end if;
  if not exists (
    select 1 from auth.users u
    join public.perfis_usuario p on p.usuario_id = u.id
    where u.id = p_usuario
      and lower(u.email) = lower(cadastro.email_convite)
      and u.email_confirmed_at is null
      and p.papel = 'anunciante'
  ) then
    raise exception 'A conta não corresponde ao e-mail convidado.';
  end if;
  if exists (select 1 from public.anunciantes a where a.usuario_id = p_usuario and a.id <> p_anunciante) then
    raise exception 'Esta conta já tem outro cadastro.';
  end if;
  perform set_config('app.vinculo_convite', 'sim', true);
  update public.anunciantes set usuario_id = p_usuario where id = p_anunciante;
  perform set_config('app.vinculo_convite', '', true);
end
$$;

revoke execute on function public.preparar_conversao_importado(uuid, text) from public, anon;
grant execute on function public.preparar_conversao_importado(uuid, text) to authenticated;
revoke execute on function public.vincular_conta_importado(uuid, uuid) from public, anon;
grant execute on function public.vincular_conta_importado(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Não procurar mais
-- ---------------------------------------------------------------------------

create table public.nao_procurar (
  anunciante_id uuid primary key,
  cidade_id uuid not null,
  marcado_por uuid references auth.users (id) on delete set null,
  marcado_em timestamptz not null default now(),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade
);

/** Quem marcou é sempre quem está logado. */
create function interno.preparar_nao_procurar() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    new.marcado_por := auth.uid();
  end if;
  new.marcado_em := now();
  return new;
end
$$;

create trigger preparar before insert on public.nao_procurar
for each row execute function interno.preparar_nao_procurar();
create trigger auditar after insert or update or delete on public.nao_procurar
for each row execute function interno.auditar();

alter table public.nao_procurar enable row level security;

create policy "visitante sem acesso" on public.nao_procurar as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso" on public.nao_procurar for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
-- O representante marca (e vê a marcação, para a lista de prospecção); só a equipe desmarca.
create policy "representante lê" on public.nao_procurar for select to authenticated
  using ((select interno.meu_representante_id()) is not null);
create policy "representante marca" on public.nao_procurar for insert to authenticated
  with check ((select interno.meu_representante_id()) is not null and interno.anunciante_publico(anunciante_id));
create policy "administrador lê, marca e desmarca" on public.nao_procurar for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
