-- Bloco "Acontece em Rio das Ostras" na página inicial (decisões J1 a J5 de
-- 24/11/2026): divulgação feita pelo próprio site, sem pagamento, de eventos
-- da Agenda, campanhas solidárias ou de utilidade pública e do próprio Ache
-- Aqui. Sem limite de quantidade; um destaque por vez, trocando sozinho.
--
-- J3: o evento só entra se estiver publicado e liberado na Agenda (pago ou
-- cortesia), para a divulgação grátis não passar por cima do evento avulso
-- pago. J4: comércio citado que não é anunciante exige a autorização de quem
-- responde por ele (nome e dia), gravada aqui e na auditoria.
-- Regras de situação, ordem e etiqueta em packages/domain/destaques.ts;
-- validação em packages/validation/destaque.ts.

create type public.tipo_destaque as enum ('evento', 'campanha', 'ache_aqui');

create table public.destaques (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references public.cidades (id),
  tipo public.tipo_destaque not null,
  -- Evento da Agenda (tipo evento): o link é a página do evento e a imagem, o cartaz dele.
  evento_id uuid references public.eventos (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) between 3 and 60),
  texto text not null default '' check (length(texto) <= 140),
  -- Imagem própria em JPEG: <chave>-400.jpg, -800.jpg e -1600.jpg no bucket público.
  imagem_chave text unique check (imagem_chave ~ '^destaques/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  imagem_largura integer check (imagem_largura between 1 and 1600),
  imagem_altura integer check (imagem_altura between 1 and 1600),
  -- Página do site (/agenda) ou endereço externo com https (decisão H4).
  link text check (length(link) <= 300 and (link ~ '^/[^/]' or link ~ '^https://[^/\s]+\.[^\s]+$')),
  -- Comércio citado (J4) e a autorização de quem responde por ele.
  comercio text check (length(trim(comercio)) between 2 and 80),
  autorizado_por text check (length(trim(autorizado_por)) between 2 and 80),
  autorizado_em date,
  inicio date not null,
  fim date not null,
  ordem smallint not null default 0 check (ordem between 0 and 999),
  ligado boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim >= inicio),
  check ((tipo = 'evento') = (evento_id is not null)),
  check (tipo = 'evento' or (link is not null and imagem_chave is not null)),
  check ((imagem_chave is null) = (imagem_largura is null) and (imagem_chave is null) = (imagem_altura is null)),
  check (comercio is null or (autorizado_por is not null and autorizado_em is not null))
);

create index destaques_no_ar on public.destaques (cidade_id, fim) where ligado;
create index destaques_evento on public.destaques (evento_id) where evento_id is not null;

/**
 * J3: o destaque de evento só é criado, ligado ou trocado de evento quando o
 * evento aparece na Agenda (publicado e liberado). Se o evento sair do ar
 * depois, o destaque some sozinho do site (política de leitura abaixo).
 */
create function interno.conferir_destaque() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'evento' and new.ligado
     and (tg_op = 'INSERT' or new.evento_id is distinct from old.evento_id or not old.ligado)
     and not interno.evento_visivel(new.evento_id) then
    raise exception 'O evento precisa estar publicado e liberado na Agenda (pago ou como cortesia).' using errcode = 'P0001';
  end if;
  return new;
end
$$;

revoke execute on function interno.conferir_destaque() from public, anon, authenticated;

create trigger conferir_destaque before insert or update on public.destaques
for each row execute function interno.conferir_destaque();

/** O destaque aparece no site: ligado, dentro das datas e, se for de evento, com o evento visível. */
create function interno.destaque_no_ar(p_destaque uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.destaques d
    where d.id = p_destaque
      and d.ligado
      and (now() at time zone 'America/Sao_Paulo')::date between d.inicio and d.fim
      and (d.evento_id is null or interno.evento_visivel(d.evento_id))
  )
$$;

revoke execute on function interno.destaque_no_ar(uuid) from public;
grant execute on function interno.destaque_no_ar(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cliques (J5), por dia, pelo endereço /d/[id]
-- ---------------------------------------------------------------------------

create table public.cliques_destaque (
  destaque_id uuid not null references public.destaques (id) on delete cascade,
  dia date not null,
  cliques integer not null default 0 check (cliques >= 0),
  primary key (destaque_id, dia)
);

/**
 * Conta o clique no destaque. Cliques repetidos do mesmo visitante no mesmo
 * destaque, em 30 minutos, contam uma vez só. p_visitante é o resumo (hash)
 * do visitante feito no Worker: o IP não chega aqui. Devolve o destino, para
 * o servidor não precisar de outra consulta; destaque fora do ar devolve nulo.
 */
create function public.registrar_clique_destaque(p_destaque uuid, p_visitante text) returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  destino text;
begin
  if p_visitante is null or p_visitante !~ '^[a-f0-9]{16,64}$' then
    raise exception 'registrar_clique_destaque: visitante inválido';
  end if;
  if not interno.destaque_no_ar(p_destaque) then
    return null;
  end if;
  select coalesce(d.link, '/agenda/' || e.slug) into destino
  from public.destaques d left join public.eventos e on e.id = d.evento_id
  where d.id = p_destaque;
  if public.consumir_limite('clique-destaque:' || p_destaque::text || ':' || p_visitante, 1, 1800) then
    insert into public.cliques_destaque as c (destaque_id, dia, cliques)
    values (p_destaque, hoje, 1)
    on conflict (destaque_id, dia) do update set cliques = c.cliques + 1;
  end if;
  return destino;
end
$$;

revoke all on function public.registrar_clique_destaque(uuid, text) from public;
grant execute on function public.registrar_clique_destaque(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Datas de atualização e auditoria
-- ---------------------------------------------------------------------------

create trigger marcar_atualizacao before update on public.destaques for each row execute function interno.marcar_atualizacao();
create trigger auditar after insert or update or delete on public.destaques for each row execute function interno.auditar();

-- ---------------------------------------------------------------------------
-- RLS: política explícita para cada papel
-- ---------------------------------------------------------------------------

alter table public.destaques enable row level security;
alter table public.cliques_destaque enable row level security;

-- Destaques: o público vê só os que estão no ar; só a administração cadastra.
create policy "visitante lê os destaques no ar" on public.destaques for select to anon
  using (interno.destaque_no_ar(id));
create policy "anunciante lê os destaques no ar" on public.destaques for select to authenticated
  using (interno.destaque_no_ar(id) and (select interno.tem_papel('anunciante')));
create policy "representante lê os destaques no ar" on public.destaques for select to authenticated
  using (interno.destaque_no_ar(id) and (select interno.tem_papel('representante')));
create policy "administrador lê e altera os destaques" on public.destaques for all to authenticated
  using ((select interno.eh_admin())) with check ((select interno.eh_admin()));

-- Cliques: só o administrador lê; a gravação é pela função acima.
create policy "visitante sem acesso aos cliques" on public.cliques_destaque as restrictive for all to anon using (false) with check (false);
create policy "anunciante sem acesso aos cliques" on public.cliques_destaque for select to authenticated
  using (false and (select interno.tem_papel('anunciante')));
create policy "representante sem acesso aos cliques" on public.cliques_destaque for select to authenticated
  using (false and (select interno.tem_papel('representante')));
create policy "administrador lê os cliques" on public.cliques_destaque for select to authenticated using ((select interno.eh_admin()));
