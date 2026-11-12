-- Denúncia de perfil (item 4.9 da especificação; decisões D1 e D2 de 12/11/2026).
-- O visitante denuncia sem conta e sem se identificar; a denúncia entra pelo
-- servidor (chave de serviço), com o Turnstile e os limites conferidos antes,
-- e vai para a fila da administração (/admin/denuncias). Não guarda o IP nem o
-- resumo do visitante: os limites ficam em limites_requisicoes.
-- D1: motivos da especificação somados aos da decisão de 21/10/2026.
-- D2: cada administrador ativo recebe um e-mail na primeira denúncia de cada
-- perfil no dia; as seguintes do mesmo dia só entram na tela.

create type public.motivo_denuncia as enum (
  'informacao_falsa', 'telefone_errado', 'servico_nao_prestado',
  'foto_ou_texto_improprio', 'conteudo_sexual', 'propaganda_politica', 'outro'
);
create type public.situacao_denuncia as enum ('aberta', 'procedente', 'improcedente');

create table public.denuncias (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  anunciante_id uuid not null references public.anunciantes (id) on delete cascade,
  motivo public.motivo_denuncia not null,
  descricao text not null default '' check (length(descricao) <= 500),
  situacao public.situacao_denuncia not null default 'aberta',
  observacao_equipe text check (length(observacao_equipe) <= 1000),
  tratada_por uuid references auth.users (id) on delete set null,
  tratada_em timestamptz,
  criado_em timestamptz not null default now(),
  check (motivo <> 'outro' or length(trim(descricao)) >= 10),
  check ((situacao = 'aberta') = (tratada_em is null))
);
create index denuncias_anunciante_id_idx on public.denuncias (anunciante_id);
create index denuncias_cidade_situacao_idx on public.denuncias (cidade_id, situacao, criado_em);
create index denuncias_tratada_por_idx on public.denuncias (tratada_por);

/**
 * Quem tratou e quando são gravados pelo banco, e não pela tela. Uma denúncia
 * tratada não volta a ficar aberta nem troca de perfil, motivo ou texto.
 */
create function interno.tratar_denuncia() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.anunciante_id <> old.anunciante_id or new.motivo <> old.motivo or new.descricao <> old.descricao
     or new.cidade_id <> old.cidade_id or new.criado_em <> old.criado_em then
    raise exception 'A denúncia não pode ser alterada, só tratada.';
  end if;
  if old.situacao <> 'aberta' then
    raise exception 'Esta denúncia já foi tratada.';
  end if;
  if new.situacao <> 'aberta' then
    new.tratada_por := auth.uid();
    new.tratada_em := now();
  else
    new.tratada_por := null;
    new.tratada_em := null;
  end if;
  return new;
end
$$;

create trigger tratar before update on public.denuncias for each row execute function interno.tratar_denuncia();
create trigger auditar after update or delete on public.denuncias for each row execute function interno.auditar();

-- ---------------------------------------------------------------------------
-- E-mail aos administradores (D2)
-- ---------------------------------------------------------------------------

-- Como o aviso da escala de Fundador, o da denúncia vai para a equipe, e não
-- para um anunciante: fica sem anunciante_id, e o perfil vai nos dados.
alter table public.avisos_email drop constraint avisos_email_tipo_check;
alter table public.avisos_email add constraint avisos_email_tipo_check
  check (tipo in ('lembrete_7_dias', 'lembrete_vencimento', 'plano_vencido', 'aviso_preco', 'escala_fundador', 'proposta', 'denuncia'));
alter table public.avisos_email drop constraint avisos_email_destinatario_check;
alter table public.avisos_email add constraint avisos_email_destinatario_check
  check ((tipo in ('escala_fundador', 'denuncia')) = (anunciante_id is null));
create index avisos_email_denuncia_idx on public.avisos_email ((dados ->> 'anuncianteId'), referencia) where tipo = 'denuncia';

/**
 * Grava a denúncia de um perfil publicado e, se for a primeira desse perfil no
 * dia, põe na fila um e-mail para cada administrador ativo. Chamada só pelo
 * servidor, depois do Turnstile, da validação e dos limites.
 * p_rotulo_motivo: o texto do motivo, montado no servidor (packages/validation),
 * para o e-mail não repetir a lista. Devolve false se o perfil não está no ar.
 */
create function public.registrar_denuncia(p_anunciante uuid, p_motivo public.motivo_denuncia, p_descricao text, p_rotulo_motivo text)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_cidade uuid;
  v_nome text;
  v_slug text;
  v_hoje date := interno.hoje();
begin
  select a.cidade_id, a.nome, a.slug into v_cidade, v_nome, v_slug
  from public.anunciantes a
  where a.id = p_anunciante and a.status = 'publicado';
  if v_cidade is null then
    return false;
  end if;

  insert into public.denuncias (cidade_id, anunciante_id, motivo, descricao)
  values (v_cidade, p_anunciante, p_motivo, left(coalesce(trim(p_descricao), ''), 500));

  -- O texto de quem denunciou não vai no e-mail: só o perfil e o motivo.
  if not exists (
    select 1 from public.avisos_email
    where tipo = 'denuncia' and referencia = v_hoje and dados ->> 'anuncianteId' = p_anunciante::text
  ) then
    insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
    select v_cidade, null, 'denuncia', v_hoje, u.email,
           jsonb_build_object('anuncianteId', p_anunciante, 'nome', v_nome, 'slug', v_slug, 'motivo', left(p_rotulo_motivo, 60)),
           0
    from public.perfis_usuario p
    join auth.users u on u.id = p.usuario_id
    where p.papel = 'administrador' and p.ativo and u.email is not null;
  end if;
  return true;
end
$$;

revoke execute on function public.registrar_denuncia(uuid, public.motivo_denuncia, text, text) from public, anon, authenticated;
grant execute on function public.registrar_denuncia(uuid, public.motivo_denuncia, text, text) to service_role;
revoke execute on function interno.tratar_denuncia() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security, uma política por papel
-- ---------------------------------------------------------------------------

alter table public.denuncias enable row level security;

-- Visitante: denuncia só pela rota do site (registrar_denuncia, chave de serviço).
create policy "visitante sem acesso" on public.denuncias as restrictive for all to anon using (false) with check (false);
-- Anunciante e representante: não leem as denúncias (nem as do próprio perfil),
-- para não saberem quem pode ter denunciado. Só a administração.
create policy "só a administração" on public.denuncias as restrictive for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
create policy "administrador lê" on public.denuncias
  for select to authenticated using ((select interno.eh_admin()));
create policy "administrador trata" on public.denuncias
  for update to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
