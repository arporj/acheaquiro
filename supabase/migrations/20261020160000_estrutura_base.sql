-- Etapa 1: localidades, catálogo, usuários, planos, configurações e auditoria
-- (Especificação Técnica v3, seções 6, 7 e 10.1). Tabelas e RLS no mesmo
-- arquivo: a migration é atômica, então nenhuma tabela fica sem proteção.
--
-- Papéis: visitante = role anon; anunciante, representante e administrador =
-- role authenticated, distinguidos por perfis_usuario.papel. O papel é lido
-- da tabela (e não do token) nas políticas, para que uma mudança de papel
-- valha na hora. Administrador só tem acesso com a segunda etapa (aal2).

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Funções de apoio ficam fora do esquema public, que é o exposto pela API.
create schema if not exists interno;
grant usage on schema interno to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.papel_usuario as enum ('anunciante', 'representante', 'administrador');
create type public.tipo_anunciante as enum ('profissional', 'comercio');
create type public.tipo_categoria as enum ('profissional', 'comercio', 'ambos');
create type public.selo_plano as enum ('nenhum', 'transparente', 'prata', 'ouro');
create type public.recurso_limite as enum ('fotos', 'categorias_adicionais', 'encartes_semana', 'produtos', 'enderecos');
create type public.documento_legal as enum ('termos', 'privacidade');
create type public.acao_acesso as enum ('login', 'logout', 'troca_de_senha');

-- ---------------------------------------------------------------------------
-- Funções sem dependência de tabela
-- ---------------------------------------------------------------------------

/** Minúsculas, sem acento e sem espaços nas pontas: o mesmo critério de normalizar() em apps/web/src/lib/texto.ts. */
create function interno.normalizar(texto text) returns text
language sql immutable parallel safe
set search_path = ''
as $$ select lower(trim(extensions.unaccent('extensions.unaccent'::regdictionary, texto))) $$;

create function interno.marcar_atualizacao() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 7.1 Localidades e catálogo
-- ---------------------------------------------------------------------------

