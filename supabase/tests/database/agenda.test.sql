-- Agenda (migration 20261117173424): datas, programação, cortesia, quem aparece
-- e quem lê. Tudo dentro de uma transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

-- A = administrador; U = conta de cliente (papel anunciante) sem anúncio.
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a9', 'adm.agenda@teste.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-0000000000a9', 'cliente.agenda@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador', nome = 'Adm Agenda' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000a9';

-- E1: comércio no Premium; E2: comércio no Gratuito; E3: artista anunciante (Músicos e bandas).
insert into anunciantes (id, cidade_id, tipo, slug, nome, status, origem, categoria_principal_id, plano_id)
select v.id::uuid, c.id, v.tipo::tipo_anunciante, v.slug, v.nome, 'publicado', 'receita', v.categoria, (select id from planos where codigo = v.plano)
from (select id from cidades where slug = 'rio-das-ostras') c,
lateral (values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'comercio', 'bar-teste-agenda-premium', 'Bar Teste Premium',
   (select id from categorias where cidade_id = c.id and ativa and tipo <> 'profissional' limit 1), 'com-nivel4'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', 'comercio', 'bar-teste-agenda-gratuito', 'Bar Teste Gratuito',
   (select id from categorias where cidade_id = c.id and ativa and tipo <> 'profissional' limit 1), 'com-nivel1'),
  ('eeeeeeee-0000-0000-0000-0000000000e3', 'profissional', 'banda-teste-agenda', 'Banda Teste Agenda',
   (select id from categorias where cidade_id = c.id and slug_lista = 'musicos-e-bandas'), 'prof-nivel1')
) as v (id, tipo, slug, nome, categoria, plano);

-- Catálogo
select is((select tipo::text from categorias where slug_lista = 'musicos-e-bandas'), 'profissional', 'a categoria Músicos e bandas é de autônomo');
select is((select count(*) from estilos_musicais where nome in ('Rock', 'MPB', 'Eletrônica/DJ', 'Jazz/blues')), 4::bigint, 'os estilos iniciais existem');
select is((select array_agg(codigo order by codigo) from planos where inclui_agenda), array['com-nivel4'], 'só o Premium de comércio inclui a Agenda');

-- A administração cadastra.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a9","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

create temporary table ids (nome text primary key, id uuid);
grant all on ids to authenticated;

insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim, situacao)
select c.id, 'festival-teste-agenda', 'Festival Teste', 'avulso', 'Praça Teste', b.id, current_date + 5, current_date + 7, 'publicado'
from cidades c join bairros b on b.cidade_id = c.id where c.slug = 'rio-das-ostras' limit 1;
insert into ids select 'avulso', id from eventos where slug = 'festival-teste-agenda';

select ok(not interno.evento_liberado((select id from ids where nome = 'avulso')), 'o evento avulso sem pagamento nem cortesia não aparece');
update eventos set cortesia_motivo = 'Divulgação da abertura do site' where id = (select id from ids where nome = 'avulso');
select is((select cortesia_por from eventos where id = (select id from ids where nome = 'avulso')), 'aaaaaaaa-0000-0000-0000-0000000000a9'::uuid, 'quem deu a cortesia fica gravado pelo banco');
select ok((select cortesia_em is not null from eventos where id = (select id from ids where nome = 'avulso')), 'o momento da cortesia fica gravado');
select ok(interno.evento_liberado((select id from ids where nome = 'avulso')), 'com a cortesia, o evento avulso aparece');
update eventos set cortesia_por = 'bbbbbbbb-0000-0000-0000-0000000000a9', descricao = 'Nova descrição' where id = (select id from ids where nome = 'avulso');
select is((select cortesia_por from eventos where id = (select id from ids where nome = 'avulso')), 'aaaaaaaa-0000-0000-0000-0000000000a9'::uuid, 'quem deu a cortesia não é trocado pela tela');

select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'longe-demais', 'Longe demais', 'avulso', 'Praça', bairro_id, current_date + 400, current_date + 400 from eventos where slug = 'festival-teste-agenda' $$,
  'P0001', 'A Agenda aceita eventos que começam até 12 meses à frente.', 'recusa evento que começa depois de 12 meses');
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'ja-passou', 'Já passou', 'avulso', 'Praça', bairro_id, current_date - 5, current_date - 3 from eventos where slug = 'festival-teste-agenda' $$,
  'P0001', 'Este evento já terminou.', 'recusa evento que já terminou');
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim, cortesia_motivo)
  select cidade_id, 'cortesia-comercio', 'Cortesia comércio', 'comercio', 'Bar', bairro_id, current_date + 5, current_date + 5, 'Motivo qualquer de teste'
  from eventos where slug = 'festival-teste-agenda' $$,
  '23514', null, 'cortesia só vale para o evento avulso');
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'sem-anunciante', 'Sem anunciante', 'comercio', 'Bar', bairro_id, current_date + 5, current_date + 5 from eventos where slug = 'festival-teste-agenda' $$,
  '23514', null, 'o evento do comércio exige o anunciante');

