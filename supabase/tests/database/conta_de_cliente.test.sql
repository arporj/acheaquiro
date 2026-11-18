-- Conta de cliente na Agenda (migration 20261118012727): o cliente cadastra e
-- publica os próprios eventos, o representante edita os rascunhos dele até o
-- cliente publicar, "Para conferir" e o organizador pelo e-mail. Tudo dentro de
-- uma transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

-- A = administrador; C1 = cliente sem anúncio, com o aceite; C2 = cliente sem o aceite;
-- D = dono de um comércio, com o aceite; R = representante com as duas etapas e o termo.
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'adm.cliente@teste.invalid', 'authenticated', 'authenticated'),
  ('c1c1c1c1-0000-0000-0000-0000000000c1', 'cliente1.agenda@teste.invalid', 'authenticated', 'authenticated'),
  ('c2c2c2c2-0000-0000-0000-0000000000c1', 'cliente2.agenda@teste.invalid', 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-0000000000c1', 'dono.bar@teste.invalid', 'authenticated', 'authenticated'),
  ('11111111-0000-0000-0000-0000000000c1', 'rep.agenda@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000c1';
update perfis_usuario set papel = 'representante' where usuario_id = '11111111-0000-0000-0000-0000000000c1';
insert into representantes (usuario_id, cidade_id, codigo)
select '11111111-0000-0000-0000-0000000000c1', id, 'repagendac' from cidades where slug = 'rio-das-ostras';
insert into aceites_documentos (usuario_id, documento, versao)
select u.id::uuid, d.documento, d.versao
from (values ('c1c1c1c1-0000-0000-0000-0000000000c1'), ('dddddddd-0000-0000-0000-0000000000c1')) as u (id)
cross join lateral (
  select distinct on (documento) documento, versao from documentos_legais
  where documento in ('termos', 'privacidade') and vigente_desde <= interno.hoje()
  order by documento, vigente_desde desc
) d;
insert into aceites_documentos (usuario_id, documento, versao)
select '11111111-0000-0000-0000-0000000000c1', 'confidencialidade', versao
from documentos_legais where documento = 'confidencialidade' order by vigente_desde desc limit 1;

insert into anunciantes (id, cidade_id, tipo, slug, nome, status, origem, categoria_principal_id, plano_id, usuario_id)
select 'eeeeeeee-0000-0000-0000-0000000000c1', c.id, 'comercio', 'bar-do-dono-teste', 'Bar do Dono Teste', 'publicado', 'receita',
  (select id from categorias where cidade_id = c.id and ativa and tipo <> 'profissional' limit 1),
  (select id from planos where codigo = 'com-nivel4'), 'dddddddd-0000-0000-0000-0000000000c1'
from cidades c where c.slug = 'rio-das-ostras';

create temporary table base as
select c.id as cidade_id, (select b.id from bairros b where b.cidade_id = c.id limit 1) as bairro_id
from cidades c where c.slug = 'rio-das-ostras';
create temporary table ids (nome text primary key, id uuid);
grant all on base, ids to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Cliente sem anúncio (C1)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal1"}', true);

select lives_ok($$ insert into eventos (cidade_id, slug, nome, origem, usuario_id, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'festa-do-cliente-teste', 'Festa do Cliente', 'avulso', 'c1c1c1c1-0000-0000-0000-0000000000c1', 'Praça', bairro_id,
    interno.hoje() + 10, interno.hoje() + 11 from base $$, 'o cliente cadastra o evento avulso na conta dele');
insert into ids select 'festa', id from eventos where slug = 'festa-do-cliente-teste';
select is((select criado_por from eventos where id = (select id from ids where nome = 'festa')), 'c1c1c1c1-0000-0000-0000-0000000000c1'::uuid,
  'quem cadastrou fica gravado');
select ok((select conferido_em is null from eventos where id = (select id from ids where nome = 'festa')), 'o evento do cliente não nasce conferido');

select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, usuario_id, local, bairro_id, data_inicio, data_fim, situacao)
  select cidade_id, 'ja-publicado-teste', 'Já publicado', 'avulso', 'c1c1c1c1-0000-0000-0000-0000000000c1', 'Praça', bairro_id,
    interno.hoje() + 10, interno.hoje() + 10, 'publicado' from base $$,
  '42501', null, 'o cliente cria só rascunho');
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, anunciante_id, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'no-bar-dos-outros', 'No bar dos outros', 'comercio', 'eeeeeeee-0000-0000-0000-0000000000c1', 'Bar', bairro_id,
    interno.hoje() + 10, interno.hoje() + 10 from base $$,
  '42501', null, 'o cliente não cadastra evento no comércio de outra pessoa');
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, usuario_id, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'evento-publico-teste', 'Evento público', 'orgao_publico', 'c1c1c1c1-0000-0000-0000-0000000000c1', 'Praça', bairro_id,
    interno.hoje() + 10, interno.hoje() + 10 from base $$,
  'P0001', 'Evento de órgão público só é cadastrado pela equipe.', 'o cliente não cadastra evento de órgão público');
