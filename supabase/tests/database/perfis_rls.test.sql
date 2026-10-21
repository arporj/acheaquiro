-- Regras de acesso dos perfis por papel (migration 20261022100000; Especificação
-- Técnica, seções 10.1 e 12). Roda com: supabase test db (local) ou --linked.
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

select plan(36);

-- ---------------------------------------------------------------------------
-- Dados de teste (como postgres, sem RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'dono@teste.invalid', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'outro@teste.invalid', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'representante@teste.invalid', 'authenticated', 'authenticated'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'representante' where usuario_id = '22222222-2222-2222-2222-222222222222';
update perfis_usuario set papel = 'administrador' where usuario_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into representantes (id, usuario_id, cidade_id, codigo)
select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', id, 'teste-rep'
from cidades where slug = 'rio-das-ostras';

-- A1 publicado (dono U1), A2 rascunho do representante, A3 em análise (dono U3).
insert into anunciantes (id, cidade_id, tipo, slug, nome, usuario_id, representante_id, status, categoria_principal_id)
select v.id::uuid, c.id, 'profissional', v.slug, v.nome, v.usuario::uuid, v.rep::uuid, v.status::status_anunciante, cat.id
from cidades c
join categorias cat on cat.cidade_id = c.id and cat.slug_lista = 'eletricistas'
cross join (values
  ('a1000000-0000-0000-0000-000000000001', 'teste-a1', 'Teste Publicado', '11111111-1111-1111-1111-111111111111', null, 'publicado'),
  ('a2000000-0000-0000-0000-000000000002', 'teste-a2', 'Teste Rascunho', null, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'rascunho'),
  ('a3000000-0000-0000-0000-000000000003', 'teste-a3', 'Teste Em Analise', '33333333-3333-3333-3333-333333333333', null, 'em_analise')
) as v (id, slug, nome, usuario, rep, status)
where c.slug = 'rio-das-ostras';

insert into fotos (anunciante_id, cidade_id, finalidade, chave, largura, altura, situacao)
select a.id, a.cidade_id, 'galeria', 'fotos/' || a.id || '/' || v.arquivo, 800, 600, v.situacao::situacao_conteudo
from anunciantes a
cross join (values
  ('f1000000-0000-0000-0000-000000000001', 'publicado'),
  ('f2000000-0000-0000-0000-000000000002', 'removido')
) as v (arquivo, situacao)
where a.id in ('a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003');

insert into encartes (anunciante_id, cidade_id, titulo, chave, tipo_arquivo, valido_ate)
select a.id, a.cidade_id, v.titulo, 'encartes/' || a.id || '/' || v.arquivo, 'imagem', v.validade::date
from anunciantes a
cross join (values
  ('e1000000-0000-0000-0000-000000000001', 'Ofertas válidas', (now() + interval '3 days')::date::text),
  ('e2000000-0000-0000-0000-000000000002', 'Ofertas vencidas', (now() - interval '3 days')::date::text)
) as v (arquivo, titulo, validade)
where a.id = 'a1000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Visitante
-- ---------------------------------------------------------------------------
set local role anon;
select is((select count(*)::int from anunciantes where slug like 'teste-%'), 1, 'visitante vê só o perfil publicado');
select is((select count(*)::int from fotos where anunciante_id in ('a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003')), 1,
  'visitante vê só a foto publicada do perfil publicado');
select is((select count(*)::int from encartes where anunciante_id = 'a1000000-0000-0000-0000-000000000001'), 1, 'visitante não vê encarte vencido');
select is((select count(*)::int from representantes), 0, 'visitante não vê representantes');
select throws_ok($$ insert into anunciantes (cidade_id, tipo, slug, nome, categoria_principal_id)
  select cidade_id, tipo, 'teste-anon', 'Anonimo', categoria_principal_id from anunciantes limit 1 $$, '42501', null, 'visitante não cria anunciante');
select is(teste_linhas_alteradas($c$update anunciantes set nome = 'Invadido' where slug = 'teste-a1'$c$), 0,
  'visitante não altera perfil');
reset role;

-- ---------------------------------------------------------------------------
-- Anunciante dono do A1
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::int from anunciantes where slug like 'teste-%'), 1, 'anunciante vê o próprio perfil e os publicados, não o rascunho nem o em análise dos outros');
select is(teste_linhas_alteradas($c$update anunciantes set descricao = 'Nova descrição' where slug = 'teste-a1'$c$), 1,
  'anunciante altera a descrição do próprio perfil');
select throws_ok($$ update anunciantes set plano_id = (select id from planos where codigo = 'prof-premium') where slug = 'teste-a1' $$,
  'P0001', 'Este campo só pode ser alterado pela administração.', 'anunciante não muda o próprio plano');
select throws_ok($$ update anunciantes set fundador = true, fundador_desde = current_date where slug = 'teste-a1' $$,
  'P0001', 'Este campo só pode ser alterado pela administração.', 'anunciante não se marca como Fundador');
select throws_ok($$ update anunciantes set slug = 'outro-endereco' where slug = 'teste-a1' $$,
  'P0001', 'Este campo só pode ser alterado pela administração.', 'anunciante não troca o endereço do perfil');
select throws_ok($$ update anunciantes set status = 'suspenso' where slug = 'teste-a1' $$,
  'P0001', null, 'anunciante não muda a situação para suspenso');
select is(teste_linhas_alteradas($c$update anunciantes set status = 'pausado' where slug = 'teste-a1'$c$), 1,
  'anunciante pausa o próprio perfil');
