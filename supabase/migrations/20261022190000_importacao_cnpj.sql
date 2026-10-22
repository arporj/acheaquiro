-- Importação dos comércios pelos dados abertos do CNPJ (decisões de 22/10/2026):
-- - comércio importado entra publicado no plano Gratuito, sem aceite dos Termos,
--   e se diferencia pela origem "receita";
-- - MEI e empresário individual ficam de fora (o script não os importa);
-- - telefone, e-mail e razão social da Receita não são publicados: ficam em
--   dados_receita, só para a equipe usar na prospecção;
-- - a página do comércio importado oferece "É seu? Assuma", "Remover meu
--   comércio" e "Informar que fechou" (pedidos_perfil).

alter table public.anunciantes
  add column origem text not null default 'cadastro' check (origem in ('cadastro', 'receita'));

-- ---------------------------------------------------------------------------
-- Dados da Receita, só para a equipe
-- ---------------------------------------------------------------------------

create table public.dados_receita (
  anunciante_id uuid primary key,
  cidade_id uuid not null,
  cnpj text not null unique check (cnpj ~ '^[0-9]{14}$'),
  razao_social text not null check (length(razao_social) <= 200),
  nome_fantasia text check (length(nome_fantasia) <= 200),
  -- Só números, com DDD, como vieram da Receita (muitas vezes é o telefone do contador).
  telefones text[] not null default '{}',
  email text check (length(email) <= 254),
  cnae_principal text not null check (cnae_principal ~ '^[0-9]{7}$'),
  cnaes_secundarios text[] not null default '{}',
  abertura date,
  -- Bairro escrito na Receita, para conferir a correspondência com a tabela de bairros.
  bairro_receita text check (length(bairro_receita) <= 100),
  -- Mês dos dados abertos usados (AAAA-MM).
  referencia text not null check (referencia ~ '^[0-9]{4}-[0-9]{2}$'),
  importado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (anunciante_id, cidade_id) references public.anunciantes (id, cidade_id) on delete cascade
);
create index dados_receita_cnae_principal_idx on public.dados_receita (cnae_principal);

-- ---------------------------------------------------------------------------
-- CNAE → categoria, editável pela administração
-- ---------------------------------------------------------------------------

create table public.cnae_categoria (
  cidade_id uuid not null references public.cidades (id),
  cnae text not null check (cnae ~ '^[0-9]{7}$'),
  descricao text not null check (length(descricao) <= 300),
  -- Vazio = CNAE fora da importação (sem atendimento ao público, atacado, indústria).
  categoria_id uuid,
  atualizado_em timestamptz not null default now(),
  primary key (cidade_id, cnae),
  foreign key (categoria_id, cidade_id) references public.categorias (id, cidade_id)
);

-- ---------------------------------------------------------------------------
-- Pedidos sobre o perfil, enviados pelo visitante
-- ---------------------------------------------------------------------------

create type public.tipo_pedido_perfil as enum ('assumir', 'remover', 'fechou');
create type public.situacao_pedido_perfil as enum ('aberto', 'atendido', 'recusado');

create table public.pedidos_perfil (
  id uuid primary key default gen_random_uuid(),
  anunciante_id uuid not null references public.anunciantes (id) on delete cascade,
  tipo public.tipo_pedido_perfil not null,
  -- Nome e contato de quem pediu, para a equipe responder. Vazios no "fechou".
  nome text check (length(trim(nome)) between 2 and 100),
  contato text check (length(trim(contato)) between 5 and 254),
  mensagem text not null default '' check (length(mensagem) <= 1000),
  situacao public.situacao_pedido_perfil not null default 'aberto',
  atendido_por uuid references auth.users (id) on delete set null,
  atendido_em timestamptz,
  criado_em timestamptz not null default now(),
  check (tipo = 'fechou' or (nome is not null and contato is not null)),
  check ((situacao = 'aberto') = (atendido_em is null))
);
create index pedidos_perfil_anunciante_id_idx on public.pedidos_perfil (anunciante_id);
create index pedidos_perfil_abertos_idx on public.pedidos_perfil (criado_em) where situacao = 'aberto';

create trigger marcar_atualizacao before update on public.dados_receita for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.cnae_categoria for each row execute function interno.marcar_atualizacao();
create trigger auditar after insert or update or delete on public.cnae_categoria for each row execute function interno.auditar();
create trigger auditar after update or delete on public.pedidos_perfil for each row execute function interno.auditar();

-- ---------------------------------------------------------------------------
-- Row Level Security, uma política por papel
-- ---------------------------------------------------------------------------

alter table public.dados_receita enable row level security;
alter table public.cnae_categoria enable row level security;
alter table public.pedidos_perfil enable row level security;

-- Dados da Receita: o visitante e o anunciante não veem; o representante lê para prospectar.
create policy "visitante sem acesso" on public.dados_receita as restrictive for all to anon using (false) with check (false);
create policy "representante lê para prospectar" on public.dados_receita
  for select to authenticated using ((select interno.tem_papel('representante')));
create policy "administrador lê e altera" on public.dados_receita
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- CNAE → categoria: só a administração.
create policy "visitante sem acesso" on public.cnae_categoria as restrictive for all to anon using (false) with check (false);
create policy "administrador lê e altera" on public.cnae_categoria
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- Pedidos: entram pelo servidor (chave de serviço), com limite de requisições;
-- o visitante, o anunciante e o representante não leem nem gravam direto.
create policy "visitante sem acesso" on public.pedidos_perfil as restrictive for all to anon using (false) with check (false);
create policy "administrador lê e atende" on public.pedidos_perfil
  for all to authenticated using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