create table public.cidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(nome) between 2 and 80),
  uf char(2) not null check (uf ~ '^[A-Z]{2}$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  dominio text unique,
  ativa boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.bairros (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  nome text not null check (length(nome) between 2 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cidade_id, slug)
);

create table public.grupos_categoria (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  nome text not null check (length(nome) between 2 and 60),
  ordem smallint not null,
  unique (cidade_id, nome),
  -- Alvo da chave composta de categorias: grupo e categoria da mesma cidade.
  unique (id, cidade_id)
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  grupo_id uuid not null,
  tipo public.tipo_categoria not null default 'ambos',
  nome text not null check (length(nome) between 2 and 60),
  nome_plural text not null check (length(nome_plural) between 2 and 60),
  -- Link curto (acheaquiro.com.br/eletricistas). Não pode coincidir com as rotas do site.
  slug_lista text not null check (
    slug_lista ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and slug_lista not in (
      'admin', 'anunciante', 'anuncie', 'api', 'busca', 'contato', 'entrar', 'fundadores', 'mock', 'perfil',
      'privacidade', 'r', 'recuperar-senha', 'representante', 'sobre', 'termos', '404'
    )
  ),
  icone text not null check (icone ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  cor text not null check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  exige_registro_conselho boolean not null default false,
  -- Posição nos atalhos da página inicial; vazio = não aparece nos atalhos.
  ordem_atalho smallint check (ordem_atalho > 0),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cidade_id, slug_lista),
  foreign key (grupo_id, cidade_id) references public.grupos_categoria (id, cidade_id)
);
create index categorias_grupo_id_idx on public.categorias (grupo_id);

create table public.sinonimos_categoria (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias (id) on delete cascade,
  termo text not null check (length(trim(termo)) between 2 and 60),
  termo_normalizado text generated always as (interno.normalizar(termo)) stored,
  unique (categoria_id, termo_normalizado)
);
create index sinonimos_categoria_trigrama_idx on public.sinonimos_categoria using gin (termo_normalizado extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 7.2 Usuários e documentos
-- ---------------------------------------------------------------------------

create table public.perfis_usuario (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  papel public.papel_usuario not null default 'anunciante',
  nome text not null default '' check (length(nome) <= 120),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.documentos_legais (
  id uuid primary key default gen_random_uuid(),
  documento public.documento_legal not null,
  versao text not null check (length(versao) between 1 and 20),
  vigente_desde date not null,
  texto_url text not null,
  unique (documento, versao)
);

create table public.aceites_documentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  documento public.documento_legal not null,
  versao text not null,
  aceito_em timestamptz not null default now(),
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),
  foreign key (documento, versao) references public.documentos_legais (documento, versao)
);
create index aceites_documentos_usuario_id_idx on public.aceites_documentos (usuario_id);

-- ---------------------------------------------------------------------------
-- 7.3 Planos, extras e configurações (valores e limites editáveis pela
-- administração, nunca fixos no código)
-- ---------------------------------------------------------------------------

create table public.planos (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  tipo public.tipo_anunciante not null,
  codigo text not null check (codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome text not null check (length(nome) between 2 and 40),
  nivel smallint not null check (nivel > 0),
  selo public.selo_plano not null default 'nenhum',
  valor_mensal_centavos integer not null check (valor_mensal_centavos >= 0),
  meses_cobrados_no_anual smallint not null default 10 check (meses_cobrados_no_anual between 1 and 12),
  limite_fotos integer not null default 0 check (limite_fotos >= 0),
  limite_categorias_adicionais integer not null default 0 check (limite_categorias_adicionais >= 0),
  limite_encartes_semana integer not null default 0 check (limite_encartes_semana >= 0),
  limite_produtos integer not null default 0 check (limite_produtos >= 0),
  limite_enderecos integer not null default 1 check (limite_enderecos >= 1),
  tem_relatorio boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cidade_id, codigo),
  unique (cidade_id, tipo, nivel)
);

create table public.extras (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  codigo text not null check (codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome text not null check (length(nome) between 2 and 60),
  valor_mensal_centavos integer not null check (valor_mensal_centavos >= 0),
  -- Pacotes que aumentam um limite do plano; vazio nos destaques e patrocínios.
  recurso public.recurso_limite,
  quantidade integer check (quantidade > 0),
  aceita_desconto_fundador boolean not null default false,
  permite_anual boolean not null default true,
  regras jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cidade_id, codigo),
  check ((recurso is null) = (quantidade is null))
);

create table public.configuracoes (
  cidade_id uuid not null references public.cidades (id),
  chave text not null check (chave ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  valor jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (cidade_id, chave)
);

-- ---------------------------------------------------------------------------
-- 7.5 Auditoria e controles de acesso
-- ---------------------------------------------------------------------------

create table public.auditoria (
  id bigint generated always as identity primary key,
  ator_id uuid,
  papel text not null,
  acao text not null,
  tabela text not null,
  registro_id text,
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);
create index auditoria_registro_idx on public.auditoria (tabela, registro_id);

-- Bloqueio de login (seção 6.2). As funções que gravam aqui entram no passo de
-- login, junto com o Turnstile.
create table public.tentativas_login (
  chave text primary key,
  falhas integer not null default 0 check (falhas >= 0),
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);

-- Art. 15 do Marco Civil: guardados por 6 meses (limpeza por tarefa agendada).
create table public.registros_acesso (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users (id) on delete set null,
  ip inet,
  user_agent text check (length(user_agent) <= 500),
  acao public.acao_acesso not null,
  criado_em timestamptz not null default now()
);
create index registros_acesso_criado_em_idx on public.registros_acesso (criado_em);

create table public.limites_requisicoes (
  chave text not null,
  janela_inicio timestamptz not null,
  contagem integer not null default 0 check (contagem >= 0),
  primary key (chave, janela_inicio)
);

-- ---------------------------------------------------------------------------
-- Funções que dependem das tabelas
-- ---------------------------------------------------------------------------

create function interno.tem_papel(p public.papel_usuario) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis_usuario where usuario_id = auth.uid() and papel = p)
$$;

/** Administrador com a segunda etapa de verificação (TOTP) feita nesta sessão. */
create function interno.eh_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' and interno.tem_papel('administrador')
$$;

/** Todo cadastro pelo site é de anunciante. O papel nunca vem dos dados enviados no cadastro. */
create function interno.criar_perfil_usuario() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.perfis_usuario (usuario_id, papel, nome)
  values (new.id, 'anunciante', left(coalesce(trim(new.raw_user_meta_data ->> 'nome'), ''), 120));
  return new;
end
$$;

create trigger ao_criar_usuario
after insert on auth.users
for each row execute function interno.criar_perfil_usuario();

/** Grava quem mudou o quê. Mudanças feitas fora do site (SQL, chave de serviço) ficam como "sistema". */
create function interno.auditar() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  registro jsonb := to_jsonb(coalesce(new, old));
  papel_ator text;
begin
  select p.papel::text into papel_ator from public.perfis_usuario p where p.usuario_id = auth.uid();
  insert into public.auditoria (ator_id, papel, acao, tabela, registro_id, antes, depois)
  values (
    auth.uid(),
    coalesce(papel_ator, 'sistema'),
    lower(tg_op),
    tg_table_name,
    coalesce(registro ->> 'id', registro ->> 'usuario_id', registro ->> 'chave'),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end
$$;

create function interno.impedir_alteracao() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'O log de auditoria não pode ser alterado nem apagado.';
end
$$;

create trigger auditoria_imutavel
before update or delete on public.auditoria
for each row execute function interno.impedir_alteracao();

-- Datas de atualização
create trigger marcar_atualizacao before update on public.bairros for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.categorias for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.perfis_usuario for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.planos for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.extras for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.configuracoes for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.tentativas_login for each row execute function interno.marcar_atualizacao();

-- Ações administrativas que afetam outros usuários (CLAUDE.md, log de auditoria).
-- As de anunciantes, pagamentos e comissões entram com as suas tabelas, na etapa 2.
-- Em perfis_usuario, a criação acompanha o cadastro e não é ação administrativa.
create trigger auditar after update or delete on public.perfis_usuario for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.planos for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.extras for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.configuracoes for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.documentos_legais for each row execute function interno.auditar();

-- ---------------------------------------------------------------------------
-- Gancho de token (Custom Access Token Hook): copia o papel para o token, para
-- as telas. Ligado no painel do Supabase no passo de login.
-- ---------------------------------------------------------------------------

create function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  papel_usuario public.papel_usuario;
begin
  select p.papel into papel_usuario from public.perfis_usuario p where p.usuario_id = (event ->> 'user_id')::uuid;
  claims := jsonb_set(claims, '{papel}', coalesce(to_jsonb(papel_usuario::text), 'null'::jsonb));
  return jsonb_set(event, '{claims}', claims);
end
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant select on table public.perfis_usuario to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Row Level Security (seção 10.1). Ligado em todas as tabelas.
-- ---------------------------------------------------------------------------

alter table public.cidades enable row level security;
alter table public.bairros enable row level security;
alter table public.grupos_categoria enable row level security;
alter table public.categorias enable row level security;
alter table public.sinonimos_categoria enable row level security;
alter table public.perfis_usuario enable row level security;
alter table public.documentos_legais enable row level security;
alter table public.aceites_documentos enable row level security;
alter table public.planos enable row level security;
alter table public.extras enable row level security;
alter table public.configuracoes enable row level security;
alter table public.auditoria enable row level security;
alter table public.tentativas_login enable row level security;
alter table public.registros_acesso enable row level security;
alter table public.limites_requisicoes enable row level security;

-- Catálogo público: visitante, anunciante e representante leem o que está
-- ativo; administrador lê e altera tudo. Uma política por papel.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('cidades', 'ativa'),
      ('bairros', 'ativo'),
      ('grupos_categoria', 'true'),
      ('categorias', 'ativa'),
      ('sinonimos_categoria', 'exists (select 1 from public.categorias c where c.id = categoria_id and c.ativa)'),
      ('planos', 'ativo'),
      ('extras', 'ativo'),
      ('documentos_legais', 'true')
    ) as v (tabela, visivel)
  loop
    execute format('create policy "visitante lê o que está ativo" on public.%I for select to anon using (%s)', t.tabela, t.visivel);
    execute format(
      'create policy "anunciante lê o que está ativo" on public.%I for select to authenticated using ((%s) and (select interno.tem_papel(''anunciante'')))',
      t.tabela, t.visivel);
    execute format(
      'create policy "representante lê o que está ativo" on public.%I for select to authenticated using ((%s) and (select interno.tem_papel(''representante'')))',
      t.tabela, t.visivel);
    execute format(
      'create policy "administrador lê e altera tudo" on public.%I for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()))',
      t.tabela);
  end loop;
end
$$;

-- Tabelas internas: o visitante não tem acesso nenhum (política restritiva explícita).
do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'perfis_usuario', 'aceites_documentos', 'configuracoes', 'auditoria', 'tentativas_login', 'registros_acesso', 'limites_requisicoes'
  ]
  loop
    execute format('create policy "visitante sem acesso" on public.%I as restrictive for all to anon using (false) with check (false)', tabela);
  end loop;
