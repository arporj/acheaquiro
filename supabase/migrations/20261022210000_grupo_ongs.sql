-- Grupo ONGs (decisão de 22/10/2026): reúne ONG e projeto social e ONG de proteção
-- animal, que sai de Pets. Outros serviços passa a ser o último grupo.

insert into public.grupos_categoria (cidade_id, nome, ordem)
select c.id, 'ONGs', 18 from public.cidades c where c.slug = 'rio-das-ostras';

update public.grupos_categoria g set ordem = 19
from public.cidades c
where c.slug = 'rio-das-ostras' and g.cidade_id = c.id and g.nome = 'Outros serviços';

update public.categorias cat set grupo_id = g.id
from public.cidades c, public.grupos_categoria g
where c.slug = 'rio-das-ostras' and cat.cidade_id = c.id and cat.slug_lista in ('ongs', 'ongs-de-protecao-animal')
  and g.cidade_id = c.id and g.nome = 'ONGs';
