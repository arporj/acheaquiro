-- Formato de cada arquivo no bucket público (21/10/2026): alguns iPhones não
-- geram WebP no navegador, e a foto chega em JPEG. A extensão do endereço sai
-- desta coluna: <chave>-<tamanho>.webp ou .jpg; encarte: <chave>.webp, .jpg ou .pdf.
-- As tabelas ainda estão vazias.

alter table public.fotos
  add column formato text not null default 'webp' check (formato in ('webp', 'jpeg'));

alter table public.encartes drop column tipo_arquivo;
alter table public.encartes
  add column formato text not null check (formato in ('webp', 'jpeg', 'pdf'));

drop type public.tipo_arquivo;
