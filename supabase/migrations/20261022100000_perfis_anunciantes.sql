-- Perfis dos anunciantes (Especificação Técnica, seções 7.2 e 7.4; itens 4.3,
-- 4.4 e 4.12 da Especificação Funcional), com as decisões de 21/10/2026:
-- - fotos, encartes e alterações de perfil publicados na hora, sem aprovação
--   prévia; o controle é o registro de quem enviou, a denúncia e a remoção
--   pelo administrador (status "removida");
-- - registro de toda alteração feita por qualquer conta logada (auditoria),
--   e não só das ações administrativas;
-- - par de antes e depois dentro da galeria (divergência 1 da seção 13).
-- A primeira publicação do perfil continua passando pela administração.

create extension if not exists postgis with schema extensions;

create type public.status_anunciante as enum (
  'rascunho', 'aguardando_anunciante', 'em_analise', 'aguardando_pagamento',
  'publicado', 'pausado', 'escondido_por_vencimento', 'suspenso'
);
create type public.forma_pagamento as enum ('pix', 'cartao', 'dinheiro');
create type public.finalidade_bairro as enum ('atendimento', 'entrega');
create type public.finalidade_foto as enum ('perfil', 'galeria', 'produto');
create type public.papel_no_par as enum ('antes', 'depois');
create type public.situacao_conteudo as enum ('publicado', 'removido');
create type public.tipo_arquivo as enum ('imagem', 'pdf');

-- Alvos das chaves compostas (registro e cidade iguais): um anunciante de uma
-- cidade não aponta para categoria ou bairro de outra.
alter table public.categorias add constraint categorias_id_cidade_key unique (id, cidade_id);
alter table public.bairros add constraint bairros_id_cidade_key unique (id, cidade_id);

-- ---------------------------------------------------------------------------
-- Representantes (seção 7.4). Comissões entram com os pagamentos.
-- ---------------------------------------------------------------------------

create table public.representantes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users (id) on delete restrict,
  cidade_id uuid not null references public.cidades (id),
  -- Compõe o link acheaquiro.com.br/r/codigo.
  codigo text not null unique check (codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(codigo) between 3 and 30),
  chave_pix text check (length(chave_pix) <= 100),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Anunciantes e tabelas do perfil
-- ---------------------------------------------------------------------------

create table public.anunciantes (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  tipo public.tipo_anunciante not null,
  -- Endereço do perfil (/perfil/slug): só a administração troca, para não quebrar links já compartilhados.
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  nome text not null check (length(trim(nome)) between 2 and 100),
  usuario_id uuid unique references auth.users (id) on delete set null,
  representante_id uuid references public.representantes (id) on delete set null,
  cadastrado_por uuid references auth.users (id) on delete set null,
  status public.status_anunciante not null default 'rascunho',
  -- Plano em vigor; muda quando a assinatura é confirmada ou vence (item do Pix).
  plano_id uuid references public.planos (id),
  fundador boolean not null default false,
  fundador_desde date,
  categoria_principal_id uuid not null,
  descricao text not null default '' check (length(descricao) <= 2000),
  -- Só números, com DDD (e o 55 opcional): 22999998888.
  whatsapp text check (whatsapp ~ '^[0-9]{10,13}$'),
  telefone text check (telefone ~ '^[0-9]{10,13}$'),
  instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  formas_pagamento public.forma_pagamento[] not null default '{}',
  registro_conselho text check (length(registro_conselho) <= 60),
  site_proprio text check (site_proprio ~ '^https://[^\s]{4,300}$'),
  atende_toda_cidade boolean not null default false,
  faz_entrega boolean not null default false,
  entrega_toda_cidade boolean not null default false,
  aprovado_em timestamptz,
  aprovado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cidade_id, slug),
  unique (id, cidade_id),
  check ((fundador and fundador_desde is not null) or (not fundador and fundador_desde is null)),
  foreign key (categoria_principal_id, cidade_id) references public.categorias (id, cidade_id)
);
create index anunciantes_representante_id_idx on public.anunciantes (representante_id);
create index anunciantes_categoria_principal_id_idx on public.anunciantes (categoria_principal_id);
create index anunciantes_status_idx on public.anunciantes (cidade_id, status);