select lives_ok($$ insert into eventos (cidade_id, slug, nome, origem, usuario_id, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'festa-do-cliente-teste', 'Festa do Cliente de novo', 'avulso', 'c1c1c1c1-0000-0000-0000-0000000000c1', 'Praça', bairro_id,
    interno.hoje() + 12, interno.hoje() + 12 from base $$, 'endereço repetido não impede o cadastro');
select is((select slug from eventos where nome = 'Festa do Cliente de novo'), 'festa-do-cliente-teste-2', 'o banco escolhe um endereço livre');

select lives_ok($$ insert into programacao_evento (evento_id, dia, inicio, titulo) select id, interno.hoje() + 10, '20:00', 'Show de abertura' from ids where nome = 'festa' $$,
  'o cliente cadastra a programação do evento dele');
update eventos set situacao = 'publicado' where id = (select id from ids where nome = 'festa');
select ok((select publicado_em is not null from eventos where id = (select id from ids where nome = 'festa')), 'a primeira publicação fica gravada');
select throws_ok($$ update eventos set usuario_id = 'c2c2c2c2-0000-0000-0000-0000000000c1' where id = (select id from ids where nome = 'festa') $$,
  'P0001', 'Só a administração troca o organizador do evento.', 'o cliente não passa o evento para outra conta');
select throws_ok($$ update eventos set cortesia_motivo = 'Quero de graça, por favor' where id = (select id from ids where nome = 'festa') $$,
  'P0001', 'Só a administração dá cortesia.', 'o cliente não dá cortesia');
update eventos set conferido_em = now(), slug = 'outro-endereco' where id = (select id from ids where nome = 'festa');
select is((select slug from eventos where id = (select id from ids where nome = 'festa')), 'festa-do-cliente-teste', 'o endereço não muda pela tela');
select ok((select conferido_em is null from eventos where id = (select id from ids where nome = 'festa')), 'o cliente não marca o próprio evento como conferido');
select is_empty($$ delete from eventos where id = (select id from ids where nome = 'festa') returning id $$, 'o cliente não apaga evento (ele cancela)');

-- ---------------------------------------------------------------------------
-- Cliente sem o aceite (C2) e dono de comércio (D)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c2c2c2c2-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, usuario_id, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'sem-aceite-teste', 'Sem aceite', 'avulso', 'c2c2c2c2-0000-0000-0000-0000000000c1', 'Praça', bairro_id,
    interno.hoje() + 10, interno.hoje() + 10 from base $$,
  '42501', null, 'sem o aceite dos Termos em vigor, o cliente não cadastra');