-- Programação
select lives_ok($$ insert into programacao_evento (evento_id, dia, inicio, titulo) select id, current_date + 6, '08:00', 'Largada' from ids where nome = 'avulso' $$,
  'aceita a programação dentro das datas');
select throws_ok($$ insert into programacao_evento (evento_id, dia, inicio, titulo) select id, current_date + 8, '08:00', 'Depois' from ids where nome = 'avulso' $$,
  'P0001', 'O dia da programação precisa estar entre o primeiro e o último dia do evento.', 'recusa programação fora das datas');
select throws_ok($$ update eventos set data_fim = current_date + 5 where id = (select id from ids where nome = 'avulso') $$,
  'P0001', 'Há programação fora das novas datas. Ajuste ou apague esses horários antes.', 'não encurta o evento deixando programação de fora');
select throws_ok($$ insert into programacao_evento (evento_id, dia, inicio) select id, current_date + 6, '09:00' from ids where nome = 'avulso' $$,
  '23514', null, 'a programação exige o artista ou a atividade');

-- Comércio e artista
insert into eventos (cidade_id, slug, nome, origem, anunciante_id, local, bairro_id, data_inicio, data_fim, situacao)
select e.cidade_id, v.slug, v.nome, v.origem::origem_evento, v.anunciante::uuid, 'Lugar', e.bairro_id, current_date + 5, current_date + 5, 'publicado'
from eventos e,
(values ('noite-premium', 'Noite no Premium', 'comercio', 'eeeeeeee-0000-0000-0000-0000000000e1'),
        ('noite-gratuito', 'Noite no Gratuito', 'comercio', 'eeeeeeee-0000-0000-0000-0000000000e2'),
        ('show-da-banda', 'Show da banda', 'artista', 'eeeeeeee-0000-0000-0000-0000000000e3'),
        ('show-do-bar', 'Show do bar como artista', 'artista', 'eeeeeeee-0000-0000-0000-0000000000e1')) as v (slug, nome, origem, anunciante)
where e.slug = 'festival-teste-agenda';
insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim, situacao)
select cidade_id, 'rascunho-teste-agenda', 'Rascunho', 'orgao_publico', 'Praça', bairro_id, current_date + 5, current_date + 5, 'rascunho'
from eventos where slug = 'festival-teste-agenda';

select ok(interno.evento_liberado((select id from eventos where slug = 'noite-premium')), 'o comércio no Premium tem a Agenda');
select ok(not interno.evento_liberado((select id from eventos where slug = 'noite-gratuito')), 'o comércio no Gratuito, sem o extra, não tem');
select ok(interno.evento_liberado((select id from eventos where slug = 'show-da-banda')), 'o artista anunciante cadastra os shows');
select ok(not interno.evento_liberado((select id from eventos where slug = 'show-do-bar')), 'quem não é de Músicos e bandas não entra como artista');
reset role;

-- O visitante vê só o publicado e liberado.
set local role anon;
select is((select array_agg(slug order by slug) from eventos where slug in ('festival-teste-agenda', 'noite-premium', 'noite-gratuito', 'show-da-banda', 'show-do-bar', 'rascunho-teste-agenda')),
  array['festival-teste-agenda', 'noite-premium', 'show-da-banda'], 'o visitante vê só os eventos publicados e liberados');
select is((select count(*) from programacao_evento where evento_id = (select id from eventos where slug = 'festival-teste-agenda')), 1::bigint, 'o visitante vê a programação do evento visível');
select ok((select count(*) from estilos_musicais) >= 13, 'o visitante lê os estilos');
select throws_ok($$ insert into estilos_musicais (cidade_id, nome) select id, 'Estilo novo' from cidades where slug = 'rio-das-ostras' $$,
  '42501', null, 'o visitante não cria estilo');
reset role;

-- A conta de cliente lê como o visitante e, por enquanto, não cadastra.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000a9","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from eventos where slug in ('festival-teste-agenda', 'noite-gratuito', 'rascunho-teste-agenda')), 1::bigint, 'o cliente vê só o que o visitante vê');
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'do-cliente', 'Do cliente', 'avulso', 'Praça', bairro_id, current_date + 5, current_date + 5 from eventos where slug = 'festival-teste-agenda' $$,
  '42501', null, 'o cliente ainda não cadastra evento');
select is((select count(*) from artistas where slug = 'qualquer'), 0::bigint, 'o cliente lê os artistas sem erro');
reset role;

-- Órgão público só pela equipe (trava do banco, além do RLS).
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'orgao-sem-equipe', 'Órgão', 'orgao_publico', 'Praça', bairro_id, current_date + 5, current_date + 5 from eventos where slug = 'festival-teste-agenda' $$,
  'P0001', 'Evento de órgão público só é cadastrado pela equipe.', 'órgão público só pela equipe');

select * from finish();
rollback;
