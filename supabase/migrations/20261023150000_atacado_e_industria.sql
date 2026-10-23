-- Grupo Atacado e indústria (decisão de 23/10/2026): atacados e distribuidoras
-- (CNAE 46, menos os representantes comerciais, 461) e indústrias e fábricas
-- (CNAE 10 a 32) passam a ser importados. Manutenção industrial (33) continua fora.

insert into public.grupos_categoria (cidade_id, nome, ordem)
select c.id, 'Atacado e indústria', 20 from public.cidades c where c.slug = 'rio-das-ostras';

update public.grupos_categoria g set ordem = 21
from public.cidades c
where c.slug = 'rio-das-ostras' and g.cidade_id = c.id and g.nome = 'Outros serviços';

insert into public.categorias (cidade_id, grupo_id, tipo, nome, nome_plural, slug_lista, icone, cor)
select c.id, g.id, 'comercio'::public.tipo_categoria, v.nome, v.plural, v.slug, v.icone, v.cor
from public.cidades c
join public.grupos_categoria g on g.cidade_id = c.id and g.nome = 'Atacado e indústria'
cross join (values
  ('Atacado e distribuidora', 'Atacados e distribuidoras', 'atacados-e-distribuidoras', 'warehouse', '#475569'),
  ('Indústria e fábrica', 'Indústrias e fábricas', 'industrias-e-fabricas', 'factory', '#9A5B2E')
) as v (nome, plural, slug, icone, cor)
where c.slug = 'rio-das-ostras';

insert into public.sinonimos_categoria (categoria_id, termo)
select cat.id, v.termo
from public.categorias cat
join (values
  ('atacados-e-distribuidoras', 'atacado'),
  ('atacados-e-distribuidoras', 'distribuidora'),
  ('atacados-e-distribuidoras', 'fornecedor'),
  ('industrias-e-fabricas', 'fábrica'),
  ('industrias-e-fabricas', 'indústria')
) as v (slug, termo) on cat.slug_lista = v.slug
on conflict (categoria_id, termo_normalizado) do nothing;

-- CNAEs já gravados fora da importação passam para as categorias novas.
update public.cnae_categoria cc set categoria_id = cat.id
from public.categorias cat
where cc.cidade_id = cat.cidade_id and cc.categoria_id is null
  and ((cat.slug_lista = 'atacados-e-distribuidoras' and cc.cnae ~ '^46' and cc.cnae !~ '^461')
    or (cat.slug_lista = 'industrias-e-fabricas' and cc.cnae ~ '^(1[0-9]|2[0-9]|3[0-2])'));
