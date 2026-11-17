-- Agenda de shows e eventos na produção (item 4.19 da especificação; decisões de
-- 21 e 22/10/2026, decisões 8 a 11 de 29/10/2026 e de 17/11/2026).
-- - Estilos musicais em tabela editável (decisão 10).
-- - Artistas: o anunciante da categoria "Músicos e bandas" tem perfil completo;
--   o artista sem anúncio aparece só com nome e estilos.
-- - Evento: tudo o que aparece na Agenda é um evento (noite de show no bar,
--   show do artista, festa, feira, festival), com um ou mais dias, os campos da
--   decisão 9, a programação (artistas ou atividades, com horário) e as barracas.
-- - De onde vem o evento (origem) define quem paga (packages/domain/agenda.ts):
--   comércio com o plano que inclui a Agenda (Premium) ou o extra Agenda (este
--   entra com a contratação de extras); show do artista anunciante, sem custo;
--   evento avulso, pago por bloco de 7 dias ou dado como cortesia pela
--   administração (decisão C1 de 17/11/2026); órgão público, só pela equipe.
-- - O evento fica ligado à conta do cliente que o organiza (usuario_id), mesmo
--   sem anúncio: a conta única de cliente (decisão de 17/11/2026).
-- As travas de datas e de quem aparece repetem packages/domain/agenda.ts.

-- ---------------------------------------------------------------------------
-- Categoria "Músicos e bandas" e Agenda no plano Premium de comércio
-- ---------------------------------------------------------------------------

-- Artista anunciante usa os planos de autônomo (decisão 8); grupo decidido em 17/11/2026 (B1).
insert into public.categorias (cidade_id, grupo_id, tipo, nome, nome_plural, slug_lista, icone, cor)
select c.id, g.id, 'profissional', 'Músicos e bandas', 'Músicos e bandas', 'musicos-e-bandas', 'music', '#7E3FC4'
from public.cidades c
join public.grupos_categoria g on g.cidade_id = c.id and g.nome = 'Eventos e comida'
where c.slug = 'rio-das-ostras'
on conflict (cidade_id, slug_lista) do nothing;

insert into public.sinonimos_categoria (categoria_id, termo)
select cat.id, v.termo
from public.cidades c
join public.categorias cat on cat.cidade_id = c.id and cat.slug_lista = 'musicos-e-bandas'
cross join (values ('músico'), ('banda'), ('cantor'), ('cantora'), ('DJ'), ('música ao vivo'), ('show')) as v (termo)
where c.slug = 'rio-das-ostras'
on conflict (categoria_id, termo_normalizado) do nothing;

-- O plano de comércio que inclui a Agenda sem custo extra (decisão 8: Premium).
alter table public.planos add column inclui_agenda boolean not null default false;
update public.planos set inclui_agenda = true where codigo = 'com-nivel4';

-- ---------------------------------------------------------------------------
-- Estilos musicais (decisão 10)
-- ---------------------------------------------------------------------------

create table public.estilos_musicais (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  nome text not null check (length(nome) between 2 and 40),
  nome_normalizado text generated always as (interno.normalizar(nome)) stored,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cidade_id, nome_normalizado)
);

insert into public.estilos_musicais (cidade_id, nome)
select c.id, v.nome
from public.cidades c
cross join (values ('Rock'), ('Samba'), ('Pagode'), ('MPB'), ('Sertanejo'), ('Forró'), ('Funk'), ('Reggae'), ('Axé'),
                   ('Gospel'), ('Eletrônica/DJ'), ('Jazz/blues'), ('Pop')) as v (nome)
where c.slug = 'rio-das-ostras';

-- ---------------------------------------------------------------------------
-- Artistas
-- ---------------------------------------------------------------------------

create table public.artistas (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  nome text not null check (length(trim(nome)) between 2 and 80),
  -- O artista anunciante: foto, descrição, galeria e contato vêm do anúncio.
  anunciante_id uuid unique references public.anunciantes (id) on delete set null,
  formacao text check (length(formacao) <= 120),
  atende text[] not null default '{}' check (cardinality(atende) <= 8),
  -- [{ "titulo": "...", "url": "https://..." }]: links externos, sem script de terceiros.
  videos jsonb not null default '[]' check (jsonb_typeof(videos) = 'array' and jsonb_array_length(videos) <= 6),
  -- Cor do avatar enquanto não há foto.
  cor text not null default '#2563EB' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cidade_id, slug)
);
create index artistas_criado_por_idx on public.artistas (criado_por);

create table public.artista_estilos (
  artista_id uuid not null references public.artistas (id) on delete cascade,
  estilo_id uuid not null references public.estilos_musicais (id) on delete restrict,
  primary key (artista_id, estilo_id)
);
create index artista_estilos_estilo_idx on public.artista_estilos (estilo_id);

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------

