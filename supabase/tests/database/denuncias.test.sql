-- Denúncias (migration 20261112120000): entram só pela função do servidor,
-- avisam os administradores uma vez por perfil por dia, e só a administração
-- lê e trata. Tudo dentro de uma transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

-- A = administrador; U = conta sem papel de equipe.
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'adm.den@teste.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-0000000000d1', 'usuario.den@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador', nome = 'Adm Denúncias' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000d1';

-- Um perfil no ar e um em rascunho.
insert into anunciantes (id, cidade_id, tipo, slug, nome, status, origem, categoria_principal_id)
select v.id::uuid, c.id, 'comercio', v.slug, v.nome, v.status::status_anunciante, 'receita',
       (select id from categorias where ativa and tipo <> 'profissional' limit 1)
from (values ('dddddddd-0000-0000-0000-0000000000d1', 'comercio-teste-denuncia', 'Comércio Teste Denúncia', 'publicado'),
             ('dddddddd-0000-0000-0000-0000000000d2', 'comercio-teste-denuncia-rascunho', 'Comércio Rascunho', 'rascunho')) as v (id, slug, nome, status)
cross join (select id from cidades where slug = 'rio-das-ostras') c;

create function pg_temp.avisos() returns bigint language sql as $$
  select count(*) from public.avisos_email where tipo = 'denuncia' and dados ->> 'anuncianteId' = 'dddddddd-0000-0000-0000-0000000000d1'
$$;
create function pg_temp.denuncia() returns uuid language sql as $$
  select id from public.denuncias where anunciante_id = 'dddddddd-0000-0000-0000-0000000000d1' order by criado_em limit 1
$$;

-- O servidor (chave de serviço) registra; o perfil fora do ar não recebe.
select ok(registrar_denuncia('dddddddd-0000-0000-0000-0000000000d1', 'telefone_errado', 'O número é de outra pessoa', 'Telefone errado'), 'o perfil no ar recebe a denúncia');
select is((select count(*) from denuncias where anunciante_id = 'dddddddd-0000-0000-0000-0000000000d1'), 1::bigint, 'a denúncia fica gravada');
select ok(pg_temp.avisos() >= 1, 'a primeira denúncia do dia avisa os administradores');
select ok(exists (select 1 from avisos_email where tipo = 'denuncia' and para = 'adm.den@teste.invalid' and anunciante_id is null and dados ->> 'motivo' = 'Telefone errado'), 'o administrador ativo recebe o aviso com o motivo');
select ok(not exists (select 1 from avisos_email where tipo = 'denuncia' and dados::text like '%outra pessoa%'), 'o texto de quem denunciou não vai no e-mail');

create temporary table avisos_antes as select pg_temp.avisos() as n;
select ok(registrar_denuncia('dddddddd-0000-0000-0000-0000000000d1', 'outro', 'Perfil parece golpe', 'Outro motivo'), 'a segunda denúncia do dia também é gravada');
select is(pg_temp.avisos(), (select n from avisos_antes), 'a segunda denúncia do mesmo perfil no dia não manda outro e-mail');
select ok(not registrar_denuncia('dddddddd-0000-0000-0000-0000000000d2', 'informacao_falsa', '', 'Informação falsa'), 'o perfil fora do ar não recebe denúncia');
select throws_ok($$ select registrar_denuncia('dddddddd-0000-0000-0000-0000000000d1', 'outro', 'curto', 'Outro motivo') $$, '23514', null, 'outro motivo exige descrição');

-- O visitante não chama a função nem lê a tabela.
set local role anon;
select throws_ok($$ select registrar_denuncia('dddddddd-0000-0000-0000-0000000000d1', 'telefone_errado', '', 'Telefone errado') $$, '42501', null, 'o visitante não chama a função direto');
select is((select count(*) from denuncias), 0::bigint, 'o visitante não lê as denúncias');
reset role;

-- Conta sem papel de equipe não lê.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from denuncias), 0::bigint, 'anunciante e representante não leem as denúncias');
reset role;

-- O administrador lê e trata; quem tratou é gravado pelo banco.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from denuncias where anunciante_id = 'dddddddd-0000-0000-0000-0000000000d1'), 2::bigint, 'o administrador lê as denúncias');
select throws_ok($$ insert into denuncias (cidade_id, anunciante_id, motivo) select cidade_id, id, 'outro' from anunciantes where id = 'dddddddd-0000-0000-0000-0000000000d1' $$,
  '42501', null, 'nem o administrador cria denúncia direto');
update denuncias set situacao = 'improcedente', observacao_equipe = 'Telefone conferido' where id = pg_temp.denuncia();
select is((select tratada_por from denuncias where id = pg_temp.denuncia()), 'aaaaaaaa-0000-0000-0000-0000000000d1'::uuid, 'quem tratou fica gravado');
select throws_ok($$ update denuncias set situacao = 'procedente' where id = pg_temp.denuncia() $$, 'P0001', 'Esta denúncia já foi tratada.', 'a denúncia tratada não muda mais');
reset role;

select * from finish();
rollback;
