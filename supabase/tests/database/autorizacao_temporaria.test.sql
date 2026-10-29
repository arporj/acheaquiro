-- Autorização temporária de edição (migration 20261022130000).
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

select plan(14);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'dono@teste.invalid', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'outro@teste.invalid', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'representante@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'representante' where usuario_id = '22222222-2222-2222-2222-222222222222';
insert into representantes (usuario_id, cidade_id, codigo)
select '22222222-2222-2222-2222-222222222222', id, 'teste-rep' from cidades where slug = 'rio-das-ostras';
-- O representante só é tratado como tal com a segunda etapa (aal2) e o termo de
-- confidencialidade aceito na versão em vigor (interno.meu_representante_id).
insert into aceites_documentos (usuario_id, documento, versao)
select u.id::uuid, 'confidencialidade', d.versao
from (values ('22222222-2222-2222-2222-222222222222')) as u (id)
cross join (select versao from documentos_legais where documento = 'confidencialidade' order by vigente_desde desc limit 1) d;
insert into anunciantes (id, cidade_id, tipo, slug, nome, usuario_id, status, categoria_principal_id, plano_id)
select 'a1000000-0000-0000-0000-000000000001', c.id, 'profissional', 'teste-a1', 'Teste Publicado',
  '11111111-1111-1111-1111-111111111111', 'publicado', cat.id, (select p.id from planos p where p.cidade_id = c.id and p.codigo = 'prof-nivel1')
from cidades c join categorias cat on cat.cidade_id = c.id and cat.slug_lista = 'eletricistas'
where c.slug = 'rio-das-ostras';

-- Representante sem autorização
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(teste_linhas_alteradas($c$update anunciantes set descricao = 'Sem autorização' where slug = 'teste-a1'$c$), 0,
  'representante sem autorização não altera perfil publicado');
reset role;

-- Anunciante autoriza
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$ insert into autorizacoes_edicao (anunciante_id, cidade_id, autorizado_id, valida_ate)
  select id, cidade_id, '33333333-3333-3333-3333-333333333333', now() + interval '2 hours' from anunciantes where slug = 'teste-a1' $$,
  'P0001', 'Só um representante do Ache Aqui RO pode receber autorização.', 'anunciante não autoriza quem não é representante');
select throws_ok($$ insert into autorizacoes_edicao (anunciante_id, cidade_id, autorizado_id, valida_ate)
  select id, cidade_id, '22222222-2222-2222-2222-222222222222', now() + interval '8 days' from anunciantes where slug = 'teste-a1' $$,
  '23514', null, 'autorização de mais de 7 dias é recusada');
select lives_ok($$ insert into autorizacoes_edicao (id, anunciante_id, cidade_id, autorizado_id, valida_ate)
  select 'c1000000-0000-0000-0000-000000000001', id, cidade_id, '22222222-2222-2222-2222-222222222222', now() + interval '2 hours'
  from anunciantes where slug = 'teste-a1' $$, 'anunciante autoriza o representante por 2 horas');
reset role;

-- Representante autorizado
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(teste_linhas_alteradas($c$update anunciantes set descricao = 'Alterado pelo representante autorizado' where slug = 'teste-a1'$c$), 1,
  'representante autorizado altera o perfil');
select lives_ok($$ insert into fotos (anunciante_id, cidade_id, finalidade, chave, largura, altura)
  select id, cidade_id, 'galeria', 'fotos/' || id || '/f1000000-0000-0000-0000-000000000001', 400, 300 from anunciantes where slug = 'teste-a1' $$,
  'representante autorizado envia foto');
select throws_ok($$ update anunciantes set plano_id = (select id from planos where codigo = 'prof-nivel3') where slug = 'teste-a1' $$,
  'P0001', 'Este campo só pode ser alterado pela administração.', 'representante autorizado não muda o plano');
reset role;

-- Anunciante tenta estender, depois cancela
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$ update autorizacoes_edicao set valida_ate = now() + interval '6 days' where id = 'c1000000-0000-0000-0000-000000000001' $$,
  'P0001', 'A autorização só pode ser cancelada; para mudar, crie outra.', 'anunciante não estende uma autorização (cria outra)');
select is(teste_linhas_alteradas($c$update autorizacoes_edicao set revogada_em = now() where id = 'c1000000-0000-0000-0000-000000000001'$c$), 1,
  'anunciante cancela a autorização');
reset role;

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(teste_linhas_alteradas($c$update anunciantes set descricao = 'Depois do cancelamento' where slug = 'teste-a1'$c$), 0,
  'depois do cancelamento, o representante não altera mais');
reset role;

-- Autorização vencida (gravada como postgres, sem a identidade da etapa anterior)
select set_config('request.jwt.claims', '', true);
insert into autorizacoes_edicao (anunciante_id, cidade_id, autorizado_id, criada_em, valida_ate)
select id, cidade_id, '22222222-2222-2222-2222-222222222222', now() - interval '3 hours', now() - interval '1 hour'
from anunciantes where slug = 'teste-a1';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(teste_linhas_alteradas($c$update anunciantes set descricao = 'Com autorização vencida' where slug = 'teste-a1'$c$), 0,
  'autorização vencida não vale');
reset role;

-- Quem mais vê as autorizações
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::int from autorizacoes_edicao where anunciante_id = 'a1000000-0000-0000-0000-000000000001'), 0,
  'outro anunciante não vê as autorizações do perfil');
reset role;
set local role anon;
select is((select count(*)::int from autorizacoes_edicao), 0, 'visitante não vê autorizações');
reset role;

select is((select count(*)::int from auditoria where tabela = 'anunciantes' and registro_id = 'a1000000-0000-0000-0000-000000000001'
  and ator_id = '22222222-2222-2222-2222-222222222222' and papel = 'representante'), 1,
  'a alteração do representante autorizado fica registrada em nome dele');

select * from finish();
rollback;
