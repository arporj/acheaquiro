-- Situação de um e-mail no convite da equipe (decisão de 02/11/2026): a tela
-- de /admin/equipe avisa, enquanto o administrador digita, se o e-mail já é de
-- alguém da equipe (ativo ou desativado), de um anunciante ou de um cadastro de
-- anunciante em andamento. O e-mail das contas fica em auth.users, que só uma
-- função security definer lê. Só para administrador com segunda etapa.
--
-- Situações:
-- - equipe_ativo: administrador ou representante ativo.
-- - equipe_desativado: administrador ou representante desativado (o convite reativa a mesma conta).
-- - anunciante: conta de anunciante.
-- - outra_conta: conta sem perfil (não deveria existir; o gatilho cria o perfil).
-- - cadastro_anunciante: cadastro assistido com este e-mail, ainda sem conta.
-- Sem linha: e-mail livre.
create function public.situacao_email_equipe(p_email text)
returns table (
  situacao text,
  usuario_id uuid,
  nome text,
  papel public.papel_usuario,
  codigo_representante text,
  convite_aceito boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  email_procurado text := lower(trim(p_email));
  conta_id uuid;
begin
  if not interno.eh_admin() then
    raise exception 'Sem permissão.';
  end if;

  select u.id into conta_id from auth.users u where lower(u.email) = email_procurado limit 1;

  if conta_id is not null then
    return query
      select
        case
          when p.usuario_id is null then 'outra_conta'
          when p.papel in ('administrador', 'representante') and p.ativo then 'equipe_ativo'
          when p.papel in ('administrador', 'representante') then 'equipe_desativado'
          else 'anunciante'
        end,
        u.id, p.nome, p.papel, r.codigo, u.email_confirmed_at is not null
      from auth.users u
      left join public.perfis_usuario p on p.usuario_id = u.id
      left join public.representantes r on r.usuario_id = u.id
      where u.id = conta_id;
    return;
  end if;

  return query
    select 'cadastro_anunciante', null::uuid, a.nome, null::public.papel_usuario, null::text, false
    from public.anunciantes a
    where lower(a.email_convite) = email_procurado
    limit 1;
end
$$;

revoke execute on function public.situacao_email_equipe(text) from public, anon;
grant execute on function public.situacao_email_equipe(text) to authenticated;
