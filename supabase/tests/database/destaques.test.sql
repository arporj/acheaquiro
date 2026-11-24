-- Destaques da página inicial (migration 20261124134213): evento só publicado e
-- liberado (J3), comércio citado com autorização (J4), link com https,
-- leitura pública só do que está no ar e cliques contados uma vez a cada
-- 30 minutos por visitante (J5). Tudo dentro de uma transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-00000000de01', 'adm.destaque@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador', nome = 'Adm Destaques' where usuario_id = 'aaaaaaaa-0000-0000-0000-00000000de01';

-- Evento avulso publicado, ainda sem pagamento nem cortesia.
insert into eventos (id, cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim, situacao)
select 'eeeeeeee-0000-0000-0000-00000000de01', c.id, 'festa-teste-destaque', 'Festa Teste Destaque', 'avulso', 'Praça Teste', b.id,
       interno.hoje() + 3, interno.hoje() + 4, 'publicado'
from cidades c join bairros b on b.cidade_id = c.id where c.slug = 'rio-das-ostras' limit 1;

create function pg_temp.cidade() returns uuid language sql as $$ select id from public.cidades where slug = 'rio-das-ostras' $$;

-- J3: evento fora da Agenda não vira destaque.
select throws_ok($$ insert into destaques (cidade_id, tipo, evento_id, titulo, inicio, fim)
  values (pg_temp.cidade(), 'evento', 'eeeeeeee-0000-0000-0000-00000000de01', 'Festa na praça', interno.hoje(), interno.hoje() + 4) $$,
  'P0001', 'O evento precisa estar publicado e liberado na Agenda (pago ou como cortesia).', 'evento sem pagamento nem cortesia não vira destaque');
-- Só a administração dá cortesia (o banco confere quem está logado).
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000de01","role":"authenticated","aal":"aal2"}', true);
update eventos set cortesia_motivo = 'Teste do destaque da página inicial' where id = 'eeeeeeee-0000-0000-0000-00000000de01';
select set_config('request.jwt.claims', '', true);
select lives_ok($$ insert into destaques (id, cidade_id, tipo, evento_id, titulo, inicio, fim)
  values ('dddddddd-0000-0000-0000-00000000de01', pg_temp.cidade(), 'evento', 'eeeeeeee-0000-0000-0000-00000000de01', 'Festa na praça', interno.hoje(), interno.hoje() + 4) $$,
  'evento liberado (cortesia) vira destaque');

-- Campanha: link e imagem obrigatórios, link só com https, comércio só com autorização.
select throws_ok($$ insert into destaques (cidade_id, tipo, titulo, inicio, fim)
  values (pg_temp.cidade(), 'campanha', 'Campanha sem link', interno.hoje(), interno.hoje()) $$,
  '23514', null, 'campanha exige link e imagem');
select throws_ok($$ insert into destaques (cidade_id, tipo, titulo, link, imagem_chave, imagem_largura, imagem_altura, inicio, fim)
  values (pg_temp.cidade(), 'campanha', 'Link sem https', 'http://exemplo.com.br', 'destaques/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002', 1600, 1200, interno.hoje(), interno.hoje()) $$,
  '23514', null, 'link externo só com https');
select throws_ok($$ insert into destaques (cidade_id, tipo, titulo, link, imagem_chave, imagem_largura, imagem_altura, comercio, inicio, fim)
  values (pg_temp.cidade(), 'campanha', 'Arrecadação', 'https://exemplo.com.br', 'destaques/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000003', 1600, 1200, 'Comércio Teste', interno.hoje(), interno.hoje()) $$,
  '23514', null, 'comércio citado exige a autorização');
select throws_ok($$ insert into destaques (cidade_id, tipo, titulo, link, imagem_chave, imagem_largura, imagem_altura, inicio, fim)
  values (pg_temp.cidade(), 'campanha', 'Datas trocadas', '/agenda', 'destaques/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000004', 1600, 1200, interno.hoje(), interno.hoje() - 1) $$,
  '23514', null, 'o fim não pode vir antes do início');

