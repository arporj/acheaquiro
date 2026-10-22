-- Patrocinadores (proposta Patrocinadores v3; decisões de 21 e 22/10/2026):
-- empresas que apoiam o site como marca, sem perfil na lista e sem mudar a
-- ordem dela. Cotas, valores, vagas e benefícios ficam em tabela, editáveis
-- pela administração. Tabelas e RLS no mesmo arquivo: nenhuma fica sem proteção.
--
-- As regras de venda (vagas, exclusividade de ramo, prazo) ficam em
-- packages/domain (patrocinio.ts); o banco repete só as travas que não podem
-- falhar nem com erro na tela: uma empresa por grupo, por categoria e por
-- ramo na mesma cota, e o limite de vagas.

create type public.cota_patrocinio as enum ('master', 'ouro', 'apoio', 'grupo', 'categoria', 'agenda');
create type public.situacao_patrocinio as enum ('rascunho', 'no_ar', 'encerrado');

-- ---------------------------------------------------------------------------
-- Cotas à venda
-- ---------------------------------------------------------------------------

create table public.cotas_patrocinio (
  cidade_id uuid not null references public.cidades (id),
  cota public.cota_patrocinio not null,
  nome text not null check (length(nome) between 2 and 40),
  beneficios text[] not null default '{}' check (cardinality(beneficios) <= 10),
  valor_centavos integer not null check (valor_centavos > 0),
  valor_fundador_centavos integer not null check (valor_fundador_centavos > 0 and valor_fundador_centavos <= valor_centavos),
  -- Vazio nas cotas de grupo e de categoria: uma vaga por grupo e por categoria do catálogo.
  vagas smallint check (vagas between 1 and 100),
  largura_logo smallint not null check (largura_logo between 100 and 2000),
  altura_logo smallint not null check (altura_logo between 100 and 2000),
  ordem smallint not null default 0,
  ativa boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (cidade_id, cota),
  check ((cota in ('grupo', 'categoria')) = (vagas is null))
);

-- ---------------------------------------------------------------------------
-- Patrocínios vendidos
-- ---------------------------------------------------------------------------

create table public.patrocinios (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  cota public.cota_patrocinio not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  nome text not null check (length(nome) between 2 and 80),
  ramo text not null check (length(ramo) between 2 and 60),
  ramo_normalizado text generated always as (interno.normalizar(ramo)) stored,
  frase text not null default '' check (length(frase) <= 140),
  whatsapp text check (whatsapp ~ '^55[1-9][0-9]{9,10}$'),
  -- Caminho no bucket acheaqui-midia (patrocinadores/<código>.webp).
  logo_caminho text check (logo_caminho ~ '^patrocinadores/[a-z0-9-]+\.webp$'),
  grupo text check (length(grupo) between 2 and 60),
  categoria_id uuid references public.categorias (id),
  situacao public.situacao_patrocinio not null default 'rascunho',
  -- Entrada no ar e último dia; o fim soma o tempo de site fora do ar por mais de 3 dias seguidos.
  inicio date,
  fim date,
  dias_somados smallint not null default 0 check (dias_somados between 0 and 365),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cidade_id, slug),
  check ((cota = 'grupo') = (grupo is not null)),
  check ((cota = 'categoria') = (categoria_id is not null)),
  check (situacao = 'rascunho' or (inicio is not null and fim is not null and fim >= inicio)),
  check (situacao <> 'no_ar' or logo_caminho is not null)
);

-- Uma empresa por grupo e por categoria, e uma de cada ramo por cota (menos Apoio), entre os que estão no ar.
create unique index patrocinios_um_por_grupo on public.patrocinios (cidade_id, grupo) where situacao = 'no_ar' and cota = 'grupo';
create unique index patrocinios_um_por_categoria on public.patrocinios (cidade_id, categoria_id) where situacao = 'no_ar' and cota = 'categoria';
create unique index patrocinios_um_por_ramo on public.patrocinios (cidade_id, cota, ramo_normalizado) where situacao = 'no_ar' and cota <> 'apoio';

/** Recusa colocar no ar além das vagas da cota (Master, Ouro, Apoio e Agenda). */
create function interno.conferir_vagas_patrocinio() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  limite smallint;
  ocupadas integer;
