-- Negociações (migration 20261106120000): abrem e fecham sozinhas com o que
-- acontece no sistema, e cada papel vê só o que pode.
-- Tudo dentro de uma transação desfeita no fim: não deixa dados no banco.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

-- A = administrador; R1 e R2 = representantes com as duas etapas e o termo aceito.
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'adm.neg@teste.invalid', 'authenticated', 'authenticated'),
  ('11111111-0000-0000-0000-00000000000a', 'r1.neg@teste.invalid', 'authenticated', 'authenticated'),
  ('22222222-0000-0000-0000-00000000000a', 'r2.neg@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador', nome = 'Adm' where usuario_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
update perfis_usuario set papel = 'representante', nome = 'Rep Um' where usuario_id = '11111111-0000-0000-0000-00000000000a';
update perfis_usuario set papel = 'representante', nome = 'Rep Dois' where usuario_id = '22222222-0000-0000-0000-00000000000a';
insert into representantes (usuario_id, cidade_id, codigo)
select u.id::uuid, c.id, u.codigo
from (values ('11111111-0000-0000-0000-00000000000a', 'rep-neg-um'), ('22222222-0000-0000-0000-00000000000a', 'rep-neg-dois')) as u (id, codigo)
cross join (select id from cidades where slug = 'rio-das-ostras') c;
insert into aceites_documentos (usuario_id, documento, versao)
select u.id::uuid, 'confidencialidade', d.versao
from (values ('11111111-0000-0000-0000-00000000000a'), ('22222222-0000-0000-0000-00000000000a')) as u (id)
cross join (select versao from documentos_legais where documento = 'confidencialidade' order by vigente_desde desc limit 1) d;

-- Um comércio importado de teste, ainda sem dono.
insert into anunciantes (id, cidade_id, tipo, slug, nome, status, origem, categoria_principal_id)
select 'dddddddd-0000-0000-0000-00000000000a', c.id, 'comercio', 'comercio-teste-negociacao', 'Comércio Teste Negociação', 'publicado', 'receita',
       (select id from categorias where ativa and tipo <> 'profissional' limit 1)
from cidades c where c.slug = 'rio-das-ostras';

create function pg_temp.comercio() returns uuid language sql as $$ select 'dddddddd-0000-0000-0000-00000000000a'::uuid $$;
create function pg_temp.negociacao() returns uuid language sql security definer as $$
  select id from public.negociacoes where anunciante_id = 'dddddddd-0000-0000-0000-00000000000a' order by aberta_em desc limit 1
$$;

-- R1 registra o contato: abre a negociação em nome dele.
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
insert into atendimentos (cidade_id, anunciante_id, autor_id, dia, observacao)
select a.cidade_id, a.id, auth.uid(), current_date, 'Anotação do R1' from anunciantes a where a.id = pg_temp.comercio();
select is((select count(*)::int from negociacoes where anunciante_id = pg_temp.comercio() and situacao = 'aberta'), 1, 'o contato abre uma negociação');
select is((select responsavel_id from negociacoes where id = pg_temp.negociacao()), '11111111-0000-0000-0000-00000000000a'::uuid, 'quem registrou é o responsável');
select is((select (ficha_cliente(pg_temp.comercio())) -> 'negociacoes' -> 0 ->> 'etapa'), 'contato', 'a etapa começa em contato');
select is((select (negociacoes_lista(p_busca => 'Comércio Teste Negociação')) ->> 'total'), '1', 'a negociação aparece na lista de quem é dela');

-- R2 também liga: o contato entra na mesma negociação, sem trocar o responsável.
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select (negociacoes_lista(p_busca => 'Comércio Teste Negociação')) ->> 'total'), '0', 'quem não participou não vê a negociação na lista dele');
insert into atendimentos (cidade_id, anunciante_id, autor_id, dia, observacao)
select a.cidade_id, a.id, auth.uid(), current_date, 'Anotação do R2' from anunciantes a where a.id = pg_temp.comercio();
reset role;
select is((select count(*)::int from negociacoes where anunciante_id = pg_temp.comercio()), 1, 'o 2º contato não abre outra negociação');
select is((select responsavel_id from negociacoes where id = pg_temp.negociacao()), '11111111-0000-0000-0000-00000000000a'::uuid, 'o 2º contato não troca o responsável');
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select (negociacoes_lista(p_busca => 'Comércio Teste Negociação')) ->> 'total'), '1', 'quem registrou contato passa a ver a negociação');
select ok(
  (select bool_and(item ->> 'texto' <> 'Anotação do R1') from jsonb_array_elements(ficha_cliente(pg_temp.comercio()) -> 'linha_do_tempo') as item),
  'o representante não vê a anotação do outro'
);
select ok(
  exists (select 1 from jsonb_array_elements(ficha_cliente(pg_temp.comercio()) -> 'linha_do_tempo') as item where item ->> 'texto' = 'Anotação do R2'),
  'o representante vê a própria anotação'
);
select throws_ok($$ select salvar_proxima_acao(pg_temp.negociacao(), current_date + 3, 'Ligar') $$,
  'P0001', 'Só o responsável ou a administração alteram esta negociação.', 'quem não é responsável não altera');