create table public.anunciante_categorias (
  anunciante_id uuid not null,
  categoria_id uuid not null,
  cidade_id uuid not null,
  primary key (anunciante_id, categoria_id),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade,
  foreign key (categoria_id, cidade_id) references public.categorias (id, cidade_id)
);
create index anunciante_categorias_categoria_id_idx on public.anunciante_categorias (categoria_id);

create table public.anunciante_bairros (
  anunciante_id uuid not null,
  bairro_id uuid not null,
  cidade_id uuid not null,
  finalidade public.finalidade_bairro not null,
  primary key (anunciante_id, bairro_id, finalidade),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade,
  foreign key (bairro_id, cidade_id) references public.bairros (id, cidade_id)
);
create index anunciante_bairros_bairro_id_idx on public.anunciante_bairros (bairro_id);

create table public.enderecos (
  id uuid primary key default gen_random_uuid(),
  anunciante_id uuid not null,
  cidade_id uuid not null,
  logradouro text not null check (length(trim(logradouro)) between 2 and 120),
  numero text not null check (length(numero) between 1 and 10),
  complemento text check (length(complemento) <= 60),
  bairro_id uuid not null,
  -- Para o mapa e o "mais perto de mim" (seção 9). A localização do visitante nunca é gravada.
  local extensions.geography(point, 4326),
  principal boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, anunciante_id),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade,
  foreign key (bairro_id, cidade_id) references public.bairros (id, cidade_id)
);
create index enderecos_anunciante_id_idx on public.enderecos (anunciante_id);
create index enderecos_local_idx on public.enderecos using gist (local);
create unique index enderecos_um_principal_idx on public.enderecos (anunciante_id) where principal;

create table public.horarios (
  id uuid primary key default gen_random_uuid(),
  anunciante_id uuid not null references public.anunciantes (id) on delete cascade,
  -- Vazio: vale para o anunciante todo (autônomo ou comércio com uma loja).
  endereco_id uuid,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  abre time not null,
  -- Fechamento menor que a abertura passa da meia-noite (bar até as 02:00); 00:00 = fim do dia.
  fecha time not null check (fecha <> abre),
  foreign key (endereco_id, anunciante_id) references public.enderecos (id, anunciante_id) on delete cascade
);
create index horarios_anunciante_id_idx on public.horarios (anunciante_id);

create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  anunciante_id uuid not null,
  cidade_id uuid not null,
  finalidade public.finalidade_foto not null,
  ordem smallint not null default 0,
  -- Prefixo no bucket público: <chave>-400.webp, <chave>-800.webp e <chave>-1600.webp.
  chave text not null unique check (chave ~ '^fotos/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  largura integer not null check (largura between 1 and 1600),
  altura integer not null check (altura between 1 and 1600),
  legenda text check (length(legenda) <= 200),
  -- Antes e depois: duas fotos da galeria com o mesmo par_id (cada uma conta no limite do plano).
  par_id uuid,
  papel_no_par public.papel_no_par,
  situacao public.situacao_conteudo not null default 'publicado',
  enviada_por uuid default auth.uid() references auth.users (id) on delete set null,
  removida_por uuid references auth.users (id) on delete set null,
  removida_em timestamptz,
  motivo_remocao text check (length(motivo_remocao) <= 300),
  criado_em timestamptz not null default now(),
  check ((par_id is null) = (papel_no_par is null)),
  check (par_id is null or finalidade = 'galeria'),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade
);
create index fotos_anunciante_id_idx on public.fotos (anunciante_id, finalidade, ordem);
create unique index fotos_par_idx on public.fotos (par_id, papel_no_par) where par_id is not null;
create unique index fotos_uma_de_perfil_idx on public.fotos (anunciante_id) where finalidade = 'perfil' and situacao = 'publicado';