select is(teste_linhas_alteradas($c$update anunciantes set status = 'publicado' where slug = 'teste-a1'$c$), 1,
  'anunciante reativa o próprio perfil');
select lives_ok($$ insert into fotos (anunciante_id, cidade_id, finalidade, chave, largura, altura)
  select id, cidade_id, 'galeria', 'fotos/' || id || '/f3000000-0000-0000-0000-000000000003', 400, 300 from anunciantes where slug = 'teste-a1' $$,
  'anunciante envia foto ao próprio perfil');
select throws_ok($$ insert into fotos (anunciante_id, cidade_id, finalidade, chave, largura, altura, situacao)
  select id, cidade_id, 'galeria', 'fotos/' || id || '/f4000000-0000-0000-0000-000000000004', 400, 300, 'removido' from anunciantes where slug = 'teste-a1' $$,
  'P0001', 'Conteúdo novo entra publicado.', 'anunciante não grava foto já removida');
select throws_ok($$ update fotos set situacao = 'publicado' where chave like '%f2000000-0000-0000-0000-000000000002' and anunciante_id = 'a1000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Este campo só pode ser alterado pela administração.', 'anunciante não devolve ao ar foto removida pela administração');
select is(teste_linhas_alteradas($c$update anunciantes set nome = 'Invadido' where slug = 'teste-a3'$c$), 0,
  'anunciante não altera perfil de outro');
select throws_ok($$ insert into fotos (anunciante_id, cidade_id, finalidade, chave, largura, altura)
  select 'a3000000-0000-0000-0000-000000000003', id, 'galeria', 'fotos/a3000000-0000-0000-0000-000000000003/f5000000-0000-0000-0000-000000000005', 400, 300
  from cidades where slug = 'rio-das-ostras' $$, '42501', null, 'anunciante não envia foto ao perfil de outro');
select is((select count(*)::int from encartes where anunciante_id = 'a1000000-0000-0000-0000-000000000001'), 2, 'anunciante vê os próprios encartes vencidos');
select is((select count(*)::int from representantes), 0, 'anunciante não vê representantes');
reset role;

-- ---------------------------------------------------------------------------
-- Representante
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::int from anunciantes where slug in ('teste-a2', 'teste-a3')), 1, 'representante vê o rascunho que trouxe e não o de outro');
select lives_ok($$ insert into anunciantes (cidade_id, tipo, slug, nome, representante_id, categoria_principal_id)
  select cidade_id, 'comercio', 'teste-a4', 'Teste Assistido', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', categoria_principal_id from anunciantes where slug = 'teste-a2' $$,
  'representante cria cadastro assistido vinculado a ele');
select throws_ok($$ insert into anunciantes (cidade_id, tipo, slug, nome, representante_id, status, categoria_principal_id)
  select cidade_id, 'comercio', 'teste-a5', 'Teste Publicado Direto', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'publicado', categoria_principal_id from anunciantes where slug = 'teste-a2' $$,
  'P0001', null, 'representante não cria perfil já publicado');
select throws_ok($$ update anunciantes set usuario_id = '33333333-3333-3333-3333-333333333333' where slug = 'teste-a2' $$,
  'P0001', 'Este campo só pode ser alterado pela administração.', 'representante não liga o cadastro à conta de outra pessoa');
select is(teste_linhas_alteradas($c$update anunciantes set descricao = 'Preenchido pelo representante' where slug = 'teste-a2'$c$), 1,
  'representante completa o rascunho que trouxe');
select is(teste_linhas_alteradas($c$update anunciantes set nome = 'Invadido' where slug = 'teste-a1'$c$), 0,
  'representante não altera perfil que não trouxe');
select is((select count(*)::int from representantes), 1, 'representante vê o próprio cadastro');
reset role;

-- ---------------------------------------------------------------------------
-- Administrador sem a segunda etapa (aal1) e com ela (aal2)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::int from anunciantes where slug like 'teste-%'), 1, 'administrador sem segunda etapa vê só o que o visitante vê');
select is(teste_linhas_alteradas($c$update anunciantes set status = 'publicado' where slug = 'teste-a3'$c$), 0,
  'administrador sem segunda etapa não aprova perfil');
reset role;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*)::int from anunciantes where slug like 'teste-%'), 4, 'administrador com segunda etapa vê todos');
select is(teste_linhas_alteradas($c$update anunciantes set status = 'publicado', aprovado_em = now(), aprovado_por = auth.uid(),
  plano_id = (select id from planos where codigo = 'prof-premium') where slug = 'teste-a3'$c$), 1,
  'administrador aprova o perfil e define o plano');
select is(teste_linhas_alteradas($c$update fotos set situacao = 'removido', removida_por = auth.uid(), removida_em = now(), motivo_remocao = 'teste'
  where chave like '%f3000000-0000-0000-0000-000000000003'$c$), 1,
  'administrador remove foto');
reset role;

-- ---------------------------------------------------------------------------
-- Registro das alterações (como postgres)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from auditoria where tabela = 'anunciantes' and registro_id = 'a1000000-0000-0000-0000-000000000001'
  and ator_id = '11111111-1111-1111-1111-111111111111' and papel = 'anunciante' and acao = 'update'), 3,
  'cada alteração do anunciante no próprio perfil fica registrada com autor e papel');
select is((select enviada_por from fotos where chave like '%f3000000-0000-0000-0000-000000000003'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'a foto guarda quem a enviou');
select is((select count(*)::int from auditoria where tabela = 'fotos' and acao = 'update' and papel = 'administrador'
  and depois ->> 'situacao' = 'removido'), 1, 'a remoção da foto pelo administrador fica registrada');

select * from finish();
rollback;
