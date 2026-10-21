-- Equipe e SupraAdmin (migration 20261022140000).
-- Tudo dentro de uma transação desfeita no fim: não deixa dados no banco.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- Executa a alteração com o papel atual (o RLS vale) e devolve quantas linhas mudaram.
create function public.teste_linhas_alteradas(comando text) returns integer
language plpgsql
as $f$
declare
  linhas integer;
begin
  execute comando;
  get diagnostics linhas = row_count;
  return linhas;
end
$f$;
grant execute on function public.teste_linhas_alteradas(text) to anon, authenticated;

select plan(15);

-- S = SupraAdmin de teste, A = administrador comum, R = representante.
insert into auth.users (id, email, aud, role) values
  ('5aaaaaaa-0000-0000-0000-000000000001', 'supra@teste.invalid', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'admin@teste.invalid', 'authenticated', 'authenticated'),
  ('22222222-0000-0000-0000-000000000003', 'representante@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador' where usuario_id in ('5aaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002');
update perfis_usuario set papel = 'representante' where usuario_id = '22222222-0000-0000-0000-000000000003';
-- A marcação do banco vai para o SupraAdmin de teste (desfeito no fim).
select set_config('app.transferencia_supra_admin', 'sim', true);
update perfis_usuario set supra_admin = false where supra_admin;
update perfis_usuario set supra_admin = true where usuario_id = '5aaaaaaa-0000-0000-0000-000000000001';
select set_config('app.transferencia_supra_admin', '', true);

select throws_ok($$ update perfis_usuario set supra_admin = true where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'P0001', 'Só o SupraAdmin transfere a marcação de SupraAdmin.', 'nem o banco marca um segundo SupraAdmin por fora da transferência');
select throws_ok($$ delete from auth.users where id = '5aaaaaaa-0000-0000-0000-000000000001' $$,
  'P0001', 'A conta do SupraAdmin não pode ser apagada. Transfira a marcação antes.', 'a conta do SupraAdmin não é apagada');

-- Administrador comum
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok($$ update perfis_usuario set papel = 'anunciante' where usuario_id = '5aaaaaaa-0000-0000-0000-000000000001' $$,
  'P0001', 'O SupraAdmin não pode ser rebaixado nem desativado.', 'administrador não rebaixa o SupraAdmin');
select throws_ok($$ update perfis_usuario set ativo = false where usuario_id = '5aaaaaaa-0000-0000-0000-000000000001' $$,
  'P0001', 'O SupraAdmin não pode ser rebaixado nem desativado.', 'administrador não desativa o SupraAdmin');
select throws_ok($$ select transferir_supra_admin('aaaaaaaa-0000-0000-0000-000000000002') $$,
  'P0001', 'Só o SupraAdmin transfere a marcação de SupraAdmin.', 'administrador comum não se faz SupraAdmin');
select throws_ok($$ update perfis_usuario set papel = 'representante' where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'P0001', 'Ninguém muda o próprio papel nem desativa a própria conta.', 'ninguém muda o próprio papel');
select is(teste_linhas_alteradas($c$update perfis_usuario set ativo = false where usuario_id = '22222222-0000-0000-0000-000000000003'$c$), 1,
  'administrador desativa um representante');
select ok((select count(*) from listar_equipe() where email = 'supra@teste.invalid') = 1, 'administrador vê a equipe com os e-mails');
reset role;

-- Representante desativado perde o papel na hora
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(interno.tem_papel('representante'), false, 'conta desativada perde o papel na hora');
select throws_ok($$ select * from listar_equipe() $$, 'P0001', 'Sem permissão.', 'quem não é administrador não lista a equipe');
reset role;

-- SupraAdmin
select set_config('request.jwt.claims', '{"sub":"5aaaaaaa-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok($$ select transferir_supra_admin('22222222-0000-0000-0000-000000000003') $$,
  'P0001', 'O novo SupraAdmin precisa ser um administrador ativo.', 'SupraAdmin não transfere para quem não é administrador');
select lives_ok($$ select transferir_supra_admin('aaaaaaaa-0000-0000-0000-000000000002') $$, 'SupraAdmin transfere para outro administrador');
reset role;

select is((select array_agg(usuario_id order by usuario_id) from perfis_usuario where supra_admin),
  array['aaaaaaaa-0000-0000-0000-000000000002'::uuid], 'depois da transferência, há um só SupraAdmin: o novo');
select is((select papel::text from perfis_usuario where usuario_id = '5aaaaaaa-0000-0000-0000-000000000001'), 'administrador',
  'o antigo SupraAdmin continua administrador');
select is((select count(*)::int from auditoria where tabela = 'perfis_usuario' and ator_id = '5aaaaaaa-0000-0000-0000-000000000001'
  and depois ->> 'supra_admin' = 'true'), 1, 'a transferência fica registrada em nome de quem transferiu');

select * from finish();
rollback;