create type public.origem_evento as enum ('comercio', 'artista', 'avulso', 'orgao_publico');
create type public.entrada_evento as enum ('gratuita', 'couvert', 'ingressos');
create type public.situacao_evento as enum ('rascunho', 'publicado', 'cancelado');

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  -- Endereço da página (/agenda/slug): não muda depois de publicado, para não quebrar links.
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  nome text not null check (length(trim(nome)) between 3 and 100),
  descricao text not null default '' check (length(descricao) <= 2000),
  origem public.origem_evento not null,
  -- Comércio onde acontece (comercio) ou artista anunciante (artista).
  anunciante_id uuid references public.anunciantes (id) on delete cascade,
  -- Conta do cliente que organiza o evento e pode editá-lo (conta única de cliente).
  usuario_id uuid references auth.users (id) on delete set null,
  produtor text check (length(produtor) between 2 and 80),
  local text not null check (length(trim(local)) between 2 and 100),
  endereco text check (length(endereco) <= 160),
  bairro_id uuid not null,
  data_inicio date not null,
  data_fim date not null,
  entrada public.entrada_evento not null default 'gratuita',
  couvert_centavos integer check (couvert_centavos > 0),
  -- [{ "nome": "Inteira", "valorCentavos": 4000 }]: até 10 tipos.
  ingressos jsonb not null default '[]' check (jsonb_typeof(ingressos) = 'array' and jsonb_array_length(ingressos) <= 10),
  aberto_ao_publico boolean not null default true,
  classificacao text check (classificacao in ('livre', '12', '14', '16', '18')),
  -- null: não informado.
  cadeira_de_praia boolean,
  cooler boolean,
  ruas_fechadas text check (length(ruas_fechadas) <= 300),
  -- Cartaz em JPEG (prévia do WhatsApp): <chave>-400.jpg, -800.jpg e -1600.jpg no bucket público.
  cartaz_chave text unique check (cartaz_chave ~ '^eventos/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  cartaz_largura integer check (cartaz_largura between 1 and 1600),
  cartaz_altura integer check (cartaz_altura between 1 and 1600),
  situacao public.situacao_evento not null default 'rascunho',
  -- Cortesia do evento avulso (decisão C1): só a administração, com motivo; gravada pelo banco.
  cortesia_motivo text check (length(cortesia_motivo) between 10 and 200),
  cortesia_por uuid references auth.users (id) on delete set null,
  cortesia_em timestamptz,
  -- Representante que atendeu o organizador (comissão do evento avulso).
  representante_id uuid references public.representantes (id) on delete set null,
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cidade_id, slug),
  foreign key (bairro_id, cidade_id) references public.bairros (id, cidade_id),
  check (data_fim >= data_inicio),
  check ((origem in ('comercio', 'artista')) = (anunciante_id is not null)),
  check ((entrada = 'couvert') = (couvert_centavos is not null)),
  check (entrada <> 'ingressos' or jsonb_array_length(ingressos) >= 1),
  check (entrada = 'ingressos' or jsonb_array_length(ingressos) = 0),
  check ((cartaz_chave is null) = (cartaz_largura is null) and (cartaz_chave is null) = (cartaz_altura is null)),
  check (cortesia_motivo is null or origem = 'avulso'),
  check ((cortesia_motivo is null) = (cortesia_em is null))
);
create index eventos_cidade_datas_idx on public.eventos (cidade_id, data_fim, data_inicio);
create index eventos_anunciante_idx on public.eventos (anunciante_id) where anunciante_id is not null;
create index eventos_usuario_idx on public.eventos (usuario_id) where usuario_id is not null;
create index eventos_bairro_idx on public.eventos (bairro_id);
create index eventos_representante_idx on public.eventos (representante_id) where representante_id is not null;
create index eventos_criado_por_idx on public.eventos (criado_por);
create index eventos_cortesia_por_idx on public.eventos (cortesia_por) where cortesia_por is not null;

create table public.programacao_evento (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  dia date not null,
  inicio time not null,
  -- O show pode passar da meia-noite: o fim não precisa vir depois do início.
  fim time,
  -- Um artista ou uma atividade (largada, feira, premiação).
  artista_id uuid references public.artistas (id) on delete restrict,
  titulo text check (length(trim(titulo)) between 2 and 80),
  criado_em timestamptz not null default now(),
  check (artista_id is not null or titulo is not null)
);
create index programacao_evento_idx on public.programacao_evento (evento_id, dia, inicio);
create index programacao_artista_idx on public.programacao_evento (artista_id) where artista_id is not null;

