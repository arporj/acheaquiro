-- Cadastro assistido (migration 20261022150000).
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

select plan(11);

-- R = representante; R2 = outro representante; N = conta convidada (sem senha); C = conta já confirmada; A = administrador.
insert into auth.users (id, email, aud, role, invited_at, email_confirmed_at) values
  ('22222222-0000-0000-0000-000000000001', 'rep@teste.invalid', 'authenticated', 'authenticated', null, now()),
  ('22222222-0000-0000-0000-000000000002', 'rep2@teste.invalid', 'authenticated', 'authenticated', null, now()),
  ('11111111-0000-0000-0000-000000000003', 'novo@teste.invalid', 'authenticated', 'authenticated', now(), null),
  ('11111111-0000-0000-0000-000000000004', 'confirmado@teste.invalid', 'authenticated', 'authenticated', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'admin@teste.invalid', 'authenticated', 'authenticated', null, now());
update perfis_usuario set papel = 'representante' where usuario_id in ('22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002');
update perfis_usuario set papel = 'administrador' where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000005';
insert into representantes (id, usuario_id, cidade_id, codigo)
select v.id::uuid, v.usuario::uuid, c.id, v.codigo
from cidades c cross join (values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'teste-rep-1'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'teste-rep-2')
) as v (id, usuario, codigo)
where c.slug = 'rio-das-ostras';
insert into anunciantes (id, cidade_id, tipo, slug, nome, representante_id, status, categoria_principal_id, email_convite, plano_id)
select v.id::uuid, c.id, 'profissional', v.slug, 'Teste Assistido', 'bbbbbbbb-0000-0000-0000-000000000001', 'rascunho', cat.id, v.email,
  (select p.id from planos p where p.cidade_id = c.id and p.codigo = 'prof-nivel1')
from cidades c join categorias cat on cat.cidade_id = c.id and cat.slug_lista = 'eletricistas'
cross join (values
  ('a1000000-0000-0000-0000-000000000001', 'teste-assistido-1', 'novo@teste.invalid'),
  ('a2000000-0000-0000-0000-000000000002', 'teste-assistido-2', 'confirmado@teste.invalid')
) as v (id, slug, email)
where c.slug = 'rio-das-ostras';

-- Representante que trouxe
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$ select vincular_conta_anunciante('a1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004') $$,
  'P0001', 'A conta não corresponde ao e-mail convidado.', 'não liga o cadastro a uma conta de outro e-mail');
select throws_ok($$ select vincular_conta_anunciante('a2000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000004') $$,
  'P0001', 'A conta não corresponde ao e-mail convidado.', 'não liga a uma conta que já criou a senha');
select lives_ok($$ select vincular_conta_anunciante('a1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003') $$,
  'liga o cadastro à conta convidada');
reset role;
select is((select status::text || ' ' || usuario_id::text from anunciantes where id = 'a1000000-0000-0000-0000-000000000001'),
  'aguardando_anunciante 11111111-0000-0000-0000-000000000003', 'cadastro fica aguardando o anunciante, ligado à conta');
select is((select count(*)::int from auditoria where tabela = 'anunciantes' and registro_id = 'a1000000-0000-0000-0000-000000000001'
  and ator_id = '22222222-0000-0000-0000-000000000001' and depois ->> 'status' = 'aguardando_anunciante'), 1,
  'a ligação fica registrada em nome do representante');

-- Outro representante
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$ select vincular_conta_anunciante('a2000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003') $$,
  'P0001', 'Cadastro não encontrado ou sem permissão.', 'outro representante não liga cadastro que não trouxe');
reset role;

-- Anunciante: aceita os documentos e envia para análise
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select lives_ok($$ insert into aceites_documentos (usuario_id, documento, versao) values
  ('11111111-0000-0000-0000-000000000003', 'termos', '1'), ('11111111-0000-0000-0000-000000000003', 'privacidade', '1') $$,
  'anunciante registra o aceite dos Termos e da Política, versão 1');
select is(teste_linhas_alteradas($c$update anunciantes set status = 'em_analise' where id = 'a1000000-0000-0000-0000-000000000001'$c$), 1,
  'anunciante envia o perfil para análise');
select throws_ok($$ update anunciantes set motivo_correcao = 'eu mesmo' where id = 'a1000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Este campo só pode ser alterado pela administração.', 'anunciante não escreve o motivo de correção');
reset role;

-- Administrador pede correção
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(teste_linhas_alteradas($c$update anunciantes set status = 'rascunho', motivo_correcao = 'Falta a foto de perfil.' where id = 'a1000000-0000-0000-0000-000000000001'$c$), 1,
  'administrador pede correção com o motivo');
reset role;

set local role anon;
select is((select count(*)::int from documentos_legais where versao = '1'), 2, 'visitante lê os documentos legais em vigor');
reset role;

select * from finish();
rollback;
