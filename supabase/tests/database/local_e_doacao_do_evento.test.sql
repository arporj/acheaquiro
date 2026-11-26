-- Local do evento e entrada por doação (migration 20261126184534): a doação
-- vem junto com a entrada "doacao", e o perfil do local some quando o comércio
-- é apagado. Tudo dentro de uma transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000d5', 'adm.doacao@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000d5';

insert into anunciantes (id, cidade_id, tipo, slug, nome, status, origem, categoria_principal_id, plano_id)
select 'eeeeeeee-0000-0000-0000-0000000000d5', c.id, 'comercio', 'bar-do-local-teste', 'Bar do Local Teste', 'publicado', 'receita',
  (select id from categorias where cidade_id = c.id and ativa and tipo <> 'profissional' limit 1),
  (select id from planos where codigo = 'com-nivel1')
from cidades c where c.slug = 'rio-das-ostras';

create temporary table base as
select c.id as cidade_id, (select b.id from bairros b where b.cidade_id = c.id limit 1) as bairro_id
from cidades c where c.slug = 'rio-das-ostras';
grant all on base to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000d5","role":"authenticated","aal":"aal2"}', true);

select lives_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim, entrada, doacao, local_anunciante_id)
  select cidade_id, 'rock-solidario-teste', 'Rock Solidário Teste', 'avulso', 'Bar do Local', bairro_id, interno.hoje() + 10, interno.hoje() + 10,
    'doacao', '1 kg de alimento não perecível', 'eeeeeeee-0000-0000-0000-0000000000d5' from base $$,
  'evento avulso com entrada por doação e o perfil do local');
select is((select local_anunciante_id from eventos where slug = 'rock-solidario-teste'), 'eeeeeeee-0000-0000-0000-0000000000d5'::uuid,
  'o perfil do local fica gravado');
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim, entrada)
  select cidade_id, 'doacao-sem-texto-teste', 'Doação sem texto', 'avulso', 'Praça', bairro_id, interno.hoje() + 10, interno.hoje() + 10, 'doacao' from base $$,
  '23514', null, 'a entrada por doação exige o que levar');
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim, entrada, doacao)
  select cidade_id, 'texto-sem-doacao-teste', 'Texto sem doação', 'avulso', 'Praça', bairro_id, interno.hoje() + 10, interno.hoje() + 10,
    'gratuita', '1 kg de ração' from base $$,
  '23514', null, 'o que levar só vale na entrada por doação');
select throws_ok($$ insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim, entrada, doacao)
  select cidade_id, 'doacao-curta-teste', 'Doação curta', 'avulso', 'Praça', bairro_id, interno.hoje() + 10, interno.hoje() + 10, 'doacao', '  ' from base $$,
  '23514', null, 'o que levar não pode ficar em branco');

reset role;
delete from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000d5';
select is((select local_anunciante_id from eventos where slug = 'rock-solidario-teste'), null::uuid, 'apagado o comércio, o evento fica sem o perfil do local');

select * from finish();
rollback;
