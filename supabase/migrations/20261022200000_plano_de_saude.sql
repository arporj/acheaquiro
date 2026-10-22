-- Categoria Plano de saúde no grupo Saúde (pedido de 22/10/2026), com o CNAE 6550200.

insert into public.categorias (cidade_id, grupo_id, tipo, nome, nome_plural, slug_lista, icone, cor)
select c.id, g.id, 'ambos', 'Plano de saúde', 'Planos de saúde', 'planos-de-saude', 'heart-pulse', '#1E9E4A'
from public.cidades c
join public.grupos_categoria g on g.cidade_id = c.id and g.nome = 'Saúde'
where c.slug = 'rio-das-ostras';

insert into public.sinonimos_categoria (categoria_id, termo)
select cat.id, v.termo
from public.cidades c
join public.categorias cat on cat.cidade_id = c.id and cat.slug_lista = 'planos-de-saude'
cross join (values ('convênio'), ('plano médico'), ('plano odontológico')) as v (termo)
where c.slug = 'rio-das-ostras';

-- O CNAE já foi gravado fora da importação pela primeira carga do mapa.
update public.cnae_categoria cc set categoria_id = cat.id
from public.cidades c, public.categorias cat
where c.slug = 'rio-das-ostras' and cc.cidade_id = c.id and cc.cnae = '6550200'
  and cat.cidade_id = c.id and cat.slug_lista = 'planos-de-saude';
