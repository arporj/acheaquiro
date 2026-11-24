-- Cadastro próprio do anunciante (migration 20261124125805, decisões G1 a G6 de
-- 24/11/2026): o dono cria o rascunho, indica o representante pelo código e
-- envia para análise; na aprovação, o indicado vira quem trouxe o anunciante.
-- O que o dono muda no perfil publicado vai para o ar e entra em "Para
-- conferir" (G4). Tudo dentro de uma transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

-- ---------------------------------------------------------------------------
-- Dados de teste (como postgres, sem RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000c0', 'adm.cp@teste.invalid', 'authenticated', 'authenticated'),
  ('11111111-0000-0000-0000-0000000000c0', 'rep.cp@teste.invalid', 'authenticated', 'authenticated'),
  ('d1111111-0000-0000-0000-0000000000c0', 'novo.cp@teste.invalid', 'authenticated', 'authenticated'),
  ('d2222222-0000-0000-0000-0000000000c0', 'publicado.cp@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador', nome = 'Adm CP' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000c0';
update perfis_usuario set papel = 'representante', nome = 'Rep CP' where usuario_id = '11111111-0000-0000-0000-0000000000c0';
insert into representantes (id, usuario_id, cidade_id, codigo)
select 'e1111111-0000-0000-0000-0000000000c0', '11111111-0000-0000-0000-0000000000c0', id, 'rep-cp-um'
from cidades where slug = 'rio-das-ostras';

-- Aceite das versões em vigor (a mudança de situação pelo dono exige: envio à análise e pausa).
insert into aceites_documentos (usuario_id, documento, versao)
select u.id::uuid, d.documento, d.versao
from (values ('d1111111-0000-0000-0000-0000000000c0'), ('d2222222-0000-0000-0000-0000000000c0')) as u (id)
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

-- ---------------------------------------------------------------------------
-- Rascunho e código do representante
-- ---------------------------------------------------------------------------
select pg_temp.como('d1111111-0000-0000-0000-0000000000c0');
set local role authenticated;

select lives_ok($$ insert into anunciantes (id, cidade_id, tipo, slug, nome, usuario_id, status, categoria_principal_id, plano_escolhido_id, periodicidade_escolhida)
  select 'f1111111-0000-0000-0000-0000000000c0', c.id, 'profissional', 'teste-cp-novo', 'Teste CP Novo',
    'd1111111-0000-0000-0000-0000000000c0', 'rascunho', cat.id,
    (select p.id from planos p where p.cidade_id = c.id and p.codigo = 'prof-nivel2'), 'anual'
  from cidades c join categorias cat on cat.cidade_id = c.id and cat.slug_lista = 'eletricistas'
  where c.slug = 'rio-das-ostras' $$,
  'o dono cria o próprio rascunho');
select throws_ok($$ insert into anunciantes (cidade_id, tipo, slug, nome, usuario_id, status, representante_indicado_id)
  select id, 'profissional', 'teste-cp-outro', 'Outro', 'd1111111-0000-0000-0000-0000000000c0', 'rascunho', 'e1111111-0000-0000-0000-0000000000c0'
  from cidades where slug = 'rio-das-ostras' $$,
  'P0001', 'O representante indicado é informado pelo código.', 'o indicado não vem no cadastro');
select is(public.indicar_representante('codigo-que-nao-existe'), false, 'código desconhecido não indica ninguém');
select is(public.indicar_representante('  REP-CP-UM '), true, 'código de representante ativo indica (sem diferenciar maiúscula nem espaço)');
select is((select representante_indicado_id from anunciantes where id = 'f1111111-0000-0000-0000-0000000000c0'),
  'e1111111-0000-0000-0000-0000000000c0'::uuid, 'o indicado fica gravado no rascunho');
select throws_ok($$ update anunciantes set representante_indicado_id = null where id = 'f1111111-0000-0000-0000-0000000000c0' $$,
  'P0001', 'O representante indicado é informado pelo código.', 'o dono não muda o indicado sem o código');
select lives_ok($$ update anunciantes set status = 'em_analise' where id = 'f1111111-0000-0000-0000-0000000000c0' $$,
  'o dono envia o rascunho para análise');
select is((select representante_id from anunciantes where id = 'f1111111-0000-0000-0000-0000000000c0'), null::uuid,
  'antes da aprovação, o indicado ainda não é quem trouxe');

-- ---------------------------------------------------------------------------
-- Aprovação pela administração
-- ---------------------------------------------------------------------------
select pg_temp.como('aaaaaaaa-0000-0000-0000-0000000000c0', 'aal2');
select lives_ok($$ update anunciantes set status = 'aguardando_pagamento', aprovado_em = now() where id = 'f1111111-0000-0000-0000-0000000000c0' $$,
  'a administração aprova o autônomo, que espera o pagamento');
select is((select representante_id from anunciantes where id = 'f1111111-0000-0000-0000-0000000000c0'),
  'e1111111-0000-0000-0000-0000000000c0'::uuid, 'na aprovação, o indicado vira quem trouxe o anunciante');

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
