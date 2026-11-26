-- Artista sem cadastro na programação (decisões de 26/11/2026): quem monta a
-- programação busca o artista pelo nome e, se ele não está cadastrado, usa só o
-- nome. Quando quem usou só o nome não é da administração (cliente ou
-- representante), o horário vai para o ar com o nome e entra em "Artistas a
-- cadastrar" na administração, que cadastra o artista (ou escolhe um já
-- cadastrado) e ele entra no lugar do nome, ou deixa só o nome (banda de fora
-- da cidade, sem página no site). O nome sem cadastro fica separado de
-- "Atividade ou observação" (titulo), para a observação não se perder na troca.

alter table public.programacao_evento
  add column artista_nome text check (length(artista_nome) between 2 and 80),
  add column cadastro_pedido boolean not null default false;

comment on column public.programacao_evento.artista_nome is 'Nome do artista sem cadastro no site.';
comment on column public.programacao_evento.cadastro_pedido is 'Nome sem cadastro usado por quem não é da administração, esperando a administração cadastrar o artista ou deixar só o nome.';

-- Um artista cadastrado ou um nome sem cadastro (nunca os dois), ou só a atividade.
alter table public.programacao_evento drop constraint programacao_evento_check;
alter table public.programacao_evento add constraint programacao_evento_artista_ou_titulo
  check (num_nonnulls(artista_id, artista_nome) <= 1 and num_nonnulls(artista_id, artista_nome, titulo) >= 1);
alter table public.programacao_evento add constraint programacao_evento_pedido_com_nome
  check (not cadastro_pedido or artista_nome is not null);

create index programacao_cadastro_pedido_idx on public.programacao_evento (criado_em) where cadastro_pedido;

/**
 * Arruma os espaços do nome sem cadastro e marca o pedido de cadastro: só o
 * cliente e o representante geram o pedido. A administração (e o sistema) usam
 * o nome de propósito e só podem tirar o pedido, nunca criá-lo.
 */
create function interno.conferir_artista_sem_cadastro() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.artista_nome := nullif(regexp_replace(trim(new.artista_nome), '\s+', ' ', 'g'), '');
  if new.artista_nome is null then
    new.cadastro_pedido := false;
  elsif interno.eh_admin() or coalesce(auth.role(), '') <> 'authenticated' then
    new.cadastro_pedido := tg_op = 'UPDATE' and new.cadastro_pedido and old.cadastro_pedido;
  elsif tg_op = 'INSERT' or new.artista_nome is distinct from old.artista_nome then
    new.cadastro_pedido := true;
  else
    new.cadastro_pedido := old.cadastro_pedido;
  end if;
  return new;
end
$$;

create trigger artista_sem_cadastro before insert or update on public.programacao_evento
  for each row execute function interno.conferir_artista_sem_cadastro();

/**
 * Resolve os horários de um nome de "Artistas a cadastrar" (a tela agrupa os
 * horários pelo nome): com o artista, ele entra no lugar do nome; sem o artista,
 * fica só o nome e o pedido sai da lista. Só a administração. Devolve quantos
 * horários foram resolvidos.
 */
create function public.resolver_artista_a_cadastrar(p_itens uuid[], p_artista uuid) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
begin
  if not interno.eh_admin() then
    raise exception 'Só a administração resolve os artistas a cadastrar.' using errcode = '42501';
  end if;
  if p_artista is not null and not exists (select 1 from public.artistas a where a.id = p_artista) then
    raise exception 'Artista não encontrado.';
  end if;
  update public.programacao_evento p
  set artista_id = coalesce(p_artista, p.artista_id),
      artista_nome = case when p_artista is null then p.artista_nome end,
      cadastro_pedido = false
  where p.id = any (p_itens) and p.cadastro_pedido;
  get diagnostics v_total = row_count;
  return v_total;
end
$$;

revoke all on function public.resolver_artista_a_cadastrar(uuid[], uuid) from public, anon;
grant execute on function public.resolver_artista_a_cadastrar(uuid[], uuid) to authenticated;
