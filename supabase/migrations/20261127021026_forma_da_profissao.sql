-- Forma da profissão no anúncio (decisão Q3 de 26/11/2026, no lugar do "(a)" em
-- só algumas categorias, como "Advogado(a)", enquanto "Corretor de imóveis"
-- ficava só no masculino).
--
-- - A categoria guarda o nome principal (menu, página inicial, listas) e, quando
--   é diferente, a forma do outro gênero: nome_feminino ("Advogada") ou
--   nome_masculino ("Costureiro", na categoria "Costureira"). Iguais para os
--   dois (Dentista, Eletricista, Babá) ficam sem nenhuma.
-- - O anunciante escolhe como a profissão aparece no anúncio dele
--   (forma_profissao). É a forma de escrever o anúncio, e não o gênero da
--   pessoa. Sem escolha, aparece o nome principal.
-- - A regra de qual nome mostrar fica em packages/domain (nomeDaCategoriaPara):
--   o banco só entrega as formas e a escolha.

alter table public.categorias
  add column nome_feminino text check (length(nome_feminino) between 2 and 80),
  add column nome_masculino text check (length(nome_masculino) between 2 and 80);

comment on column public.categorias.nome_feminino is 'Forma feminina da profissão, quando diferente do nome principal (ex.: Advogada).';
comment on column public.categorias.nome_masculino is 'Forma masculina da profissão, quando o nome principal está no feminino (ex.: Costureiro).';

alter table public.anunciantes
  add column forma_profissao text check (forma_profissao in ('masculino', 'feminino'));

comment on column public.anunciantes.forma_profissao is 'Como a profissão aparece no anúncio (Advogado ou Advogada). Vazio: o nome principal da categoria.';

-- Nomes com "(a)" passam ao masculino, com a forma feminina ao lado.
update public.categorias cat set nome = v.nome
from public.cidades c, (values
  ('advogados', 'Advogado'),
  ('maquiadores', 'Maquiador'),
  ('podologos', 'Podólogo'),
  ('psicologos', 'Psicólogo'),
  ('fonoaudiologos', 'Fonoaudiólogo')
) as v (slug, nome)
where c.slug = 'rio-das-ostras' and cat.cidade_id = c.id and cat.slug_lista = v.slug;

update public.categorias cat set nome_feminino = v.feminino
from public.cidades c, (values
  ('advogados', 'Advogada'),
  ('maquiadores', 'Maquiadora'),
  ('podologos', 'Podóloga'),
  ('psicologos', 'Psicóloga'),
  ('fonoaudiologos', 'Fonoaudióloga'),
  ('adestradores', 'Adestradora'),
  ('bombeiros-hidraulicos', 'Bombeira hidráulica'),
  ('borracheiros', 'Borracheira'),
  ('caseiros', 'Caseira'),
  ('chaveiros', 'Chaveira'),
  ('corretores-de-imoveis', 'Corretora de imóveis'),
  ('corretores-de-seguros', 'Corretora de seguros'),
  ('cuidadores-de-idosos', 'Cuidadora de idosos'),
  ('fotografos', 'Fotógrafa'),
  ('gesseiros', 'Gesseira'),
  ('jardineiros', 'Jardineira'),
  ('marceneiros', 'Marceneira'),
  ('mecanicos', 'Mecânica'),
  ('montadores-de-moveis', 'Montadora de móveis'),
  ('medicos', 'Médica'),
  ('passeadores-de-caes', 'Passeadora de cães'),
  ('pedreiros', 'Pedreira'),
  ('pintores', 'Pintora'),
  ('piscineiros', 'Piscineira'),
  ('professores-particulares', 'Professora particular'),
  ('sapateiros', 'Sapateira'),
  ('serralheiros', 'Serralheira'),
  ('tecnicos-de-ar-condicionado', 'Técnica de ar-condicionado'),
  ('tecnicos-de-eletrodomesticos', 'Técnica de eletrodomésticos'),
  ('veterinarios', 'Veterinária'),
  ('vidraceiros', 'Vidraceira')
) as v (slug, feminino)
where c.slug = 'rio-das-ostras' and cat.cidade_id = c.id and cat.slug_lista = v.slug;

-- Categorias com o nome principal no feminino continuam assim no menu.
update public.categorias cat set nome_masculino = v.masculino
from public.cidades c, (values
  ('confeiteiras', 'Confeiteiro'),
  ('costureiras', 'Costureiro'),
  ('passadeiras', 'Passadeiro')
) as v (slug, masculino)
where c.slug = 'rio-das-ostras' and cat.cidade_id = c.id and cat.slug_lista = v.slug;

-- Anunciantes já no ar que aparecem no feminino (decisão R2 de 26/11/2026).
update public.anunciantes a set forma_profissao = 'feminino'
from public.cidades c, public.categorias cat
where c.slug = 'rio-das-ostras' and a.cidade_id = c.id and cat.id = a.categoria_principal_id
  and (
    (cat.slug_lista = 'advogados' and a.nome ilike 'AP Advocacia%')
    or (cat.slug_lista = 'corretores-de-imoveis' and a.nome = 'Eloisa Chagas')
  );

-- Catálogo público com as formas da profissão. Mesma função da migration
-- 20261027140000_catalogo_carteira.sql, com os dois campos novos.
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
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', c.slug_lista,
        'nome', c.nome,
        'nomeFeminino', c.nome_feminino,
        'nomeMasculino', c.nome_masculino,
        'nomePlural', c.nome_plural,
        'slugLista', c.slug_lista,
        'grupo', g.nome,
        'sinonimos', coalesce((select jsonb_agg(s.termo order by s.termo) from public.sinonimos_categoria s where s.categoria_id = c.id), '[]'::jsonb),
        'icone', c.icone,
        'cor', c.cor,
        'exigeRegistroConselho', c.exige_registro_conselho,
        'atalho', c.ordem_atalho is not null
      )) order by g.ordem, interno.normalizar(c.nome))
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

-- Anunciante público com a forma da profissão. Mesma função da migration
-- 20261119204123_foto_de_capa.sql, com o campo novo.
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
    'formaProfissao', a.forma_profissao,
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