create table public.encartes (
  id uuid primary key default gen_random_uuid(),
  anunciante_id uuid not null,
  cidade_id uuid not null,
  titulo text not null check (length(trim(titulo)) between 2 and 100),
  -- Bucket público: <chave>.webp (imagem) ou <chave>.pdf.
  chave text not null unique check (chave ~ '^encartes/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  tipo_arquivo public.tipo_arquivo not null,
  valido_ate date not null,
  publicado_em timestamptz not null default now(),
  situacao public.situacao_conteudo not null default 'publicado',
  enviada_por uuid default auth.uid() references auth.users (id) on delete set null,
  removida_por uuid references auth.users (id) on delete set null,
  removida_em timestamptz,
  motivo_remocao text check (length(motivo_remocao) <= 300),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade
);
create index encartes_anunciante_id_idx on public.encartes (anunciante_id, valido_ate);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  anunciante_id uuid not null,
  cidade_id uuid not null,
  nome text not null check (length(trim(nome)) between 2 and 100),
  descricao text check (length(descricao) <= 500),
  preco_centavos integer check (preco_centavos >= 0),
  foto_id uuid references public.fotos (id) on delete set null,
  ordem smallint not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade
);
create index produtos_anunciante_id_idx on public.produtos (anunciante_id, ordem);

-- ---------------------------------------------------------------------------
-- Funções de permissão (security definer: as políticas não podem consultar
-- as próprias tabelas com RLS sem entrar em laço)
-- ---------------------------------------------------------------------------

create function interno.meu_representante_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select r.id from public.representantes r
  where r.usuario_id = auth.uid() and r.ativo and interno.tem_papel('representante')
$$;

/** Perfil visível para todos: publicado (o pausado, o vencido e o suspenso têm status próprio). */
create function interno.anunciante_publico(p_anunciante uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.anunciantes a where a.id = p_anunciante and a.status = 'publicado')
$$;

/**
 * Quem pode ver o perfil mesmo fora do ar: o dono, o representante que o
 * trouxe e o administrador (com a segunda etapa).
 */
