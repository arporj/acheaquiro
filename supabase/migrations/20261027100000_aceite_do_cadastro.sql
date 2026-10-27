-- Aceite do cadastro assistido (área do anunciante, 27/10/2026): o anunciante
-- convidado confere o cadastro, aceita os Termos de Uso e a Política de
-- Privacidade e envia para análise. O banco só deixa o cadastro sair de
-- "rascunho" ou "aguardando o anunciante" para "em análise" com o aceite das
-- versões em vigor: chamar a API direto, sem a tela, não pula o aceite.

/** O usuário logado aceitou a versão em vigor do documento. */
create function interno.aceitou_documento(p_documento public.documento_legal) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.aceites_documentos a
    where a.usuario_id = auth.uid()
      and a.documento = p_documento
      and a.versao = (
        select d.versao from public.documentos_legais d
        where d.documento = p_documento and d.vigente_desde <= (now() at time zone 'America/Sao_Paulo')::date
        order by d.vigente_desde desc
        limit 1
      )
  )
$$;

create function interno.exigir_aceite() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or interno.eh_admin() then
    return new;
  end if;
  if not (interno.aceitou_documento('termos') and interno.aceitou_documento('privacidade')) then
    raise exception 'Aceite os Termos de Uso e a Política de Privacidade para enviar o cadastro.';
  end if;
  return new;
end
$$;

create trigger exigir_aceite before update of status on public.anunciantes
for each row
when (new.status = 'em_analise' and old.status in ('rascunho', 'aguardando_anunciante'))
execute function interno.exigir_aceite();

/**
 * Nome de quem fez o cadastro assistido, para o anunciante conferir na área
 * dele (ele não lê a tabela de representantes). Vazio se o cadastro não é dele
 * ou se foi feito pela equipe.
 */
create function public.representante_do_meu_cadastro(p_anunciante uuid) returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce(nullif(p.nome, ''), r.codigo)
  from public.anunciantes a
  join public.representantes r on r.id = a.representante_id
  left join public.perfis_usuario p on p.usuario_id = r.usuario_id
  where a.id = p_anunciante and a.usuario_id = auth.uid()
$$;

revoke execute on function public.representante_do_meu_cadastro(uuid) from public, anon;
grant execute on function public.representante_do_meu_cadastro(uuid) to authenticated;
