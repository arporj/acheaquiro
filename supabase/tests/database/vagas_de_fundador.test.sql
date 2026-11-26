-- Vagas de Fundador depois do prazo (migration 20261126213410): a contagem
-- pública, a trava da última vaga e a vaga que volta com a devolução. Para não
-- depender da data de hoje, o teste põe o prazo em 20/11/2026 e deixa só 2
-- vagas livres além das já usadas pelos pagamentos reais, dentro de uma
-- transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

update configuracoes set valor = to_jsonb('2026-11-20'::text)
where chave = 'prazo_fundador' and cidade_id = (select id from cidades where slug = 'rio-das-ostras');
create temporary table teste_base on commit drop as
  select (vagas_fundador('rio-das-ostras') ->> 'usadas')::integer as usadas;
grant select on teste_base to anon, authenticated;
update configuracoes set valor = to_jsonb((select usadas from teste_base) + 2)
where chave = 'vagas_fundador_depois_do_prazo' and cidade_id = (select id from cidades where slug = 'rio-das-ostras');

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'adm.vagas@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador', nome = 'Adm Vagas' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000f1';

-- Três autônomos em análise, que pagam depois do prazo de teste.
insert into anunciantes (id, cidade_id, tipo, slug, nome, status, categoria_principal_id, plano_escolhido_id)
select v.id::uuid, c.id, 'profissional', v.slug, v.nome, 'em_analise',
       (select id from categorias where ativa and tipo in ('profissional', 'ambos') limit 1),
       (select id from planos where cidade_id = c.id and tipo = 'profissional' and valor_mensal_centavos > 0 order by nivel limit 1)
from (values ('eeeeeeee-0000-0000-0000-0000000000f1', 'autonomo-teste-vaga-1', 'Autônomo Teste Vaga 1'),
             ('eeeeeeee-0000-0000-0000-0000000000f2', 'autonomo-teste-vaga-2', 'Autônomo Teste Vaga 2'),
             ('eeeeeeee-0000-0000-0000-0000000000f3', 'autonomo-teste-vaga-3', 'Autônomo Teste Vaga 3'))
       as v (id, slug, nome)
cross join (select id from cidades where slug = 'rio-das-ostras') c;

-- Pagamento mensal em 25/11/2026 (depois do prazo de teste), virando Fundador ou não.
create function public.teste_pagar_vaga(p_anunciante uuid, p_fundador boolean) returns uuid language sql as $$
  select public.registrar_pagamento_plano(a.id, a.plano_escolhido_id, 'mensal', 1, null, '2026-11-27', '2026-11-27', '2026-12-27',
      p.valor_mensal_centavos, 0, 'pix', 1, null, '2026-11-25', '2026-11-25', null, '', null,
      case when p_fundador then date '2026-11-27' end, p_fundador,
      null, null, null, null, null, null, null, null, null, 0, '[]'::jsonb)
  from public.anunciantes a join public.planos p on p.id = a.plano_escolhido_id where a.id = p_anunciante
$$;

set local role anon;
select is(vagas_fundador('rio-das-ostras'), jsonb_build_object('total', (select usadas from teste_base) + 2, 'usadas', (select usadas from teste_base)),
  'o visitante vê o total e as usadas');
reset role;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000f1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select lives_ok($$ select teste_pagar_vaga('eeeeeeee-0000-0000-0000-0000000000f1', true) $$, 'o 1º pagamento ocupa uma vaga');
select lives_ok($$ select teste_pagar_vaga('eeeeeeee-0000-0000-0000-0000000000f2', true) $$, 'o 2º pagamento ocupa a última vaga');
select is((vagas_fundador('rio-das-ostras') ->> 'usadas')::integer - (select usadas from teste_base), 2, 'as duas vagas estão usadas');
select throws_ok($$ select teste_pagar_vaga('eeeeeeee-0000-0000-0000-0000000000f3', true) $$, 'P0001',
  'As vagas de Fundador acabaram. Volte à tela anterior para ver o valor sem o desconto.', 'sem vaga, o pagamento não vira Fundador');
select lives_ok($$ select teste_pagar_vaga('eeeeeeee-0000-0000-0000-0000000000f3', false) $$, 'sem vaga, o pagamento entra sem o Fundador');

select lives_ok($$ select registrar_devolucao((select id from pagamentos where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000f1'), 'Desistiu em 7 dias') $$,
  'a devolução é registrada');
select is((vagas_fundador('rio-das-ostras') ->> 'usadas')::integer - (select usadas from teste_base), 1, 'com a devolução, a vaga volta (V2)');
reset role;

-- Quem perde a condição depois continua ocupando a vaga (V3).
update anunciantes set fundador = false, fundador_desde = null where id = 'eeeeeeee-0000-0000-0000-0000000000f2';
select is((vagas_fundador('rio-das-ostras') ->> 'usadas')::integer - (select usadas from teste_base), 1, 'a perda da condição não devolve a vaga');

select * from finish();
rollback;
