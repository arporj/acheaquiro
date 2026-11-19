-- Foto de capa do perfil do anunciante (decisão de 19/11/2026): uma por
-- anunciante, como a foto de perfil, em todos os planos e fora do limite de
-- fotos da galeria. Quem pode enviar e apagar segue o RLS da tabela fotos
-- (dono, representante no cadastro assistido e administração), sem mudança.

create unique index fotos_uma_de_capa_idx on public.fotos (anunciante_id) where finalidade = 'capa' and situacao = 'publicado';

-- Como na migration 20261028110000, com a capa ('fotoCapa') no perfil completo.
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
    -- Importado que já tem dono (convite enviado): some a seção "Este comércio é seu?".
    'assumido', a.usuario_id is not null,
    'nome', a.nome,
    'categoriaId', cp.slug_lista,
    -- Só as que cabem no plano em vigor (plano menor: o resto fica guardado).
    'categoriasAdicionais', coalesce((
      select jsonb_agg(c.slug_lista order by c.nome)
      from public.categorias c
      where c.id in (select interno.categorias_visiveis(a.id)) and c.id <> a.categoria_principal_id
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
    -- Capa (decisão de 19/11/2026): foto própria, uma só, fora do limite da galeria.
    -- Sem capa, a página mostra a 1ª foto da galeria, como antes.
    'fotoCapa', case when p_completo then (
      select jsonb_build_object('id', f.id, 'caminho', interno.caminho_foto(f.chave, f.formato)) from public.fotos f
      where f.anunciante_id = a.id and f.finalidade = 'capa' and f.situacao = 'publicado'
      order by f.criado_em desc limit 1
    ) end,
    'galeria', case when p_completo then coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'caminho', interno.caminho_foto(g.chave, g.formato), 'legenda', g.legenda, 'parId', g.par_id, 'papelNoPar', g.papel_no_par) order by g.ordem)
      from (
        select f.* from public.fotos f
        where f.anunciante_id = a.id and f.finalidade = 'galeria' and f.situacao = 'publicado'
        order by f.ordem
        limit coalesce(p.limite_fotos, 0)
      ) g
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
        'bairroId', e.bairro_slug,
        'latitude', extensions.st_y(e.local::extensions.geometry),
        'longitude', extensions.st_x(e.local::extensions.geometry)
      )) order by e.principal desc, e.criado_em)
      from (
        select en.*, b.slug as bairro_slug
        from public.enderecos en join public.bairros b on b.id = en.bairro_id
        where en.anunciante_id = a.id
        order by en.principal desc, en.criado_em
        limit coalesce(p.limite_enderecos, 1)
      ) e
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
