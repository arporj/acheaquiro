-- Cadastro próprio do anunciante (migrations 20261124125805 e 20261124161514,
-- decisões G1 a G6 e do código na criação da conta, de 24/11/2026): o código do
-- representante informado ao criar a conta fica na conta, o rascunho do dono o
-- recebe e, na aprovação, o indicado ativo vira quem trouxe o anunciante. O que
-- o dono muda no perfil publicado vai para o ar e entra em "Para conferir" (G4).
-- Tudo dentro de uma transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

-- ---------------------------------------------------------------------------
-- Dados de teste (como postgres, sem RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000c0', 'adm.cp@teste.invalid', 'authenticated', 'authenticated'),
  ('11111111-0000-0000-0000-0000000000c0', 'rep.cp@teste.invalid', 'authenticated', 'authenticated'),
  ('12222222-0000-0000-0000-0000000000c0', 'rep2.cp@teste.invalid', 'authenticated', 'authenticated'),
  ('d2222222-0000-0000-0000-0000000000c0', 'publicado.cp@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador', nome = 'Adm CP' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000c0';
update perfis_usuario set papel = 'representante', nome = 'Rep CP' where usuario_id = '11111111-0000-0000-0000-0000000000c0';
update perfis_usuario set papel = 'representante', nome = 'Rep2 CP' where usuario_id = '12222222-0000-0000-0000-0000000000c0';
insert into representantes (id, usuario_id, cidade_id, codigo)
select v.id::uuid, v.usuario::uuid, c.id, v.codigo
from cidades c
cross join (values
  ('e1111111-0000-0000-0000-0000000000c0', '11111111-0000-0000-0000-0000000000c0', 'rep-cp-um'),
  ('e2222222-0000-0000-0000-0000000000c0', '12222222-0000-0000-0000-0000000000c0', 'rep-cp-dois')
) as v (id, usuario, codigo)
where c.slug = 'rio-das-ostras';

-- Contas criadas pelo site, com o código nos dados da conta (como o /criar-conta manda).
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('d1111111-0000-0000-0000-0000000000c0', 'novo.cp@teste.invalid', 'authenticated', 'authenticated',
    '{"nome":"Novo CP","codigo_representante":" REP-CP-UM "}'),
  ('d3333333-0000-0000-0000-0000000000c0', 'saiu.cp@teste.invalid', 'authenticated', 'authenticated',
    '{"nome":"Saiu CP","codigo_representante":"rep-cp-dois"}'),
  ('d4444444-0000-0000-0000-0000000000c0', 'semcodigo.cp@teste.invalid', 'authenticated', 'authenticated',
    '{"nome":"Sem codigo CP","codigo_representante":"codigo-que-nao-existe"}');

-- Aceite das versões em vigor (a mudança de situação pelo dono exige: envio à análise e pausa).
insert into aceites_documentos (usuario_id, documento, versao)
select u.id::uuid, d.documento, d.versao
from (values
  ('d1111111-0000-0000-0000-0000000000c0'), ('d2222222-0000-0000-0000-0000000000c0'), ('d3333333-0000-0000-0000-0000000000c0')
) as u (id)
cross join (
  select distinct on (documento) documento, versao from documentos_legais
  where documento in ('termos', 'privacidade') and vigente_desde <= (now() at time zone 'America/Sao_Paulo')::date
  order by documento, vigente_desde desc
) d;

-- Perfil já publicado do segundo anunciante.
insert into anunciantes (id, cidade_id, tipo, slug, nome, usuario_id, status, categoria_principal_id, plano_id)
select 'f2222222-0000-0000-0000-0000000000c0', c.id, 'profissional', 'teste-cp-publicado', 'Teste CP Publicado',
  'd2222222-0000-0000-0000-0000000000c0', 'publicado', cat.id,
  (select p.id from planos p where p.cidade_id = c.id and p.codigo = 'prof-nivel3')
from cidades c
join categorias cat on cat.cidade_id = c.id and cat.slug_lista = 'eletricistas'
where c.slug = 'rio-das-ostras';

create function pg_temp.como(usuario text, aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"%s"}', usuario, aal), true)
$$;
create function pg_temp.revisar() returns boolean language sql security definer as $$
  select revisar from public.anunciantes where id = 'f2222222-0000-0000-0000-0000000000c0'
$$;
-- Rascunho do próprio dono, como o /anunciante/cadastro cria.
create function pg_temp.rascunho(p_id uuid, p_usuario uuid, p_slug text) returns void language sql as $$
  insert into public.anunciantes (id, cidade_id, tipo, slug, nome, usuario_id, status, categoria_principal_id, plano_escolhido_id, periodicidade_escolhida)
  select p_id, c.id, 'profissional', p_slug, 'Teste CP ' || p_slug, p_usuario, 'rascunho', cat.id,
    (select p.id from public.planos p where p.cidade_id = c.id and p.codigo = 'prof-nivel2'), 'anual'
  from public.cidades c join public.categorias cat on cat.cidade_id = c.id and cat.slug_lista = 'eletricistas'
  where c.slug = 'rio-das-ostras'
$$;
create function pg_temp.indicado(p_id uuid) returns uuid language sql security definer as $$
  select representante_indicado_id from public.anunciantes where id = p_id
$$;
create function pg_temp.trouxe(p_id uuid) returns uuid language sql security definer as $$
  select representante_id from public.anunciantes where id = p_id
$$;
create function pg_temp.responsavel(p_id uuid) returns uuid language sql security definer as $$
  select responsavel_id from public.negociacoes where anunciante_id = p_id and situacao = 'aberta' and tipo = 'assinatura'
$$;
create function pg_temp.negociacoes(p_id uuid) returns bigint language sql security definer as $$
  select count(*) from public.negociacoes where anunciante_id = p_id
$$;
create function pg_temp.indicado_da_conta(p_usuario uuid) returns uuid language sql security definer as $$
  select representante_indicado_id from public.perfis_usuario where usuario_id = p_usuario
$$;

-- ---------------------------------------------------------------------------
-- Código do representante guardado na conta
-- ---------------------------------------------------------------------------
select is(pg_temp.indicado_da_conta('d1111111-0000-0000-0000-0000000000c0'), 'e1111111-0000-0000-0000-0000000000c0'::uuid,
  'o código ativo da criação da conta fica na conta (sem diferenciar maiúscula nem espaço)');
select is(pg_temp.indicado_da_conta('d4444444-0000-0000-0000-0000000000c0'), null::uuid,
  'código desconhecido não indica ninguém');
select is(public.codigo_representante_valido('REP-CP-UM'), true, 'o link /r/codigo confere com a mesma regra');

-- ---------------------------------------------------------------------------
-- Rascunho recebe o indicado da conta
-- ---------------------------------------------------------------------------
select pg_temp.como('d1111111-0000-0000-0000-0000000000c0');
set local role authenticated;

select lives_ok($$ select pg_temp.rascunho('f1111111-0000-0000-0000-0000000000c0', 'd1111111-0000-0000-0000-0000000000c0', 'teste-cp-novo') $$,
  'o dono cria o próprio rascunho');
select is(pg_temp.indicado('f1111111-0000-0000-0000-0000000000c0'), 'e1111111-0000-0000-0000-0000000000c0'::uuid,
  'o rascunho recebe o representante indicado na conta');
select is(pg_temp.responsavel('f1111111-0000-0000-0000-0000000000c0'), '11111111-0000-0000-0000-0000000000c0'::uuid,
  'a negociação abre com o representante indicado, e não com o anunciante');
select throws_ok($$ insert into anunciantes (cidade_id, tipo, slug, nome, usuario_id, status, representante_indicado_id)
  select id, 'profissional', 'teste-cp-outro', 'Outro', 'd1111111-0000-0000-0000-0000000000c0', 'rascunho', 'e2222222-0000-0000-0000-0000000000c0'
  from cidades where slug = 'rio-das-ostras' $$,
  'P0001', 'O representante indicado vem do código informado ao criar a conta.', 'o indicado não vem no cadastro');
select throws_ok($$ update anunciantes set representante_indicado_id = null where id = 'f1111111-0000-0000-0000-0000000000c0' $$,
  'P0001', 'O representante indicado vem do código informado ao criar a conta.', 'o dono não muda o indicado do rascunho');
update perfis_usuario set representante_indicado_id = null where usuario_id = 'd1111111-0000-0000-0000-0000000000c0';
select is(pg_temp.indicado_da_conta('d1111111-0000-0000-0000-0000000000c0'), 'e1111111-0000-0000-0000-0000000000c0'::uuid,
  'o dono não muda o indicado da conta');
select lives_ok($$ update anunciantes set status = 'em_analise' where id = 'f1111111-0000-0000-0000-0000000000c0' $$,
  'o dono envia o rascunho para análise');
select is(pg_temp.trouxe('f1111111-0000-0000-0000-0000000000c0'), null::uuid,
  'antes da aprovação, o indicado ainda não é quem trouxe');

-- Representante desativado entre a criação da conta e a aprovação.
select pg_temp.como('d3333333-0000-0000-0000-0000000000c0');
select lives_ok($$ select pg_temp.rascunho('f3333333-0000-0000-0000-0000000000c0', 'd3333333-0000-0000-0000-0000000000c0', 'teste-cp-saiu') $$,
  'o dono do segundo cadastro cria o rascunho');
select lives_ok($$ update anunciantes set status = 'em_analise' where id = 'f3333333-0000-0000-0000-0000000000c0' $$,
  'o dono do segundo cadastro o envia para análise');

-- Sem código válido: nenhuma negociação abre.
select pg_temp.como('d4444444-0000-0000-0000-0000000000c0');
select lives_ok($$ select pg_temp.rascunho('f4444444-0000-0000-0000-0000000000c0', 'd4444444-0000-0000-0000-0000000000c0', 'teste-cp-sem-codigo') $$,
  'quem criou a conta sem código válido cria o rascunho');
select is(pg_temp.indicado('f4444444-0000-0000-0000-0000000000c0'), null::uuid, 'sem código, o rascunho fica sem indicado');
select is(pg_temp.negociacoes('f4444444-0000-0000-0000-0000000000c0'), 0::bigint,
  'sem representante, o cadastro próprio não abre negociação');

-- ---------------------------------------------------------------------------
-- Aprovação pela administração
-- ---------------------------------------------------------------------------
reset role;
update representantes set ativo = false where id = 'e2222222-0000-0000-0000-0000000000c0';
select pg_temp.como('aaaaaaaa-0000-0000-0000-0000000000c0', 'aal2');
set local role authenticated;
select lives_ok($$ update anunciantes set status = 'aguardando_pagamento', aprovado_em = now() where id = 'f1111111-0000-0000-0000-0000000000c0' $$,
  'a administração aprova o autônomo, que espera o pagamento');
select is(pg_temp.trouxe('f1111111-0000-0000-0000-0000000000c0'),
  'e1111111-0000-0000-0000-0000000000c0'::uuid, 'na aprovação, o indicado ativo vira quem trouxe o anunciante');
select lives_ok($$ update anunciantes set status = 'aguardando_pagamento', aprovado_em = now() where id = 'f3333333-0000-0000-0000-0000000000c0' $$,
  'a administração aprova o cadastro de quem foi indicado pelo representante desativado');
select is(pg_temp.trouxe('f3333333-0000-0000-0000-0000000000c0'), null::uuid,
  'representante desativado não leva o anunciante para a carteira');

-- ---------------------------------------------------------------------------
-- Perfil publicado: "Para conferir" (G4)
-- ---------------------------------------------------------------------------
select pg_temp.como('d2222222-0000-0000-0000-0000000000c0');
update anunciantes set status = 'pausado' where id = 'f2222222-0000-0000-0000-0000000000c0';
select is(pg_temp.revisar(), false, 'pausar não entra em "Para conferir"');
update anunciantes set status = 'publicado', descricao = 'Atendo à noite também.' where id = 'f2222222-0000-0000-0000-0000000000c0';
select is(pg_temp.revisar(), true, 'mudar a descrição do perfil no ar entra em "Para conferir"');
select throws_ok($$ update anunciantes set revisar = false where id = 'f2222222-0000-0000-0000-0000000000c0' $$,
  'P0001', 'Este campo só pode ser alterado pela administração.', 'o dono não tira o perfil de "Para conferir"');

select pg_temp.como('aaaaaaaa-0000-0000-0000-0000000000c0', 'aal2');
update anunciantes set revisar = false where id = 'f2222222-0000-0000-0000-0000000000c0';
select is(pg_temp.revisar(), false, 'a administração marca como conferido');

select pg_temp.como('d2222222-0000-0000-0000-0000000000c0');
insert into horarios (anunciante_id, dia_semana, abre, fecha) values ('f2222222-0000-0000-0000-0000000000c0', 1, '08:00', '18:00');
select is(pg_temp.revisar(), true, 'mudar o horário do perfil no ar entra em "Para conferir"');

select * from finish();
rollback;