begin
  if new.situacao <> 'no_ar' then
    return new;
  end if;
  select c.vagas into limite from public.cotas_patrocinio c where c.cidade_id = new.cidade_id and c.cota = new.cota;
  if limite is null then
    return new;
  end if;
  -- Trava por cidade e cota: dois administradores ao mesmo tempo não passam do limite.
  perform pg_advisory_xact_lock(hashtext('patrocinio:' || new.cidade_id::text || ':' || new.cota::text));
  select count(*) into ocupadas from public.patrocinios p
  where p.cidade_id = new.cidade_id and p.cota = new.cota and p.situacao = 'no_ar' and p.id <> new.id;
  if ocupadas >= limite then
    raise exception 'A cota % já tem todas as % vagas ocupadas.', new.cota, limite using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger conferir_vagas before insert or update on public.patrocinios
for each row execute function interno.conferir_vagas_patrocinio();

-- Pagamento do patrocínio (Pix à vista, conferido pela equipe). Separado para
-- que o valor nunca seja público.
create table public.pagamentos_patrocinio (
  patrocinio_id uuid primary key references public.patrocinios (id) on delete cascade,
  valor_centavos integer not null check (valor_centavos > 0),
  preco_fundador boolean not null default false,
  pago_em date not null,
  observacao text not null default '' check (length(observacao) <= 300),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Cliques no contato do patrocinador (/p/[slug]), por dia
-- ---------------------------------------------------------------------------

create table public.cliques_patrocinio (
  patrocinio_id uuid not null references public.patrocinios (id) on delete cascade,
  dia date not null,
  cliques integer not null default 0 check (cliques >= 0),
  primary key (patrocinio_id, dia)
);

/**
 * Conta o clique no contato do patrocinador. Cliques repetidos do mesmo
 * visitante no mesmo patrocinador, em 30 minutos, contam uma vez só
 * (CLAUDE.md: métricas não podem ser infladas). p_visitante é um resumo
 * (hash) do endereço do visitante, feito no Worker: o IP não chega aqui.
 */
create function public.registrar_clique_patrocinio(p_slug text, p_cidade text, p_visitante text) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  alvo uuid;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_visitante is null or p_visitante !~ '^[a-f0-9]{16,64}$' then
    raise exception 'registrar_clique_patrocinio: visitante inválido';
  end if;
  select p.id into alvo
  from public.patrocinios p join public.cidades c on c.id = p.cidade_id
  where c.slug = p_cidade and p.slug = p_slug and p.situacao = 'no_ar' and hoje between p.inicio and p.fim;
  if alvo is null then
    return;
  end if;
  if not public.consumir_limite('clique-patrocinio:' || alvo::text || ':' || p_visitante, 1, 1800) then
    return;
  end if;
  insert into public.cliques_patrocinio as c (patrocinio_id, dia, cliques)
  values (alvo, hoje, 1)
  on conflict (patrocinio_id, dia) do update set cliques = c.cliques + 1;
end
$$;

revoke all on function public.registrar_clique_patrocinio(text, text, text) from public;
grant execute on function public.registrar_clique_patrocinio(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Datas de atualização e auditoria (CLAUDE.md: ações administrativas)
-- ---------------------------------------------------------------------------

create trigger marcar_atualizacao before update on public.cotas_patrocinio for each row execute function interno.marcar_atualizacao();
create trigger marcar_atualizacao before update on public.patrocinios for each row execute function interno.marcar_atualizacao();
create trigger auditar after insert or update or delete on public.cotas_patrocinio for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.patrocinios for each row execute function interno.auditar();
create trigger marcar_atualizacao before update on public.pagamentos_patrocinio for each row execute function interno.marcar_atualizacao();
create trigger auditar after insert or update or delete on public.pagamentos_patrocinio for each row execute function interno.auditar();

-- ---------------------------------------------------------------------------
-- RLS: política explícita para cada papel
-- ---------------------------------------------------------------------------

alter table public.cotas_patrocinio enable row level security;
alter table public.patrocinios enable row level security;
alter table public.pagamentos_patrocinio enable row level security;
alter table public.cliques_patrocinio enable row level security;

-- Cotas: públicas (a página /patrocine mostra valores e vagas a todos).
create policy "visitante lê as cotas ativas" on public.cotas_patrocinio for select to anon using (ativa);
create policy "anunciante lê as cotas ativas" on public.cotas_patrocinio for select to authenticated
  using (ativa and (select interno.tem_papel('anunciante')));
create policy "representante lê as cotas ativas" on public.cotas_patrocinio for select to authenticated
  using (ativa and (select interno.tem_papel('representante')));
create policy "administrador lê e altera as cotas" on public.cotas_patrocinio for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- Patrocínios: o público vê só os que estão no ar e dentro do prazo. O valor
-- pago fica em pagamentos_patrocinio, que só o administrador lê.
create policy "visitante lê os patrocínios no ar" on public.patrocinios for select to anon
  using (situacao = 'no_ar' and (now() at time zone 'America/Sao_Paulo')::date between inicio and fim);
create policy "anunciante lê os patrocínios no ar" on public.patrocinios for select to authenticated
  using (situacao = 'no_ar' and (now() at time zone 'America/Sao_Paulo')::date between inicio and fim and (select interno.tem_papel('anunciante')));
create policy "representante lê os patrocínios no ar" on public.patrocinios for select to authenticated
  using (situacao = 'no_ar' and (now() at time zone 'America/Sao_Paulo')::date between inicio and fim and (select interno.tem_papel('representante')));
create policy "administrador lê e altera os patrocínios" on public.patrocinios for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));


