-- Catálogo público lido pelas páginas do site de produção (21/10/2026):
-- cidade, bairros, categorias, planos, extras e as regras de cobrança que as
-- páginas mostram. Uma chamada só por página refeita, no formato dos tipos de
-- packages/types.

-- Ordem dos extras na página Anuncie aqui e meses cobrados no anual, que até
-- aqui só existiam nos dados fictícios (apps/web/src/mocks/planos.ts).
alter table public.extras
  add column ordem smallint not null default 0 check (ordem >= 0),
  add column meses_cobrados_no_anual smallint not null default 10 check (meses_cobrados_no_anual between 1 and 12);

update public.extras e
set ordem = o.ordem
from (values
  ('destaque-exclusivo', 1),
  ('super-destaque', 2),
  ('link-patrocinado-cidade', 3),
  ('link-patrocinado', 4),
  ('patrocinado-plus', 5),
  ('categoria-adicional', 6),
  ('pacote-fotos', 7),
  ('encarte-adicional', 8),
  ('pacote-produtos', 9),
  ('endereco-adicional', 10)
) as o (codigo, ordem)
where e.codigo = o.codigo;

-- Os identificadores públicos são os nomes fixos (slug do bairro, link curto da
-- categoria, código do plano e do extra), e não os uuid: aparecem nos endereços
-- (?bairro=centro) e são os mesmos dos dados fictícios do site de apresentação.
--
-- security definer: as configurações não são legíveis pelo visitante (RLS), e
-- aqui saem só as quatro chaves públicas abaixo. Os filtros de ativo/ativa são
-- os mesmos das políticas de leitura do visitante.
create function public.catalogo_publico(p_cidade text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with cidade as (
    select id, nome, uf, slug from public.cidades where slug = p_cidade and ativa
  ),
  config as (
    select chave, valor from public.configuracoes
    where cidade_id = (select id from cidade)
      and chave in ('desconto_fundador_percentual', 'prazo_fundador', 'tolerancia_vencimento_dias', 'abertura_ao_publico')
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
      'percentualDescontoFundador', (select (valor #>> '{}')::integer from config where chave = 'desconto_fundador_percentual'),
      'prazoFundador', (select valor #>> '{}' from config where chave = 'prazo_fundador'),
      'toleranciaVencimentoDias', (select (valor #>> '{}')::integer from config where chave = 'tolerancia_vencimento_dias')
    ),
    'aberturaAoPublico', (select valor #>> '{}' from config where chave = 'abertura_ao_publico')
  )
  where exists (select 1 from cidade)
$$;

revoke execute on function public.catalogo_publico(text) from public;
grant execute on function public.catalogo_publico(text) to anon, authenticated;