end
$$;

-- perfis_usuario: cada um lê o próprio; só o administrador altera (inclusive o papel).
create policy "anunciante lê o próprio perfil" on public.perfis_usuario
  for select to authenticated using (usuario_id = (select auth.uid()) and (select interno.tem_papel('anunciante')));
create policy "representante lê o próprio perfil" on public.perfis_usuario
  for select to authenticated using (usuario_id = (select auth.uid()) and (select interno.tem_papel('representante')));
create policy "administrador lê e altera perfis" on public.perfis_usuario
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
create policy "gancho de token lê papéis" on public.perfis_usuario
  for select to supabase_auth_admin using (true);

-- aceites_documentos: o usuário registra e lê os próprios aceites; ninguém altera nem apaga.
create policy "anunciante lê os próprios aceites" on public.aceites_documentos
  for select to authenticated using (usuario_id = (select auth.uid()) and (select interno.tem_papel('anunciante')));
create policy "anunciante registra o próprio aceite" on public.aceites_documentos
  for insert to authenticated with check (usuario_id = (select auth.uid()) and (select interno.tem_papel('anunciante')));
create policy "representante lê os próprios aceites" on public.aceites_documentos
  for select to authenticated using (usuario_id = (select auth.uid()) and (select interno.tem_papel('representante')));
create policy "representante registra o próprio aceite" on public.aceites_documentos
  for insert to authenticated with check (usuario_id = (select auth.uid()) and (select interno.tem_papel('representante')));
create policy "administrador lê os aceites" on public.aceites_documentos
  for select to authenticated using ((select interno.eh_admin()));

-- configuracoes: só o administrador (seção 10.1). Anunciante e representante não têm acesso.
create policy "administrador lê e altera configurações" on public.configuracoes
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- auditoria, tentativas_login, registros_acesso, limites_requisicoes: o administrador só lê.
-- Anunciante e representante não têm acesso. As gravações vêm de gatilhos e funções do servidor.
create policy "administrador lê a auditoria" on public.auditoria for select to authenticated using ((select interno.eh_admin()));
create policy "administrador lê as tentativas de login" on public.tentativas_login for select to authenticated using ((select interno.eh_admin()));
create policy "administrador lê os registros de acesso" on public.registros_acesso for select to authenticated using ((select interno.eh_admin()));
create policy "administrador lê os limites de requisições" on public.limites_requisicoes for select to authenticated using ((select interno.eh_admin()));