-- Pagamentos: só o administrador.
create policy "visitante sem acesso aos pagamentos" on public.pagamentos_patrocinio as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso aos pagamentos" on public.pagamentos_patrocinio for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
create policy "representante sem acesso aos pagamentos" on public.pagamentos_patrocinio for select to authenticated
  using (false and (select interno.tem_papel('representante')));
create policy "administrador lê e altera os pagamentos" on public.pagamentos_patrocinio for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- Cliques: só o administrador lê; a gravação é pela função acima.
create policy "visitante sem acesso aos cliques" on public.cliques_patrocinio as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso aos cliques" on public.cliques_patrocinio for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
create policy "representante sem acesso aos cliques" on public.cliques_patrocinio for select to authenticated
  using (false and (select interno.tem_papel('representante')));
create policy "administrador lê os cliques" on public.cliques_patrocinio for select to authenticated using ((select interno.eh_admin()));

-- ---------------------------------------------------------------------------
-- Cotas da proposta v3 (21/10/2026) em Rio das Ostras
-- ---------------------------------------------------------------------------

insert into public.cotas_patrocinio (cidade_id, cota, nome, beneficios, valor_centavos, valor_fundador_centavos, vagas, largura_logo, altura_logo, ordem)
select c.id, v.cota::public.cota_patrocinio, v.nome, v.beneficios, v.valor, v.fundador, v.vagas, v.largura, v.altura, v.ordem
from public.cidades c, (values
  ('master', 'Master', array['Logo maior no rodapé de todas as páginas', '2 posts por mês no Instagram do Ache Aqui RO', 'Logo nos cartazes e panfletos, quando houver', 'Carro de som, quando houver'], 690000, 570000, 1, 600, 600, 1),
  ('ouro', 'Ouro', array['Logo médio no rodapé de todas as páginas', '1 post por mês no Instagram', 'Logo nos cartazes e panfletos, quando houver'], 490000, 400000, 3, 800, 200, 2),
  ('apoio', 'Apoio', array['Logo pequeno no rodapé de todas as páginas', '1 post de boas-vindas no Instagram'], 220000, 180000, 6, 400, 200, 3),
  ('grupo', 'Grupo de categorias', array['Nome ao lado do grupo, em todas as categorias dele (exemplo: Comércios)', '1 post por mês no Instagram'], 259000, 215000, null, 400, 200, 4),
  ('categoria', 'Categoria', array['Nome ao lado do título da categoria (exemplo: Pizzarias)', '1 post de boas-vindas no Instagram'], 129000, 107000, null, 400, 200, 5),
  ('agenda', 'Agenda', array['Nome ao lado do título da Agenda de shows e eventos', '1 post por mês no Instagram'], 290000, 240000, 1, 400, 200, 6)
) as v (cota, nome, beneficios, valor, fundador, vagas, largura, altura, ordem)
where c.slug = 'rio-das-ostras';

do $$
begin
  if (select count(*) from public.cotas_patrocinio) <> 6 then
    raise exception 'As 6 cotas de patrocínio não foram criadas';
  end if;
end $$;