create table public.barracas_evento (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 60),
  vende text not null check (length(trim(vende)) between 2 and 80),
  -- Publicado só com a autorização do barraqueiro, confirmada no cadastro.
  whatsapp text check (whatsapp ~ '^55[1-9][0-9]{9,10}$'),
  -- Barraca que já é anunciante: o nome leva ao perfil.
  anunciante_id uuid references public.anunciantes (id) on delete set null,
  ordem smallint not null default 0,
  criado_em timestamptz not null default now()
);
create index barracas_evento_idx on public.barracas_evento (evento_id, ordem);
create index barracas_anunciante_idx on public.barracas_evento (anunciante_id) where anunciante_id is not null;

-- ---------------------------------------------------------------------------
-- Travas (repetem packages/domain/agenda.ts)
-- ---------------------------------------------------------------------------

/**
 * Datas do evento (até 12 meses à frente; evento já terminado não é cadastrado),
 * órgão público só pela equipe e cortesia só pela administração, com quem deu
 * e quando gravados pelo banco.
 */
create function interno.conferir_evento() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.data_inicio <> old.data_inicio or new.data_fim <> old.data_fim then
    if new.data_fim < interno.hoje() then
      raise exception 'Este evento já terminou.';
    end if;
    if new.data_inicio > (interno.hoje() + interval '12 months')::date then
      raise exception 'A Agenda aceita eventos que começam até 12 meses à frente.';
    end if;
  end if;
  if new.origem = 'orgao_publico' and (tg_op = 'INSERT' or old.origem <> 'orgao_publico') and not interno.eh_admin() then
    raise exception 'Evento de órgão público só é cadastrado pela equipe.';
  end if;
  if tg_op = 'UPDATE' and new.origem <> old.origem and not interno.eh_admin() then
    raise exception 'Só a administração muda a origem do evento.';
  end if;
  if new.cortesia_motivo is distinct from (case when tg_op = 'UPDATE' then old.cortesia_motivo end) then
    if not interno.eh_admin() then
      raise exception 'Só a administração dá cortesia.';
    end if;
    new.cortesia_por := case when new.cortesia_motivo is null then null else auth.uid() end;
    new.cortesia_em := case when new.cortesia_motivo is null then null else now() end;
  elsif tg_op = 'UPDATE' then
    new.cortesia_por := old.cortesia_por;
    new.cortesia_em := old.cortesia_em;
  else
    new.cortesia_por := null;
    new.cortesia_em := null;
  end if;
  return new;
end
$$;

create trigger conferir before insert or update on public.eventos for each row execute function interno.conferir_evento();
create trigger marcar_atualizacao before update on public.eventos for each row execute function interno.marcar_atualizacao();
create trigger auditar after insert or update or delete on public.eventos for each row execute function interno.auditar();

/** O dia da programação fica entre o primeiro e o último dia do evento. */
create function interno.conferir_programacao() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_inicio date;
  v_fim date;
begin
  select e.data_inicio, e.data_fim into v_inicio, v_fim from public.eventos e where e.id = new.evento_id;
  if new.dia < v_inicio or new.dia > v_fim then
    raise exception 'O dia da programação precisa estar entre o primeiro e o último dia do evento.';
  end if;
  return new;
end
$$;

create trigger conferir before insert or update on public.programacao_evento for each row execute function interno.conferir_programacao();
create trigger auditar after insert or update or delete on public.programacao_evento for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.barracas_evento for each row execute function interno.auditar();

/** Encurtar o evento não pode deixar programação fora das datas. */
create function interno.conferir_datas_com_programacao() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.programacao_evento p
    where p.evento_id = new.id and (p.dia < new.data_inicio or p.dia > new.data_fim)
  ) then
    raise exception 'Há programação fora das novas datas. Ajuste ou apague esses horários antes.';
  end if;
  return new;
end
$$;

create trigger conferir_programacao after update of data_inicio, data_fim on public.eventos
  for each row execute function interno.conferir_datas_com_programacao();

create trigger marcar_atualizacao before update on public.artistas for each row execute function interno.marcar_atualizacao();
create trigger auditar after insert or update or delete on public.artistas for each row execute function interno.auditar();
create trigger auditar after insert or delete on public.artista_estilos for each row execute function interno.auditar();
create trigger marcar_atualizacao before update on public.estilos_musicais for each row execute function interno.marcar_atualizacao();
create trigger auditar after insert or update or delete on public.estilos_musicais for each row execute function interno.auditar();

/**
 * O evento publicado aparece na Agenda? Repete impedimentoParaAparecerNaAgenda
 * (packages/domain/agenda.ts). O extra Agenda e o pagamento do evento avulso
 * entram com a contratação de extras.
 */
