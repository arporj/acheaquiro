-- Catálogo público com o percentual da carteira do representante (decisões N1
-- a N3, 27/10/2026), para a página Seja um representante mostrar o valor das
-- configurações. Mesma função da migration 20261021200000, com o campo novo.

create or replace function public.catalogo_publico(p_cidade text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with cidade as (
    select id, nome, uf, slug from public.cidades where slug = p_cidade and ativa
  ),
  config as (
    select chave, valor from public.configuracoes
    where cidade_id = (select id from cidade)
      and chave in ('desconto_fundador_escala', 'prazo_fundador', 'tolerancia_vencimento_dias', 'abertura_ao_publico', 'percentual_carteira')
  )
  select jsonb_build_object(
    'cidade', (select jsonb_build_object('id', slug, 'nome', nome, 'uf', uf, 'slug', slug) from cidade),
    'bairros', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.slug, 'cidadeId', p_cidade, 'nome', b.nome) order by interno.normalizar(b.nome))
      from public.bairros b where b.cidade_id = (select id from cidade) and b.ativo
    ), '[]'::jsonb),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.slug_lista,
        'nome', c.nome,
        'nomePlural', c.nome_plural,
        'slugLista', c.slug_lista,
        'grupo', g.nome,
        'sinonimos', coalesce((select jsonb_agg(s.termo order by s.termo) from public.sinonimos_categoria s where s.categoria_id = c.id), '[]'::jsonb),
        'icone', c.icone,
        'cor', c.cor,
        'exigeRegistroConselho', c.exige_registro_conselho,
        'atalho', c.ordem_atalho is not null
      ) order by g.ordem, interno.normalizar(c.nome))
      from public.categorias c
      join public.grupos_categoria g on g.id = c.grupo_id
      where c.cidade_id = (select id from cidade) and c.ativa
    ), '[]'::jsonb),
    'ordemAtalhos', coalesce((
      select jsonb_agg(c.slug_lista order by c.ordem_atalho)
      from public.categorias c
      where c.cidade_id = (select id from cidade) and c.ativa and c.ordem_atalho is not null
    ), '[]'::jsonb),
    'planos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.codigo,
        'tipo', p.tipo,
        'nome', p.nome,
        'selo', p.selo,
        'nivel', p.nivel,
        'valorMensalCentavos', p.valor_mensal_centavos,
        'mesesCobradosNoAnual', p.meses_cobrados_no_anual,
        'limiteFotos', p.limite_fotos,
        'limiteCategoriasAdicionais', p.limite_categorias_adicionais,
        'limiteEncartesSemana', p.limite_encartes_semana,
        'limiteProdutos', p.limite_produtos,
        'temRelatorio', p.tem_relatorio
      ) order by p.tipo, p.nivel)
      from public.planos p where p.cidade_id = (select id from cidade) and p.ativo
    ), '[]'::jsonb),
    'extras', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', e.codigo,
        'nome', e.nome,
        'descricao', e.descricao,
        'valorMensalCentavos', e.valor_mensal_centavos,
        'unidade', e.unidade,
        'cobranca', e.cobranca,
        'porDia', case when e.cobranca = 'por_dia' then jsonb_build_object(
          'diariaCentavos', (e.regras ->> 'diaria_centavos')::integer,
          'valorBlocoCentavos', (e.regras ->> 'valor_bloco_centavos')::integer,
          'diasPorBloco', (e.regras ->> 'dias_por_bloco')::integer,
          'minimoDiasParaBloco', (e.regras ->> 'minimo_dias_para_bloco')::integer,
          'antecedenciaDias', (e.regras ->> 'antecedencia_dias')::integer
        ) end,
        'mesesCobradosNoAnual', e.meses_cobrados_no_anual,
        'aceitaDescontoFundador', e.aceita_desconto_fundador,
        'permiteAnual', e.permite_anual
      )) order by e.ordem, e.codigo)
      from public.extras e where e.cidade_id = (select id from cidade) and e.ativo
    ), '[]'::jsonb),
    'regras', jsonb_build_object(
      'escalaDescontoFundador', (select valor from config where chave = 'desconto_fundador_escala'),
      'prazoFundador', (select valor #>> '{}' from config where chave = 'prazo_fundador'),
      'toleranciaVencimentoDias', (select (valor #>> '{}')::integer from config where chave = 'tolerancia_vencimento_dias'),
      'percentualCarteira', coalesce((select (valor #>> '{}')::integer from config where chave = 'percentual_carteira'), 0)
    ),
    'aberturaAoPublico', (select valor #>> '{}' from config where chave = 'abertura_ao_publico')
  )
  where exists (select 1 from cidade)
$$;
