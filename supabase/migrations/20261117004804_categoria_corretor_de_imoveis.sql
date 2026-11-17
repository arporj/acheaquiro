-- Categoria "Corretor de imóveis" (decisão de 16/11/2026, na primeira venda): o
-- corretor não se encontrava em "Imobiliária". Vale para autônomo e comércio,
-- como as outras categorias de serviço, e exige registro no conselho (CRECI,
-- Lei 6.530/1978). Os sinônimos servem à busca do site e do formulário.

insert into public.categorias (cidade_id, grupo_id, tipo, nome, nome_plural, slug_lista, icone, cor, exige_registro_conselho)
select c.id, g.id, 'ambos', 'Corretor de imóveis', 'Corretores de imóveis', 'corretores-de-imoveis', 'house', '#2563EB', true
from public.cidades c
join public.grupos_categoria g on g.cidade_id = c.id and g.nome = 'Serviços profissionais'
where c.slug = 'rio-das-ostras'
on conflict (cidade_id, slug_lista) do nothing;

insert into public.sinonimos_categoria (categoria_id, termo)
select cat.id, v.termo
from public.cidades c
join public.categorias cat on cat.cidade_id = c.id
join (values
  ('corretores-de-imoveis', 'corretor'),
  ('corretores-de-imoveis', 'corretora de imóveis'),
  ('corretores-de-imoveis', 'imóveis'),
  ('corretores-de-imoveis', 'CRECI'),
  ('imobiliarias', 'imóveis'),
  ('imobiliarias', 'aluguel de imóveis'),
  ('imobiliarias', 'venda de imóveis')
) as v (slug, termo) on v.slug = cat.slug_lista
where c.slug = 'rio-das-ostras'
on conflict (categoria_id, termo_normalizado) do nothing;