select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal1"}', true);
select lives_ok($$ insert into eventos (cidade_id, slug, nome, origem, anunciante_id, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'noite-do-dono-teste', 'Noite do Dono', 'comercio', 'eeeeeeee-0000-0000-0000-0000000000c1', 'Bar do Dono', bairro_id,
    interno.hoje() + 10, interno.hoje() + 10 from base $$, 'o dono do comércio cadastra evento no comércio dele');
select is((select count(*) from eventos where slug like 'festa-do-cliente-teste%'), 0::bigint, 'o dono do comércio não vê os rascunhos dos outros');
select is_empty($$ update eventos set nome = 'Mudado pelo vizinho' where slug = 'festa-do-cliente-teste' returning id $$,
  'o dono do comércio não altera evento dos outros');

-- ---------------------------------------------------------------------------
-- Administração: "Para conferir"
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2"}', true);
update eventos set conferido_em = now() where id = (select id from ids where nome = 'festa');
select is((select conferido_por from eventos where id = (select id from ids where nome = 'festa')), 'aaaaaaaa-0000-0000-0000-0000000000c1'::uuid,
  'quem conferiu fica gravado pelo banco');

select set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal1"}', true);
insert into barracas_evento (evento_id, nome, vende) select id, 'Barraca do Teste', 'Pastel' from ids where nome = 'festa';
reset role;
select ok((select conferido_em is null from eventos where id = (select id from ids where nome = 'festa')),
  'barraca nova num evento publicado volta para "Para conferir"');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Representante (R)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim)
  select cidade_id, 'feira-do-rep-teste', 'Feira do Representante', 'avulso', 'Praça', bairro_id, interno.hoje() + 20, interno.hoje() + 21 from base $$,
  'o representante cadastra o rascunho de um evento avulso');
insert into ids select 'feira', id from eventos where slug = 'feira-do-rep-teste';
select is((select representante_id from eventos where id = (select id from ids where nome = 'feira')),
  (select id from representantes where usuario_id = '11111111-0000-0000-0000-0000000000c1'), 'o representante que atendeu fica gravado');
select throws_ok($$ update eventos set situacao = 'publicado' where id = (select id from ids where nome = 'feira') $$,
  '42501', null, 'o representante não publica: quem publica é o cliente');
select lives_ok($$ insert into programacao_evento (evento_id, dia, inicio, titulo) select id, interno.hoje() + 20, '09:00', 'Abertura da feira' from ids where nome = 'feira' $$,
  'o representante monta a programação do rascunho');
select is(ligar_organizador_evento((select id from ids where nome = 'feira'), 'ninguem.ainda@teste.invalid'), 'sem_conta',
  'e-mail sem conta: o servidor convida');
select throws_ok($$ select ligar_organizador_evento((select id from ids where nome = 'feira'), 'adm.cliente@teste.invalid') $$,
  'P0001', 'Este e-mail é de uma conta da equipe ou desativada. Use outro e-mail.', 'conta da equipe não organiza evento');
select is(ligar_organizador_evento((select id from ids where nome = 'feira'), ' Cliente1.Agenda@teste.invalid '), 'ligado',
  'o representante liga o rascunho à conta do cliente pelo e-mail');
select is(situacao_do_evento((select id from ids where nome = 'feira')) ->> 'organizador', 'cliente1.agenda@teste.invalid',
  'o representante vê o e-mail do organizador');
select throws_ok($$ select ligar_organizador_evento((select id from ids where nome = 'festa'), 'cliente2.agenda@teste.invalid') $$,
  'P0001', 'Só a administração ou o representante que cadastrou o rascunho escolhem o organizador.', 'o representante não mexe no evento dos outros');

select set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal1"}', true);
select is(situacao_do_evento((select id from ids where nome = 'feira')) ->> 'organizador', null, 'o cliente não recebe o e-mail pela situação');
update eventos set situacao = 'publicado' where id = (select id from ids where nome = 'feira');

select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2"}', true);
select is_empty($$ update eventos set nome = 'Mudado depois' where id = (select id from ids where nome = 'feira') returning id $$,
  'depois que o cliente publica, o representante não altera mais');
select throws_ok($$ insert into programacao_evento (evento_id, dia, inicio, titulo) select id, interno.hoje() + 21, '10:00', 'Depois' from ids where nome = 'feira' $$,
  '42501', null, 'nem a programação');
select is((select count(*) from eventos where id = (select id from ids where nome = 'feira')), 1::bigint, 'o representante continua vendo o evento que cadastrou');

select * from finish();
rollback;
