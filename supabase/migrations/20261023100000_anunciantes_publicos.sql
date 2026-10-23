-- Leitura pública dos anunciantes (decisão de 23/10/2026): o site da produção
-- passa a mostrar os anunciantes do banco, a começar pelos comércios
-- importados da Receita. Mesmo padrão do catalogo_publico: o banco devolve o
-- anunciante no formato das páginas (categoria pelo link curto, plano pelo
-- código, bairro pelo slug) e só os publicados. Encartes e produtos entram
-- quando houver a tela do anunciante para cadastrá-los.

create function interno.anunciante_json(p_id uuid, p_completo boolean) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', a.id,
    'slug', a.slug,
    'cidadeId', ci.slug,
    'tipo', a.tipo,
    'origem', a.origem,
    'nome', a.nome,
    'categoriaId', cp.slug_lista,
    'categoriasAdicionais', coalesce((
      select jsonb_agg(c.slug_lista order by c.nome)
      from public.anunciante_categorias ac
      join public.categorias c on c.id = ac.categoria_id
      where ac.anunciante_id = a.id and c.id <> a.categoria_principal_id and c.ativa
    ), '[]'::jsonb),
    'planoId', p.codigo,
    'fundador', a.fundador,
    'descricao', a.descricao,
    'whatsapp', a.whatsapp,
    'telefone', a.telefone,
    'instagram', a.instagram,
    'formasPagamento', to_jsonb(a.formas_pagamento),
    'registroConselho', a.registro_conselho,
    'fotoPerfil', jsonb_build_object('id', a.id, 'chave', (
      select f.chave from public.fotos f
      where f.anunciante_id = a.id and f.finalidade = 'perfil' and f.situacao = 'publicado'
      order by f.ordem limit 1
    )),
    'galeria', case when p_completo then coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'chave', f.chave, 'legenda', f.legenda, 'parId', f.par_id, 'papelNoPar', f.papel_no_par) order by f.ordem)
      from public.fotos f
      where f.anunciante_id = a.id and f.finalidade = 'galeria' and f.situacao = 'publicado'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'horario', case when p_completo then coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'intervalos', d.intervalos) order by d.dia)
      from (
        select h.dia_semana as dia,
          jsonb_agg(jsonb_build_object('abre', to_char(h.abre, 'HH24:MI'), 'fecha', to_char(h.fecha, 'HH24:MI')) order by h.abre) as intervalos
        from public.horarios h where h.anunciante_id = a.id
        group by h.dia_semana
      ) d
    ), '[]'::jsonb) else '[]'::jsonb end,
    'atendeTodaCidade', case when a.tipo = 'profissional' then a.atende_toda_cidade end,
    'bairrosAtendidos', case when a.tipo = 'profissional' then coalesce((
      select jsonb_agg(b.slug order by b.nome)
      from public.anunciante_bairros ab join public.bairros b on b.id = ab.bairro_id
      where ab.anunciante_id = a.id and ab.finalidade = 'atendimento'
    ), '[]'::jsonb) end,
    'enderecos', case when a.tipo = 'comercio' then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', e.id,
        'logradouro', e.logradouro,
        'numero', e.numero,
        'complemento', e.complemento,
        'bairroId', b.slug,
        'latitude', extensions.st_y(e.local::extensions.geometry),
        'longitude', extensions.st_x(e.local::extensions.geometry)
      )) order by e.principal desc, e.criado_em)
      from public.enderecos e join public.bairros b on b.id = e.bairro_id
      where e.anunciante_id = a.id
    ), '[]'::jsonb) end,
    'encartes', case when a.tipo = 'comercio' then '[]'::jsonb end,
    'produtos', case when a.tipo = 'comercio' then '[]'::jsonb end,
    'entrega', case when a.tipo = 'comercio' and a.faz_entrega then jsonb_build_object(
      'todaCidade', a.entrega_toda_cidade,
      'bairros', coalesce((
        select jsonb_agg(b.slug order by b.nome)
        from public.anunciante_bairros ab join public.bairros b on b.id = ab.bairro_id
        where ab.anunciante_id = a.id and ab.finalidade = 'entrega'
      ), '[]'::jsonb)
    ) end,
    'siteProprio', case when a.tipo = 'comercio' then a.site_proprio end
  ))
  from public.anunciantes a
  join public.cidades ci on ci.id = a.cidade_id
  join public.categorias cp on cp.id = a.categoria_principal_id
  left join public.planos p on p.id = a.plano_id
  where a.id = p_id and a.status = 'publicado'
$$;

revoke execute on function interno.anunciante_json(uuid, boolean) from public, anon, authenticated;

/** Perfil completo de um anunciante publicado, pelo endereço /perfil/slug. */
create function public.anunciante_publico(p_cidade text, p_slug text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select interno.anunciante_json(a.id, true)
  from public.anunciantes a join public.cidades c on c.id = a.cidade_id
  where c.slug = p_cidade and a.slug = p_slug and a.status = 'publicado'
$$;

/**
 * Anunciantes publicados para as listas, sem galeria e sem horário. Filtros
 * opcionais: categorias (link curto, principal ou adicional), termo no nome e
 * só Fundadores. Com categorias e termo juntos, vale qualquer um dos dois
 * (busca do site: a categoria encontrada ou o nome digitado).
 */
create function public.anunciantes_publicos(
  p_cidade text,
  p_categorias text[] default null,
  p_termo text default null,
  p_so_fundadores boolean default false,
  p_limite integer default 500
) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(interno.anunciante_json(x.id, false) order by x.nome), '[]'::jsonb)
  from (
    select a.id, a.nome
    from public.anunciantes a
    join public.cidades c on c.id = a.cidade_id
    where c.slug = p_cidade
      and a.status = 'publicado'
      and (not p_so_fundadores or a.fundador)
      and (
        (p_categorias is null and p_termo is null)
        or exists (
          select 1 from public.categorias cat
          where cat.slug_lista = any (p_categorias) and cat.cidade_id = c.id
            and (cat.id = a.categoria_principal_id
              or exists (select 1 from public.anunciante_categorias ac where ac.anunciante_id = a.id and ac.categoria_id = cat.id))
        )
        or (length(trim(coalesce(p_termo, ''))) >= 2
          -- % e _ digitados valem como texto, não como curinga.
          and interno.normalizar(a.nome) like
            '%' || replace(replace(replace(interno.normalizar(p_termo), '\', '\\'), '%', '\%'), '_', '\_') || '%')
      )
    order by a.nome
    limit least(greatest(p_limite, 1), 1000)
  ) x
$$;

revoke execute on function public.anunciante_publico(text, text) from public;
revoke execute on function public.anunciantes_publicos(text, text[], text, boolean, integer) from public;
grant execute on function public.anunciante_publico(text, text) to anon, authenticated;
grant execute on function public.anunciantes_publicos(text, text[], text, boolean, integer) to anon, authenticated;