create function interno.evento_liberado(p_evento uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case e.origem
      when 'orgao_publico' then true
      when 'avulso' then e.cortesia_em is not null
      when 'comercio' then exists (
        select 1 from public.anunciantes a
        join public.planos p on p.id = a.plano_id
        where a.id = e.anunciante_id and a.status = 'publicado' and p.inclui_agenda
      )
      when 'artista' then exists (
        select 1 from public.anunciantes a
        join public.categorias c on c.cidade_id = a.cidade_id and c.slug_lista = 'musicos-e-bandas'
        where a.id = e.anunciante_id and a.status = 'publicado'
          and (a.categoria_principal_id = c.id
               or exists (select 1 from public.anunciante_categorias ac where ac.anunciante_id = a.id and ac.categoria_id = c.id))
      )
    end
    from public.eventos e
    where e.id = p_evento
  ), false)
$$;

/** Evento que o visitante vê: publicado e liberado. */
create function interno.evento_visivel(p_evento uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.eventos e where e.id = p_evento and e.situacao = 'publicado') and interno.evento_liberado(p_evento)
$$;

revoke execute on function interno.conferir_evento() from public, anon, authenticated;
revoke execute on function interno.conferir_programacao() from public, anon, authenticated;
revoke execute on function interno.conferir_datas_com_programacao() from public, anon, authenticated;
revoke execute on function interno.evento_liberado(uuid) from public;
revoke execute on function interno.evento_visivel(uuid) from public;
grant execute on function interno.evento_liberado(uuid) to anon, authenticated;
grant execute on function interno.evento_visivel(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security, uma política por papel. Anunciante (cliente) e
-- representante cadastram eventos na etapa da conta de cliente; até lá, leem
-- como o visitante e a administração cadastra.
-- ---------------------------------------------------------------------------

alter table public.estilos_musicais enable row level security;
create policy "visitante lê os ativos" on public.estilos_musicais for select to anon using (ativo);
create policy "anunciante lê os ativos" on public.estilos_musicais for select to authenticated
  using (ativo and (select interno.tem_papel('anunciante')));
create policy "representante lê os ativos" on public.estilos_musicais for select to authenticated
  using (ativo and (select interno.meu_representante_id()) is not null);
create policy "administrador lê e altera" on public.estilos_musicais for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- Artistas: o nome e os estilos aparecem na Agenda; o resto do perfil, só do
-- artista anunciante (dadosPublicosDoArtista, packages/domain). Nada é sigiloso.
alter table public.artistas enable row level security;
create policy "visitante lê" on public.artistas for select to anon using (true);
create policy "anunciante lê" on public.artistas for select to authenticated using ((select interno.tem_papel('anunciante')));
create policy "representante lê" on public.artistas for select to authenticated using ((select interno.meu_representante_id()) is not null);
create policy "administrador lê e altera" on public.artistas for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

alter table public.artista_estilos enable row level security;
create policy "visitante lê" on public.artista_estilos for select to anon using (true);
create policy "anunciante lê" on public.artista_estilos for select to authenticated using ((select interno.tem_papel('anunciante')));
create policy "representante lê" on public.artista_estilos for select to authenticated using ((select interno.meu_representante_id()) is not null);
create policy "administrador lê e altera" on public.artista_estilos for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

alter table public.eventos enable row level security;
create policy "visitante lê os visíveis" on public.eventos for select to anon using (interno.evento_visivel(id));
create policy "anunciante lê os visíveis" on public.eventos for select to authenticated
  using ((select interno.tem_papel('anunciante')) and interno.evento_visivel(id));
create policy "representante lê os visíveis" on public.eventos for select to authenticated
  using ((select interno.meu_representante_id()) is not null and interno.evento_visivel(id));
create policy "administrador lê e altera" on public.eventos for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

alter table public.programacao_evento enable row level security;
create policy "visitante lê dos eventos visíveis" on public.programacao_evento for select to anon using (interno.evento_visivel(evento_id));
create policy "anunciante lê dos eventos visíveis" on public.programacao_evento for select to authenticated
  using ((select interno.tem_papel('anunciante')) and interno.evento_visivel(evento_id));
create policy "representante lê dos eventos visíveis" on public.programacao_evento for select to authenticated
  using ((select interno.meu_representante_id()) is not null and interno.evento_visivel(evento_id));
create policy "administrador lê e altera" on public.programacao_evento for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

alter table public.barracas_evento enable row level security;
create policy "visitante lê dos eventos visíveis" on public.barracas_evento for select to anon using (interno.evento_visivel(evento_id));
create policy "anunciante lê dos eventos visíveis" on public.barracas_evento for select to authenticated
  using ((select interno.tem_papel('anunciante')) and interno.evento_visivel(evento_id));
create policy "representante lê dos eventos visíveis" on public.barracas_evento for select to authenticated
  using ((select interno.meu_representante_id()) is not null and interno.evento_visivel(evento_id));
create policy "administrador lê e altera" on public.barracas_evento for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));
