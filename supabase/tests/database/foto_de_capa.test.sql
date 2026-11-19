-- Foto de capa do perfil (migrations 20261119204122 e 20261119204123, decisão
-- de 19/11/2026): uma por anunciante, enviada pelo dono pelas regras de acesso
-- das fotos, no perfil completo e fora da galeria e da lista.
-- Tudo dentro de uma transação desfeita no fim: não deixa dados no banco.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

-- ---------------------------------------------------------------------------
-- Dados de teste (como postgres, sem RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('c1111111-1111-1111-1111-111111111111', 'dono-capa@teste.invalid', 'authenticated', 'authenticated'),
  ('c3333333-3333-3333-3333-333333333333', 'outro-capa@teste.invalid', 'authenticated', 'authenticated');

insert into anunciantes (id, cidade_id, tipo, slug, nome, usuario_id, status, categoria_principal_id, plano_id)
select v.id::uuid, c.id, 'profissional', v.slug, v.nome, v.usuario::uuid, 'publicado', cat.id,
  (select p.id from planos p where p.cidade_id = c.id and p.codigo = 'prof-nivel3')
from cidades c
join categorias cat on cat.cidade_id = c.id and cat.slug_lista = 'eletricistas'
cross join (values
  ('ca000000-0000-0000-0000-000000000001', 'teste-capa-1', 'Teste Capa Um', 'c1111111-1111-1111-1111-111111111111'),
  ('ca000000-0000-0000-0000-000000000002', 'teste-capa-2', 'Teste Capa Dois', 'c3333333-3333-3333-3333-333333333333')
) as v (id, slug, nome, usuario)
where c.slug = 'rio-das-ostras';

insert into fotos (anunciante_id, cidade_id, finalidade, chave, formato, largura, altura)
select a.id, a.cidade_id, 'galeria', 'fotos/' || a.id || '/cf000000-0000-0000-0000-000000000001', 'jpeg', 1200, 1200
from anunciantes a where a.id = 'ca000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Dono do perfil
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select lives_ok($$ insert into fotos (anunciante_id, cidade_id, finalidade, chave, formato, largura, altura)
  select id, cidade_id, 'capa', 'fotos/' || id || '/cf000000-0000-0000-0000-000000000002', 'jpeg', 1600, 400
  from anunciantes where id = 'ca000000-0000-0000-0000-000000000001' $$,
  'o dono envia a capa do próprio perfil');
select throws_ok($$ insert into fotos (anunciante_id, cidade_id, finalidade, chave, formato, largura, altura)
  select id, cidade_id, 'capa', 'fotos/' || id || '/cf000000-0000-0000-0000-000000000003', 'jpeg', 1600, 400
  from anunciantes where id = 'ca000000-0000-0000-0000-000000000001' $$,
  '23505', null, 'só uma capa no ar por anunciante');
select throws_ok($$ insert into fotos (anunciante_id, cidade_id, finalidade, chave, formato, largura, altura)
  select id, cidade_id, 'capa', 'fotos/' || id || '/cf000000-0000-0000-0000-000000000004', 'jpeg', 1600, 400
  from anunciantes where id = 'ca000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'ninguém envia capa para o perfil de outro');

-- ---------------------------------------------------------------------------
-- Visitante: perfil completo e lista
-- ---------------------------------------------------------------------------
reset role;
set local role anon;

select is(public.anunciante_publico('rio-das-ostras', 'teste-capa-1') -> 'fotoCapa' ->> 'caminho',
  'fotos/ca000000-0000-0000-0000-000000000001/cf000000-0000-0000-0000-000000000002-800.jpg',
  'o perfil completo leva a capa');
select is(jsonb_array_length(public.anunciante_publico('rio-das-ostras', 'teste-capa-1') -> 'galeria'), 1,
  'a capa não entra na galeria');
select ok(public.anunciante_publico('rio-das-ostras', 'teste-capa-2') -> 'fotoCapa' is null,
  'sem capa, o perfil não leva o campo (a página usa a 1ª foto da galeria)');
select ok(not exists (
    select 1 from jsonb_array_elements(public.anunciantes_publicos('rio-das-ostras', p_termo => 'Teste Capa')) l where l ? 'fotoCapa'
  ), 'a lista não leva a capa');

select * from finish();
rollback;