create function interno.pode_ver_anunciante(p_anunciante uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.eh_admin() or exists (
    select 1 from public.anunciantes a
    where a.id = p_anunciante
      and ((a.usuario_id = auth.uid() and interno.tem_papel('anunciante'))
           or (a.representante_id is not null and a.representante_id = interno.meu_representante_id()))
  )
$$;

/**
 * Quem pode alterar o perfil: o dono, o administrador e o representante que o
 * trouxe, este só enquanto o anunciante não assumiu (cadastro assistido).
 */
create function interno.pode_editar_anunciante(p_anunciante uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.eh_admin() or exists (
    select 1 from public.anunciantes a
    where a.id = p_anunciante
      and ((a.usuario_id = auth.uid() and interno.tem_papel('anunciante'))
           or (a.representante_id is not null
               and a.representante_id = interno.meu_representante_id()
               and a.status in ('rascunho', 'aguardando_anunciante')))
  )
$$;

/**
 * Campos que só a administração muda (seção 10.1: o RLS protege linhas, não
 * colunas). Vale para quem entra pelo site; as mudanças feitas pelo próprio
 * banco (migrations, tarefas agendadas, chave de serviço) passam.
 * O dono só muda o status nestas passagens: enviar para análise, pausar e
 * reativar. A passagem para "aguardando o anunciante" é do servidor, no convite.
 */
create function interno.proteger_anunciante() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rep uuid;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or interno.eh_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    rep := interno.meu_representante_id();
    if rep is not null then
      -- Cadastro assistido pelo representante: rascunho vinculado a ele. A conta do
      -- anunciante é ligada pelo servidor, ao enviar o convite (chave de serviço).
      if new.representante_id is distinct from rep or new.status <> 'rascunho' or new.usuario_id is not null then
        raise exception 'O representante só cria rascunhos vinculados a ele, sem conta ligada.';
      end if;
    elsif new.representante_id is not null or new.status <> 'rascunho' or new.usuario_id is distinct from auth.uid() then
      raise exception 'O cadastro começa como rascunho da própria conta.';
    end if;
    if new.plano_id is not null or new.fundador or new.aprovado_em is not null or new.aprovado_por is not null then
      raise exception 'Plano, Fundador e aprovação são definidos pela administração.';
    end if;
    new.cadastrado_por := auth.uid();
    return new;
  end if;

  if new.plano_id is distinct from old.plano_id
     or new.fundador is distinct from old.fundador
     or new.fundador_desde is distinct from old.fundador_desde
     or new.representante_id is distinct from old.representante_id
     or new.aprovado_em is distinct from old.aprovado_em
     or new.aprovado_por is distinct from old.aprovado_por
     or new.slug is distinct from old.slug
     or new.cidade_id is distinct from old.cidade_id
     or new.tipo is distinct from old.tipo
     or new.cadastrado_por is distinct from old.cadastrado_por
     or new.usuario_id is distinct from old.usuario_id then
    raise exception 'Este campo só pode ser alterado pela administração.';
  end if;

  if new.status is distinct from old.status and not (
    (old.status in ('rascunho', 'aguardando_anunciante') and new.status = 'em_analise' and old.usuario_id = auth.uid())
    or (old.status = 'publicado' and new.status = 'pausado')
    or (old.status = 'pausado' and new.status = 'publicado')
  ) then
    raise exception 'Mudança de situação não permitida: %', new.status;
  end if;
  return new;
end
$$;

create trigger proteger before insert or update on public.anunciantes
for each row execute function interno.proteger_anunciante();

/** Só o administrador remove conteúdo (status "removido") ou devolve ao ar. */
create function interno.proteger_conteudo() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or interno.eh_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.situacao <> 'publicado' or new.removida_por is not null or new.removida_em is not null then
      raise exception 'Conteúdo novo entra publicado.';
    end if;
    new.enviada_por := auth.uid();
    return new;
  end if;
  if new.situacao is distinct from old.situacao
     or new.removida_por is distinct from old.removida_por
     or new.removida_em is distinct from old.removida_em
     or new.motivo_remocao is distinct from old.motivo_remocao
     or new.enviada_por is distinct from old.enviada_por
     or new.chave is distinct from old.chave
     or new.anunciante_id is distinct from old.anunciante_id then
    raise exception 'Este campo só pode ser alterado pela administração.';
  end if;
  return new;
end
$$;

create trigger proteger before insert or update on public.fotos for each row execute function interno.proteger_conteudo();
create trigger proteger before insert or update on public.encartes for each row execute function interno.proteger_conteudo();

-- Datas de atualização
create trigger marcar_atualizacao before update on public.representantes for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.anunciantes for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.enderecos for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.produtos for each row execute function interno.marcar_atualizacao();

-- ---------------------------------------------------------------------------
-- Registro de toda alteração (decisão de 21/10/2026): quem, o quê, quando,
-- antes e depois. Inclui as tabelas de composição, cujo registro é o anunciante.
-- ---------------------------------------------------------------------------

create or replace function interno.auditar() returns trigger
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
    coalesce(registro ->> 'id', registro ->> 'anunciante_id', registro ->> 'usuario_id', registro ->> 'chave'),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end
$$;

create trigger auditar after insert or update or delete on public.representantes for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.anunciantes for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.anunciante_categorias for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.anunciante_bairros for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.enderecos for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.horarios for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.fotos for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.encartes for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.produtos for each row execute function interno.auditar();
-- A criação do perfil de usuário acompanha o cadastro; as mudanças de papel já eram registradas.
create trigger auditar_criacao after insert on public.perfis_usuario for each row execute function interno.auditar();

-- ---------------------------------------------------------------------------
-- Row Level Security (seção 10.1), uma política por papel
-- ---------------------------------------------------------------------------

alter table public.representantes enable row level security;
alter table public.anunciantes enable row level security;
alter table public.anunciante_categorias enable row level security;
alter table public.anunciante_bairros enable row level security;
alter table public.enderecos enable row level security;
alter table public.horarios enable row level security;
alter table public.fotos enable row level security;
alter table public.encartes enable row level security;
alter table public.produtos enable row level security;

-- Representantes: o visitante e o anunciante não veem; o representante vê o próprio cadastro.
create policy "visitante sem acesso" on public.representantes as restrictive for all to anon using (false) with check (false);
create policy "representante lê o próprio cadastro" on public.representantes
  for select to authenticated using (usuario_id = (select auth.uid()) and (select interno.tem_papel('representante')));
create policy "administrador lê e altera representantes" on public.representantes
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- Anunciantes
create policy "visitante lê os publicados" on public.anunciantes
  for select to anon using (status = 'publicado');
create policy "conta logada lê os publicados" on public.anunciantes
  for select to authenticated using (status = 'publicado');
create policy "anunciante lê o próprio perfil" on public.anunciantes
  for select to authenticated using (usuario_id = (select auth.uid()) and (select interno.tem_papel('anunciante')));
create policy "anunciante altera o próprio perfil" on public.anunciantes
  for update to authenticated
  using (usuario_id = (select auth.uid()) and (select interno.tem_papel('anunciante')))
  with check (usuario_id = (select auth.uid()));
create policy "anunciante cria o próprio rascunho" on public.anunciantes
  for insert to authenticated with check (usuario_id = (select auth.uid()) and (select interno.tem_papel('anunciante')));
create policy "representante lê os que trouxe" on public.anunciantes
  for select to authenticated using (representante_id is not null and representante_id = (select interno.meu_representante_id()));
create policy "representante cria cadastro assistido" on public.anunciantes
  for insert to authenticated with check (representante_id is not null and representante_id = (select interno.meu_representante_id()));
create policy "representante altera cadastro assistido antes do anunciante assumir" on public.anunciantes
  for update to authenticated
  using (representante_id = (select interno.meu_representante_id()) and status in ('rascunho', 'aguardando_anunciante'))
  with check (representante_id = (select interno.meu_representante_id()));
create policy "administrador lê e altera anunciantes" on public.anunciantes
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- Tabelas do perfil: visitante lê as do perfil publicado; dono, representante e
-- administrador seguem as funções de permissão acima.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('anunciante_categorias', 'true'),
      ('anunciante_bairros', 'true'),
      ('enderecos', 'true'),
      ('horarios', 'true'),
      ('produtos', 'true'),
      ('fotos', 'situacao = ''publicado'''),
      ('encartes', 'situacao = ''publicado'' and valido_ate >= (now() at time zone ''America/Sao_Paulo'')::date')
    ) as v (tabela, visivel)
  loop
    execute format(
      'create policy "visitante lê os do perfil publicado" on public.%I for select to anon using ((%s) and interno.anunciante_publico(anunciante_id))',
      t.tabela, t.visivel);
    execute format(
      'create policy "conta logada lê os do perfil publicado" on public.%I for select to authenticated using ((%s) and interno.anunciante_publico(anunciante_id))',
      t.tabela, t.visivel);
    execute format(
      'create policy "dono, representante e administrador leem" on public.%I for select to authenticated using (interno.pode_ver_anunciante(anunciante_id))',
      t.tabela);
    execute format(
      'create policy "dono, representante e administrador incluem" on public.%I for insert to authenticated with check (interno.pode_editar_anunciante(anunciante_id))',
      t.tabela);
    execute format(
      'create policy "dono, representante e administrador alteram" on public.%I for update to authenticated using (interno.pode_editar_anunciante(anunciante_id)) with check (interno.pode_editar_anunciante(anunciante_id))',
      t.tabela);
    execute format(
      'create policy "dono, representante e administrador apagam" on public.%I for delete to authenticated using (interno.pode_editar_anunciante(anunciante_id))',
      t.tabela);
  end loop;
end
$$;

revoke execute on function interno.meu_representante_id() from public, anon;
revoke execute on function interno.anunciante_publico(uuid) from public;
revoke execute on function interno.pode_ver_anunciante(uuid) from public, anon;
revoke execute on function interno.pode_editar_anunciante(uuid) from public, anon;
grant execute on function interno.anunciante_publico(uuid) to anon, authenticated;
grant execute on function interno.meu_representante_id() to authenticated;
grant execute on function interno.pode_ver_anunciante(uuid) to authenticated;
grant execute on function interno.pode_editar_anunciante(uuid) to authenticated;
