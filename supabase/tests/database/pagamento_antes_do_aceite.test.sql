-- Pagamento antes do aceite (migration 20261117123930): a equipe registra o
-- pagamento depois do convite, o cadastro continua esperando o aceite e a
-- aprovação, o anunciante recebe o e-mail com o prazo para desistir, a recusa
-- fica barrada e o vencimento vale também antes da aprovação. Confere ainda
-- que os lembretes de vencimento voltaram a rodar. Tudo dentro de uma
-- transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

-- A = administrador; P = autônomo convidado; C = comércio convidado.
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'adm.pag@teste.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-0000000000e1', 'autonomo.pag@teste.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-0000000000e2', 'comercio.pag@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador', nome = 'Adm Pagamento' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000e1';

-- Autônomo e comércio aguardando o aceite, e um autônomo ainda em rascunho (sem convite).
insert into anunciantes (id, cidade_id, tipo, slug, nome, status, categoria_principal_id, plano_escolhido_id, usuario_id)
select v.id::uuid, c.id, v.tipo::tipo_anunciante, v.slug, v.nome, v.status::status_anunciante,
       (select id from categorias where ativa and tipo in (v.tipo::tipo_categoria, 'ambos') limit 1),
       (select id from planos where cidade_id = c.id and tipo = v.tipo::tipo_anunciante and valor_mensal_centavos > 0 order by nivel limit 1),
       v.usuario::uuid
from (values ('eeeeeeee-0000-0000-0000-0000000000e1', 'profissional', 'autonomo-teste-pagamento', 'Autônomo Teste Pagamento', 'aguardando_anunciante', 'bbbbbbbb-0000-0000-0000-0000000000e1'),
             ('eeeeeeee-0000-0000-0000-0000000000e2', 'comercio', 'comercio-teste-pagamento', 'Comércio Teste Pagamento', 'em_analise', 'bbbbbbbb-0000-0000-0000-0000000000e2'),
             ('eeeeeeee-0000-0000-0000-0000000000e3', 'profissional', 'autonomo-teste-rascunho', 'Autônomo Teste Rascunho', 'rascunho', null))
       as v (id, tipo, slug, nome, status, usuario)
cross join (select id from cidades where slug = 'rio-das-ostras') c;

-- Pagamento mensal feito em 01/09/2026, vencido em 01/10/2026 (para testar o vencimento).
-- Roda com o papel de quem chama (o administrador); some com o rollback.
create function public.teste_pagar(p_anunciante uuid) returns uuid language sql as $$
  select public.registrar_pagamento_plano(a.id, a.plano_escolhido_id, 'mensal', 1, null, '2026-09-01', '2026-09-01', '2026-10-01',
      p.valor_mensal_centavos, 0, 'pix', 1, null, '2026-09-01', '2026-09-01', null, '', null, null, false,
      null, null, null, null, null, null, null, null, null, 0, '[]'::jsonb)
  from public.anunciantes a join public.planos p on p.id = a.plano_escolhido_id where a.id = p_anunciante
$$;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000e1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select throws_ok($$ select teste_pagar('eeeeeeee-0000-0000-0000-0000000000e3') $$, 'P0001', 'Envie o convite ao anunciante antes de registrar o pagamento.', 'sem convite, o pagamento não entra');
select lives_ok($$ select teste_pagar('eeeeeeee-0000-0000-0000-0000000000e1') $$, 'o autônomo convidado recebe o pagamento antes do aceite');
select lives_ok($$ select teste_pagar('eeeeeeee-0000-0000-0000-0000000000e2') $$, 'o comércio em análise recebe o pagamento');
select is((select status::text from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000e1'), 'aguardando_anunciante', 'o cadastro continua esperando o aceite');
select is((select aprovado_em from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000e1'), null, 'o pagamento não aprova o cadastro');
select ok((select plano_id = plano_escolhido_id from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000e1'), 'o plano pago fica no cadastro');
select throws_ok($$ update anunciantes set status = 'rascunho' where id = 'eeeeeeee-0000-0000-0000-0000000000e1' $$,
  'P0001', 'Este cadastro tem pagamento registrado: registre a devolução antes de recusar.', 'cadastro pago não é recusado');
reset role;

select is((select dados ->> 'desistirAte' from avisos_email where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000e1' and tipo = 'pagamento_antes_do_aceite'),
  '2026-09-08', 'o anunciante recebe o e-mail com o prazo de 7 dias do pagamento para desistir');
select is((select para from avisos_email where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000e1' and tipo = 'pagamento_antes_do_aceite'),
  'autonomo.pag@teste.invalid', 'o e-mail vai para a conta do convite');

-- Vencimento antes da aprovação.
select lives_ok($$ select interno.aplicar_vencimentos() $$, 'o vencimento roda');
select ok((select plano_id is null and status = 'aguardando_anunciante' from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000e1'),
  'o autônomo não aprovado fica sem plano e continua esperando o aceite');
select ok((select p.valor_mensal_centavos = 0 and a.status = 'em_analise' from anunciantes a join planos p on p.id = a.plano_id where a.id = 'eeeeeeee-0000-0000-0000-0000000000e2'),
  'o comércio não aprovado vai para o Gratuito e continua em análise');
select is((select dados ->> 'antesDaAprovacao' from avisos_email where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000e1' and tipo = 'plano_vencido'),
  'true', 'o aviso de plano vencido sabe que o cadastro não foi aprovado');

-- Correção do índice parcial: os lembretes voltam a rodar.
select lives_ok($$ select interno.enfileirar_lembretes() $$, 'os lembretes de vencimento rodam');

select * from finish();
rollback;
