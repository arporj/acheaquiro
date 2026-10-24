-- Área do representante, etapa 1 (decisões de 23 e 24/10/2026):
-- - termo de confidencialidade aceito e verificação em duas etapas antes de o
--   representante ver qualquer dado de anunciante ou da Receita;
-- - marcação "recebe comissão" (o sócio é um representante que, por enquanto,
--   não recebe);
-- - chave Pix informada pelo próprio representante, com auditoria;
-- - histórico de atendimento: registro manual de quem entrou em contato com o
--   anunciante, em que dia e, se quiser, o resultado. Na prospecção, os outros
--   representantes veem só o nome de quem fez o último contato e o dia;
-- - conferência do código do link acheaquiro.com.br/r/codigo.

insert into public.documentos_legais (documento, versao, vigente_desde, texto_url) values
  ('confidencialidade', '1', '2026-10-24', '/representante/termo');

alter table public.representantes
  add column recebe_comissao boolean not null default true;

-- ---------------------------------------------------------------------------
-- Termo aceito e segunda etapa
-- ---------------------------------------------------------------------------

/** O usuário aceitou a versão em vigor do termo de confidencialidade. */
create function interno.aceitou_confidencialidade() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.aceites_documentos a
    where a.usuario_id = auth.uid()
      and a.documento = 'confidencialidade'
      and a.versao = (
        select d.versao from public.documentos_legais d
        where d.documento = 'confidencialidade' and d.vigente_desde <= (now() at time zone 'America/Sao_Paulo')::date
        order by d.vigente_desde desc
        limit 1
      )
  )
$$;

-- Todas as políticas do representante passam por esta função: sem a segunda
-- etapa nesta sessão ou sem o termo aceito, ele não é tratado como representante.
create or replace function interno.meu_representante_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select r.id from public.representantes r
  where r.usuario_id = auth.uid() and r.ativo and interno.tem_papel('representante')
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and interno.aceitou_confidencialidade()
$$;

-- A autorização temporária do anunciante segue as mesmas exigências.
create or replace function interno.autorizado_agora(p_anunciante uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.autorizacoes_edicao a
    where a.anunciante_id = p_anunciante
      and a.autorizado_id = auth.uid()
      and a.revogada_em is null
      and now() < a.valida_ate
  ) and interno.meu_representante_id() is not null
$$;

drop policy "representante lê para prospectar" on public.dados_receita;
create policy "representante lê para prospectar" on public.dados_receita
  for select to authenticated using ((select interno.meu_representante_id()) is not null);

-- ---------------------------------------------------------------------------
-- Chave Pix e código do link
-- ---------------------------------------------------------------------------

/**
 * O representante grava a própria chave Pix (a política da tabela não deixa
 * ele alterar o cadastro). A validação do formato fica em packages/validation;
 * a troca fica na auditoria pelo gatilho da tabela.
 */
create function public.salvar_minha_chave_pix(p_chave text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  rep uuid := interno.meu_representante_id();
begin
  if rep is null then
    raise exception 'Só o representante grava a própria chave Pix.';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 3 and 100 then
    raise exception 'Chave Pix inválida.';
  end if;
  update public.representantes set chave_pix = trim(p_chave) where id = rep;
end
$$;

/** Código do link /r/codigo de um representante ativo (inclusive o sócio, que é administrador). */
create function public.codigo_representante_valido(p_codigo text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.representantes r
    join public.perfis_usuario p on p.usuario_id = r.usuario_id
    where r.codigo = p_codigo and r.ativo and p.ativo
  )
$$;

-- ---------------------------------------------------------------------------
-- Histórico de atendimento
-- ---------------------------------------------------------------------------

create table public.atendimentos (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null,
  anunciante_id uuid not null,
  autor_id uuid not null references auth.users (id) on delete restrict,
  -- Dia do contato (pode ser registrado depois, até 30 dias atrás).
  dia date not null,
  -- Resultado do contato, opcional.
  observacao text not null default '' check (length(observacao) <= 300),
  criado_em timestamptz not null default now(),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade
);
create index atendimentos_anunciante_idx on public.atendimentos (anunciante_id, dia desc);
create index atendimentos_autor_idx on public.atendimentos (autor_id, dia desc);

/** O autor é sempre quem está logado, e o dia não fica no futuro nem mais de 30 dias atrás. */
create function interno.preparar_atendimento() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    new.autor_id := auth.uid();
  end if;
  new.dia := coalesce(new.dia, hoje);
  if new.dia > hoje or new.dia < hoje - 30 then
    raise exception 'O dia do contato vai de 30 dias atrás até hoje.';
  end if;
  new.observacao := trim(new.observacao);
  return new;
end
$$;

create trigger preparar before insert on public.atendimentos
for each row execute function interno.preparar_atendimento();
create trigger auditar after update or delete on public.atendimentos
for each row execute function interno.auditar();

alter table public.atendimentos enable row level security;

create policy "visitante sem acesso" on public.atendimentos as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso" on public.atendimentos for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
-- O representante registra contato com quem ele atende e com qualquer perfil
-- publicado (inclusive os importados da Receita, na prospecção); lê só os próprios registros.
create policy "representante lê os próprios registros" on public.atendimentos for select to authenticated
  using (autor_id = (select auth.uid()) and (select interno.meu_representante_id()) is not null);
create policy "representante registra contato" on public.atendimentos for insert to authenticated
  with check (
    (select interno.meu_representante_id()) is not null
    and (interno.anunciante_publico(anunciante_id) or interno.pode_ver_anunciante(anunciante_id))
  );
create policy "administrador lê, registra e apaga" on public.atendimentos for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

/**
 * Último contato com cada anunciante da lista, para a prospecção: só o nome
 * de quem fez e o dia, sem a observação (decisão Y1, de 24/10/2026).
 */
create function public.ultimos_contatos(p_anunciantes uuid[])
returns table (anunciante_id uuid, autor_nome text, dia date)
language sql stable security definer
set search_path = ''
as $$
  select distinct on (a.anunciante_id) a.anunciante_id, coalesce(nullif(p.nome, ''), 'Equipe'), a.dia
  from public.atendimentos a
  left join public.perfis_usuario p on p.usuario_id = a.autor_id
  where a.anunciante_id = any (p_anunciantes)
    and (interno.meu_representante_id() is not null or interno.eh_admin())
  order by a.anunciante_id, a.dia desc, a.criado_em desc
$$;

revoke execute on function interno.aceitou_confidencialidade() from public, anon;
grant execute on function interno.aceitou_confidencialidade() to authenticated;
revoke execute on function public.salvar_minha_chave_pix(text) from public, anon;
grant execute on function public.salvar_minha_chave_pix(text) to authenticated;
revoke execute on function public.ultimos_contatos(uuid[]) from public, anon;
grant execute on function public.ultimos_contatos(uuid[]) to authenticated;
revoke execute on function public.codigo_representante_valido(text) from public;
grant execute on function public.codigo_representante_valido(text) to anon, authenticated;
