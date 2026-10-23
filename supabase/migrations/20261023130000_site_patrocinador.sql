-- Site do patrocinador, opcional (pedido de 23/10/2026). Aparece na página
-- /patrocinadores e passa por /p/[slug]?site, que conta o clique.
alter table public.patrocinios
  add column site text check (site ~ '^https://[^\s]{4,300}$');
