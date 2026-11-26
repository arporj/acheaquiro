-- Artista sem cadastro na programação (migration 20261126175109): o nome sem
-- cadastro do cliente gera o pedido em "Artistas a cadastrar", o da
-- administração não, e só a administração resolve o pedido. Tudo dentro de uma
-- transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

-- A = administrador; C = cliente sem anúncio, com o aceite.
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a5', 'adm.artista@teste.invalid', 'authenticated', 'authenticated'),
  ('c1c1c1c1-0000-0000-0000-0000000000a5', 'cliente.artista@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000a5';
insert into aceites_documentos (usuario_id, documento, versao)
select 'c1c1c1c1-0000-0000-0000-0000000000a5', d.documento, d.versao
from (
  select distinct on (documento) documento, versao from documentos_legais
  where documento in ('termos', 'privacidade') and vigente_desde <= interno.hoje()
  order by documento, vigente_desde desc
) d;

insert into artistas (id, cidade_id, slug, nome)
select 'abababab-0000-0000-0000-0000000000a5', id, 'banda-cadastrada-teste', 'Banda Cadastrada Teste' from cidades where slug = 'rio-das-ostras';

create temporary table base as
select c.id as cidade_id, (select b.id from bairros b where b.cidade_id = c.id limit 1) as bairro_id
from cidades c where c.slug = 'rio-das-ostras';
create temporary table ids (nome text primary key, id uuid);
grant all on base, ids to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Cliente (C)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-0000000000a5","role":"authenticated","aal":"aal1"}', true);

insert into eventos (cidade_id, slug, nome, origem, usuario_id, local, bairro_id, data_inicio, data_fim)
select cidade_id, 'festival-artista-teste', 'Festival Artista Teste', 'avulso', 'c1c1c1c1-0000-0000-0000-0000000000a5', 'Praça', bairro_id,
  interno.hoje() + 10, interno.hoje() + 11 from base;
insert into ids select 'evento', id from eventos where slug = 'festival-artista-teste';

select lives_ok($$ insert into programacao_evento (evento_id, dia, inicio, artista_nome)
  select id, interno.hoje() + 10, '20:00', '  Banda   Nova  ' from ids where nome = 'evento' $$,
  'o cliente usa só o nome do artista');
insert into ids select 'nova', id from programacao_evento where evento_id = (select id from ids where nome = 'evento') and inicio = '20:00';
select is((select artista_nome from programacao_evento where id = (select id from ids where nome = 'nova')), 'Banda Nova', 'o banco arruma os espaços do nome');
select ok((select cadastro_pedido from programacao_evento where id = (select id from ids where nome = 'nova')), 'o nome do cliente entra em "Artistas a cadastrar"');

insert into programacao_evento (evento_id, dia, inicio, artista_nome, titulo)
select id, interno.hoje() + 11, '18:00', 'Banda Nova', 'acústico' from ids where nome = 'evento';
insert into ids select 'nova2', id from programacao_evento where evento_id = (select id from ids where nome = 'evento') and inicio = '18:00';

update programacao_evento set cadastro_pedido = false where id = (select id from ids where nome = 'nova');
select ok((select cadastro_pedido from programacao_evento where id = (select id from ids where nome = 'nova')), 'o cliente não tira o pedido');

select throws_ok($$ insert into programacao_evento (evento_id, dia, inicio, artista_id, artista_nome)
  select id, interno.hoje() + 10, '21:00', 'abababab-0000-0000-0000-0000000000a5', 'Outro nome' from ids where nome = 'evento' $$,
  '23514', null, 'artista cadastrado e nome sem cadastro não vão juntos');
select throws_ok($$ insert into programacao_evento (evento_id, dia, inicio, artista_nome)
  select id, interno.hoje() + 10, '21:00', '   ' from ids where nome = 'evento' $$,
  '23514', null, 'nome em branco não vale como artista');
select throws_ok($$ select resolver_artista_a_cadastrar(array[(select id from ids where nome = 'nova')], null) $$,
  '42501', null, 'o cliente não resolve o pedido');

-- ---------------------------------------------------------------------------
-- Administrador (A)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated","aal":"aal2"}', true);

insert into programacao_evento (evento_id, dia, inicio, artista_nome, cadastro_pedido)
select id, interno.hoje() + 10, '22:00', 'Banda de Fora', true from ids where nome = 'evento';
select ok((select not cadastro_pedido from programacao_evento where artista_nome = 'Banda de Fora'), 'o nome usado pela administração não gera pedido');

select throws_ok($$ select resolver_artista_a_cadastrar(array[(select id from ids where nome = 'nova')], 'abababab-0000-0000-0000-00000000ffff') $$,
  'P0001', 'Artista não encontrado.', 'o artista precisa existir');

select is(resolver_artista_a_cadastrar(array[(select id from ids where nome = 'nova'), (select id from ids where nome = 'nova2')], 'abababab-0000-0000-0000-0000000000a5'),
  2, 'a administração resolve os horários do nome de uma vez');
select is((select artista_id from programacao_evento where id = (select id from ids where nome = 'nova2')), 'abababab-0000-0000-0000-0000000000a5'::uuid,
  'o artista cadastrado entra no lugar do nome');
select ok((select artista_nome is null and not cadastro_pedido and titulo = 'acústico' from programacao_evento where id = (select id from ids where nome = 'nova2')),
  'o nome e o pedido saem, e a observação fica');

-- Outro nome do cliente, para testar "deixar só o nome".
select set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-0000000000a5","role":"authenticated","aal":"aal1"}', true);
insert into programacao_evento (evento_id, dia, inicio, artista_nome)
select id, interno.hoje() + 11, '12:00', 'Banda de Passagem' from ids where nome = 'evento';
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated","aal":"aal2"}', true);
select is(resolver_artista_a_cadastrar(array(select id from programacao_evento where artista_nome = 'Banda de Passagem'), null),
  1, 'a administração deixa só o nome');
select ok((select artista_nome = 'Banda de Passagem' and not cadastro_pedido from programacao_evento where inicio = '12:00'
  and evento_id = (select id from ids where nome = 'evento')), 'o nome continua e o pedido sai da lista');

select * from finish();
rollback;
