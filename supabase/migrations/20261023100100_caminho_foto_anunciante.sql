-- A foto do anunciante sai com o caminho no bucket público (tamanho 800 e a
-- extensão do formato, como em apps/web/src/lib/arquivos.ts), e não só a chave.

create function interno.caminho_foto(p_chave text, p_formato text) returns text
language sql immutable
set search_path = ''
as $f$ select p_chave || '-800.' || case p_formato when 'jpeg' then 'jpg' else 'webp' end $f$;

create or replace function interno.anunciante_json(p_id uuid, p_completo boolean) returns jsonb
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
    'fotoPerfil', jsonb_build_object('id', a.id, 'caminho', (
      select interno.caminho_foto(f.chave, f.formato) from public.fotos f
      where f.anunciante_id = a.id and f.finalidade = 'perfil' and f.situacao = 'publicado'
      order by f.ordem limit 1
    )),
    'galeria', case when p_completo then coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'caminho', interno.caminho_foto(f.chave, f.formato), 'legenda', f.legenda, 'parId', f.par_id, 'papelNoPar', f.papel_no_par) order by f.ordem)
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