-- R2 fecha com o comércio: a negociação passa a ser dele, em cadastro.
select assumir_importado(pg_temp.comercio());
reset role;
select is((select responsavel_id from negociacoes where id = pg_temp.negociacao()), '22222222-0000-0000-0000-00000000000a'::uuid, 'o Fechei passa a negociação a quem fechou');
select is((select count(*)::int from negociacoes where anunciante_id = pg_temp.comercio()), 1, 'o Fechei não abre outra negociação');
select is(interno.etapa_da_negociacao(pg_temp.comercio(), 'assinatura'), 'em_cadastro', 'a etapa passa a em cadastro');
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(
  (select (ficha_cliente(a.id)) -> 'cliente' ->> 'id' from anunciantes a where a.importado_id = pg_temp.comercio()),
  pg_temp.comercio()::text, 'a ficha da cópia é a do cliente'
);
select is(
  (clientes_lista(p_busca => 'Comércio Teste Negociação')) ->> 'total', '1', 'a cópia não aparece como outro cliente'
);
select is(
  (clientes_lista(p_busca => 'Comércio Teste Negociação', p_situacao => 'aberta', p_etapa => 'em_cadastro')) ->> 'total', '1', 'filtra pela etapa'
);
select salvar_proxima_acao(pg_temp.negociacao(), current_date - 1, 'Cobrar o cadastro');
select is((negociacoes_lista(p_atrasadas => true, p_busca => 'Comércio Teste Negociação')) ->> 'total', '1', 'próxima ação vencida aparece como atrasada');

-- Perdida com motivo, e reaberta.
select throws_ok($$ select marcar_negociacao_perdida(pg_temp.negociacao(), gen_random_uuid(), '') $$,
  'P0001', 'Escolha o motivo.', 'perder exige um motivo válido');
select marcar_negociacao_perdida(pg_temp.negociacao(), (select id from motivos_perda where nome = 'Preço' limit 1), 'Achou caro');
select is((select situacao from negociacoes where id = pg_temp.negociacao()), 'perdida', 'o responsável marca como perdida');
select reabrir_negociacao(pg_temp.negociacao());
select is((select situacao from negociacoes where id = pg_temp.negociacao()), 'aberta', 'o responsável reabre');

-- O pagamento fecha como ganha, em nome de quem atendeu; a devolução desfaz.
reset role;
insert into pagamentos (cidade_id, anunciante_id, plano_id, periodicidade, numero, periodo_inicio, vence_em, valor_cheio_centavos, valor_centavos,
                        forma, conta_id, pago_em, confirmado_em, representante_id, registrado_por)
select a.cidade_id, a.id, (select id from planos where tipo = 'comercio' and valor_mensal_centavos > 0 limit 1), 'mensal', 1, current_date, current_date + 30, 5990, 5990,
       'pix', (select id from contas_recebimento limit 1), current_date, current_date,
       (select id from representantes where usuario_id = '11111111-0000-0000-0000-00000000000a'), 'aaaaaaaa-0000-0000-0000-00000000000a'
from anunciantes a where a.id = pg_temp.comercio();
select is((select situacao from negociacoes where id = pg_temp.negociacao()), 'ganha', 'o pagamento fecha como ganha');
select is((select responsavel_id from negociacoes where id = pg_temp.negociacao()), '11111111-0000-0000-0000-00000000000a'::uuid, 'a venda fica com quem atendeu');
update pagamentos set devolvido_em = now(), devolvido_por = 'aaaaaaaa-0000-0000-0000-00000000000a', motivo_devolucao = 'Desistiu em 7 dias', tipo_devolucao = 'devolucao' where anunciante_id = pg_temp.comercio();
select is((select situacao from negociacoes where id = pg_temp.negociacao()), 'perdida', 'a devolução desfaz a venda');

-- Administrador e papéis sem acesso.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select r.perdidas from resumo_negociacoes(current_date - 1, current_date) r where r.usuario_id = '11111111-0000-0000-0000-00000000000a'), 1::bigint, 'o resumo conta a negociação perdida');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok($$ select * from resumo_negociacoes(current_date - 1, current_date) $$, 'P0001', 'Sem permissão.', 'o resumo é só da administração');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$ select clientes_lista() $$, 'P0001', 'Sem permissão.', 'sem as duas etapas, o representante não vê a lista');
reset role;

-- "Não procurar" encerra a negociação aberta.
update negociacoes set situacao = 'aberta', motivo_perda_id = null, pagamento_id = null, fechada_em = null, fechada_por = null where id = pg_temp.negociacao();
insert into nao_procurar (anunciante_id, cidade_id) select a.id, a.cidade_id from anunciantes a where a.id = pg_temp.comercio();
select is((select m.codigo_sistema from negociacoes n join motivos_perda m on m.id = n.motivo_perda_id where n.id = pg_temp.negociacao()), 'nao_procurar', 'pedir para não ser procurado encerra a negociação');

select * from finish();
rollback;