insert into destaques (id, cidade_id, tipo, titulo, link, imagem_chave, imagem_largura, imagem_altura, comercio, autorizado_por, autorizado_em, inicio, fim, ligado)
values
  ('dddddddd-0000-0000-0000-00000000de02', pg_temp.cidade(), 'campanha', 'Arrecadação de ração', 'https://exemplo.com.br/campanha',
   'destaques/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000005', 1600, 1200, 'Comércio Teste', 'Dono Teste', interno.hoje(), interno.hoje() - 1, interno.hoje() + 10, true),
  ('dddddddd-0000-0000-0000-00000000de03', pg_temp.cidade(), 'ache_aqui', 'Ainda vai começar', '/anuncie',
   'destaques/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000006', 1600, 1200, null, null, null, interno.hoje() + 2, interno.hoje() + 10, true),
  ('dddddddd-0000-0000-0000-00000000de04', pg_temp.cidade(), 'ache_aqui', 'Desligado', '/anuncie',
   'destaques/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000007', 1600, 1200, null, null, null, interno.hoje(), interno.hoje() + 10, false);
select ok(exists (select 1 from auditoria where tabela = 'destaques' and registro_id = 'dddddddd-0000-0000-0000-00000000de02'), 'o cadastro fica na auditoria');

-- Visitante: lê só os que estão no ar, não grava e não lê os cliques.
set local role anon;
select is((select count(*) from destaques where id::text like 'dddddddd-0000-0000-0000-00000000de0%'), 2::bigint, 'o visitante vê só os destaques no ar');
select throws_ok($$ insert into destaques (cidade_id, tipo, titulo, link, imagem_chave, imagem_largura, imagem_altura, inicio, fim)
  values (pg_temp.cidade(), 'ache_aqui', 'Invasor', '/anuncie', 'destaques/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000008', 1600, 1200, interno.hoje(), interno.hoje()) $$,
  '42501', null, 'o visitante não cadastra destaque');

-- J5: o clique leva ao destino e conta uma vez a cada 30 minutos por visitante.
select is(registrar_clique_destaque('dddddddd-0000-0000-0000-00000000de01', 'abcdef0123456789'), '/agenda/festa-teste-destaque', 'o destaque de evento leva à página do evento');
select is(registrar_clique_destaque('dddddddd-0000-0000-0000-00000000de01', 'abcdef0123456789'), '/agenda/festa-teste-destaque', 'o clique repetido também leva ao destino');
select is(registrar_clique_destaque('dddddddd-0000-0000-0000-00000000de02', 'abcdef0123456789'), 'https://exemplo.com.br/campanha', 'a campanha leva ao link dela');
select is(registrar_clique_destaque('dddddddd-0000-0000-0000-00000000de03', 'abcdef0123456789'), null::text, 'destaque fora do ar não leva a lugar nenhum');
select throws_ok($$ select registrar_clique_destaque('dddddddd-0000-0000-0000-00000000de01', 'nao-e-hash') $$, 'P0001', null, 'recusa visitante inválido');
select is((select count(*) from cliques_destaque), 0::bigint, 'o visitante não lê os cliques');
reset role;

select is((select cliques from cliques_destaque where destaque_id = 'dddddddd-0000-0000-0000-00000000de01'), 1, 'o clique repetido em 30 minutos conta uma vez');
select is(registrar_clique_destaque('dddddddd-0000-0000-0000-00000000de01', '0123456789abcdef'), '/agenda/festa-teste-destaque', 'outro visitante também chega ao destino');
select is((select cliques from cliques_destaque where destaque_id = 'dddddddd-0000-0000-0000-00000000de01'), 2, 'outro visitante conta mais um clique');

-- O evento que sai da Agenda tira o destaque do site.
update eventos set situacao = 'cancelado' where id = 'eeeeeeee-0000-0000-0000-00000000de01';
set local role anon;
select is((select count(*) from destaques where id::text like 'dddddddd-0000-0000-0000-00000000de0%'), 1::bigint, 'o destaque some quando o evento sai da Agenda');
reset role;

-- O administrador vê todos, também os desligados e os programados.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000de01","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from destaques where id::text like 'dddddddd-0000-0000-0000-00000000de0%'), 4::bigint, 'o administrador vê todos os destaques');
reset role;

select * from finish();
rollback;
