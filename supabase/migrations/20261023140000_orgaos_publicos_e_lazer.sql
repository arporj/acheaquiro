-- Pedidos de 23/10/2026:
-- - órgãos públicos importados da Receita (natureza jurídica 1xxx) entram num
--   grupo próprio, com a categoria pela atividade (escola, saúde ou outros);
-- - boliche e parques de diversão entram em "Lazer e entretenimento";
-- - rodeios vão para Organização de eventos e albergues assistenciais para ONGs.

insert into public.grupos_categoria (cidade_id, nome, ordem)
select c.id, 'Órgãos públicos', 19 from public.cidades c where c.slug = 'rio-das-ostras';

update public.grupos_categoria g set ordem = 20
from public.cidades c
where c.slug = 'rio-das-ostras' and g.cidade_id = c.id and g.nome = 'Outros serviços';

insert into public.categorias (cidade_id, grupo_id, tipo, nome, nome_plural, slug_lista, icone, cor)
select c.id, g.id, 'comercio'::public.tipo_categoria, v.nome, v.plural, v.slug, v.icone, v.cor
from public.cidades c
join public.grupos_categoria g on g.cidade_id = c.id
join (values
  ('Órgãos públicos', 'Prefeitura e órgão público', 'Prefeitura e órgãos públicos', 'orgaos-publicos', 'landmark', '#2563EB'),
  ('Órgãos públicos', 'Escola pública', 'Escolas públicas', 'escolas-publicas', 'school', '#F2A900'),
  ('Órgãos públicos', 'Saúde pública', 'Saúde pública', 'saude-publica', 'hospital', '#E53935'),
  ('Turismo e hospedagem', 'Lazer e entretenimento', 'Lazer e entretenimento', 'lazer-e-entretenimento', 'ferris-wheel', '#D81B7A')
) as v (grupo, nome, plural, slug, icone, cor) on g.nome = v.grupo
where c.slug = 'rio-das-ostras';

insert into public.sinonimos_categoria (categoria_id, termo)
select cat.id, v.termo
from public.cidades c
join public.categorias cat on cat.cidade_id = c.id
join (values
  ('orgaos-publicos', 'prefeitura'),
  ('orgaos-publicos', 'secretaria'),
  ('escolas-publicas', 'escola municipal'),
  ('saude-publica', 'posto de saúde'),
  ('saude-publica', 'UPA'),
  ('lazer-e-entretenimento', 'boliche'),
  ('lazer-e-entretenimento', 'parque de diversões'),
  ('lazer-e-entretenimento', 'entretenimento')
) as v (slug, termo) on cat.slug_lista = v.slug
where c.slug = 'rio-das-ostras'
on conflict (categoria_id, termo_normalizado) do nothing;

-- CNAEs já gravados pela primeira carga do mapa (parques de diversão estava fora).
update public.cnae_categoria cc set categoria_id = cat.id
from public.cidades c, public.categorias cat
where c.slug = 'rio-das-ostras' and cc.cidade_id = c.id and cat.cidade_id = c.id
  and ((cc.cnae in ('9321200', '9329802') and cat.slug_lista = 'lazer-e-entretenimento')
    or (cc.cnae = '9001905' and cat.slug_lista = 'organizacao-de-eventos')
    or (cc.cnae = '8730102' and cat.slug_lista = 'ongs'));
