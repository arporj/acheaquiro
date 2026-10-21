-- Equipe e SupraAdmin (decisões de 22/10/2026, CLAUDE.md):
-- - qualquer conta pode ser desativada (perde o papel na hora, porque as
--   políticas leem a tabela, e o servidor bloqueia a entrada no Auth);
-- - sempre um, e só um, SupraAdmin: nenhum administrador muda o papel dele,
--   o desativa ou retira a marcação; só ele a transfere, e então a perde;
-- - ninguém muda o próprio papel nem se desativa.

alter table public.perfis_usuario
  add column ativo boolean not null default true,
  add column supra_admin boolean not null default false,
  add constraint supra_admin_e_administrador_ativo check (not supra_admin or (papel = 'administrador' and ativo));
create unique index perfis_usuario_um_supra_admin_idx on public.perfis_usuario (supra_admin) where supra_admin;

-- O papel só vale com a conta ativa.
create or replace function interno.tem_papel(p public.papel_usuario) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis_usuario where usuario_id = auth.uid() and papel = p and ativo)
$$;

create function interno.proteger_perfil_usuario() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.supra_admin then
      raise exception 'A conta do SupraAdmin não pode ser apagada. Transfira a marcação antes.';
    end if;
    return old;
  end if;
  -- A transferência (transferir_supra_admin) é o único caminho para mexer na marcação.
  if current_setting('app.transferencia_supra_admin', true) = 'sim' then
    return new;
  end if;
  if new.supra_admin is distinct from old.supra_admin then
    raise exception 'Só o SupraAdmin transfere a marcação de SupraAdmin.';
  end if;
  if old.supra_admin and (new.papel is distinct from old.papel or new.ativo is distinct from old.ativo) then
    raise exception 'O SupraAdmin não pode ser rebaixado nem desativado.';
  end if;
  if coalesce(auth.role(), '') = 'authenticated' and new.usuario_id = auth.uid()
     and (new.papel is distinct from old.papel or new.ativo is distinct from old.ativo) then
    raise exception 'Ninguém muda o próprio papel nem desativa a própria conta.';
  end if;
  return new;
end
$$;

create trigger proteger before update or delete on public.perfis_usuario
for each row execute function interno.proteger_perfil_usuario();

/**
 * Transfere a marcação de SupraAdmin para outro administrador ativo. Só o
 * SupraAdmin chama, com a segunda etapa feita (o servidor pede o código do
 * aplicativo de novo antes de chamar). Fica na auditoria em nome dele.
 */
create function public.transferir_supra_admin(p_novo uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if not interno.eh_admin()
     or not exists (select 1 from public.perfis_usuario where usuario_id = auth.uid() and supra_admin) then
    raise exception 'Só o SupraAdmin transfere a marcação de SupraAdmin.';
  end if;
  if p_novo = auth.uid() then
    raise exception 'Escolha outro administrador.';
  end if;
  if not exists (select 1 from public.perfis_usuario where usuario_id = p_novo and papel = 'administrador' and ativo) then
    raise exception 'O novo SupraAdmin precisa ser um administrador ativo.';
  end if;
  perform set_config('app.transferencia_supra_admin', 'sim', true);
  update public.perfis_usuario set supra_admin = false where usuario_id = auth.uid();
  update public.perfis_usuario set supra_admin = true where usuario_id = p_novo;
  perform set_config('app.transferencia_supra_admin', '', true);
end
$$;

/** Administradores e representantes, com o e-mail (que fica no Auth). Só para administrador com segunda etapa. */
create function public.listar_equipe()
returns table (
  usuario_id uuid,
  email text,
  nome text,
  papel public.papel_usuario,
  ativo boolean,
  supra_admin boolean,
  convite_aceito boolean,
  ultimo_acesso timestamptz,
  criado_em timestamptz,
  codigo_representante text
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not interno.eh_admin() then
    raise exception 'Sem permissão.';
  end if;
  return query
    select p.usuario_id, u.email::text, p.nome, p.papel, p.ativo, p.supra_admin,
           u.email_confirmed_at is not null, u.last_sign_in_at, p.criado_em, r.codigo
    from public.perfis_usuario p
    join auth.users u on u.id = p.usuario_id
    left join public.representantes r on r.usuario_id = p.usuario_id
    where p.papel in ('administrador', 'representante')
    order by p.supra_admin desc, p.papel, p.nome, u.email;
end
$$;

/** E-mail de cada pessoa que aparece no registro de atividades. Só para administrador com segunda etapa. */
create function public.emails_de_usuarios(p_ids uuid[])
returns table (usuario_id uuid, email text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not interno.eh_admin() then
    raise exception 'Sem permissão.';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 200 then
    raise exception 'No máximo 200 pessoas por consulta.';
  end if;
  return query select u.id, u.email::text from auth.users u where u.id = any (p_ids);
end
$$;

revoke execute on function public.transferir_supra_admin(uuid) from public, anon;
revoke execute on function public.listar_equipe() from public, anon;
revoke execute on function public.emails_de_usuarios(uuid[]) from public, anon;
grant execute on function public.transferir_supra_admin(uuid) to authenticated;
grant execute on function public.listar_equipe() to authenticated;
grant execute on function public.emails_de_usuarios(uuid[]) to authenticated;

-- O primeiro SupraAdmin é o administrador mais antigo (o André, criado em 21/10/2026).
-- set_config de sessão (false): a migration pode não rodar dentro de um bloco de transação.
select set_config('app.transferencia_supra_admin', 'sim', false);
update public.perfis_usuario set supra_admin = true
where usuario_id = (
  select usuario_id from public.perfis_usuario where papel = 'administrador' and ativo order by criado_em limit 1
);
select set_config('app.transferencia_supra_admin', '', false);
