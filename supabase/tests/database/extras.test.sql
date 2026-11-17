-- Contratação de extras e pagamento do evento avulso (migration
-- 20261117233134): vencimento próprio do extra, só comércio no extra Agenda,
-- renovação, comissão de extra, fora das negociações, devolução, contestação,
-- vencimento diário e lembretes, liberação na Agenda, blocos do evento avulso,
-- pagamento complementar com as datas novas (E3) e devolução só antes do
-- evento (E1). Tudo dentro de uma transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(36);

-- A = administrador; R = representante; C1, C2 e C3 = comércios; P = autônomo.
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'adm.extra@teste.invalid', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-0000000000f2', 'rep.extra@teste.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-0000000000f1', 'c1.extra@teste.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-0000000000f2', 'c2.extra@teste.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-0000000000f3', 'c3.extra@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador', nome = 'Adm Extra' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000f1';
update perfis_usuario set papel = 'representante', nome = 'Rep Extra' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000f2';
insert into representantes (id, usuario_id, cidade_id, codigo)
select 'cccccccc-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-0000000000f2', id, 'teste-rep-extra' from cidades where slug = 'rio-das-ostras';

-- Comércios publicados no Gratuito e um autônomo publicado.
insert into anunciantes (id, cidade_id, tipo, slug, nome, status, categoria_principal_id, plano_id, plano_escolhido_id, usuario_id)
select v.id::uuid, c.id, v.tipo::tipo_anunciante, v.slug, v.nome, 'publicado',
       (select id from categorias where ativa and tipo in (v.tipo::tipo_categoria, 'ambos') limit 1),
       pl.id, pl.id, v.usuario::uuid
from (values ('eeeeeeee-0000-0000-0000-0000000000f1', 'comercio', 'comercio-teste-extra-1', 'Bar Teste Extra 1', 'bbbbbbbb-0000-0000-0000-0000000000f1', 'com-nivel1'),
             ('eeeeeeee-0000-0000-0000-0000000000f2', 'comercio', 'comercio-teste-extra-2', 'Bar Teste Extra 2', 'bbbbbbbb-0000-0000-0000-0000000000f2', 'com-nivel1'),
             ('eeeeeeee-0000-0000-0000-0000000000f3', 'comercio', 'comercio-teste-extra-3', 'Bar Teste Extra 3', 'bbbbbbbb-0000-0000-0000-0000000000f3', 'com-nivel1'),
             ('eeeeeeee-0000-0000-0000-0000000000f4', 'profissional', 'autonomo-teste-extra', 'Autônomo Teste Extra', null, 'prof-nivel1'))
       as v (id, tipo, slug, nome, usuario, plano)
cross join (select id from cidades where slug = 'rio-das-ostras') c
join planos pl on pl.cidade_id = c.id and pl.codigo = v.plano;

create temporary table ids (nome text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'agenda', id from extras where codigo = 'agenda';

-- Extra Agenda: 1º pagamento (p_contratacao null) ou renovação. Roda com o papel de quem chama (o administrador).
create function public.teste_extra(p_anunciante uuid, p_contratacao uuid, p_numero integer, p_vence_anterior date, p_ancora date,
                                   p_inicio date, p_vence date, p_forma text default 'pix', p_rep uuid default null,
                                   p_comissao integer default null) returns uuid language sql as $$
  select public.registrar_pagamento_extra(p_anunciante, (select id from public.extras where codigo = 'agenda'), p_contratacao, 'mensal',
      p_numero, p_vence_anterior, p_ancora, p_inicio, p_vence, 3990, 0, 0, p_forma::public.forma_recebimento,
      1, case when p_forma = 'pix' then null else 'AB1234' end, p_inicio, p_inicio, null, '', p_rep,
      case when p_comissao is null then null else 3990 end, case when p_comissao is null then null else 20 end, p_comissao,
      case when p_comissao is null then null else p_inicio + 7 end, null, null, null, null)
$$;

-- Evento avulso: paga os blocos que faltam para as datas informadas.
create function public.teste_evento(p_evento uuid, p_inicio date, p_fim date, p_numero integer, p_blocos integer, p_valor integer)
returns uuid language sql as $$
  select public.registrar_pagamento_evento(p_evento, p_inicio, p_fim, p_numero, p_blocos, p_valor, 0, 'pix', 1, null,
      interno.hoje(), interno.hoje(), null, '', null, null, null, null, null, null, null, null, null)
$$;

select ok((select so_comercio and cobranca = 'mensal' and aceita_desconto_fundador and valor_mensal_centavos = 3990 from extras where codigo = 'agenda'),
  'o extra Agenda está no catálogo: só comércio, mensal, R$ 39,90, com desconto de Fundador');
select ok((select cobranca = 'por_evento' and not aceita_desconto_fundador and valor_mensal_centavos = 4990 from extras where codigo = 'evento-avulso'),
  'o evento avulso está no catálogo: por evento, R$ 49,90 o bloco, sem desconto de Fundador');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000f1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

-- Eventos do comércio 1 e um evento avulso de 3 dias.
insert into eventos (cidade_id, slug, nome, origem, anunciante_id, local, bairro_id, data_inicio, data_fim, situacao)
select c.id, 'show-teste-extra', 'Show Teste Extra', 'comercio', 'eeeeeeee-0000-0000-0000-0000000000f1', 'Bar', b.id, interno.hoje() + 5, interno.hoje() + 5, 'publicado'
from cidades c join bairros b on b.cidade_id = c.id where c.slug = 'rio-das-ostras' limit 1;
insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim, situacao)
select c.id, 'festa-teste-extra', 'Festa Teste Extra', 'avulso', 'Praça', b.id, interno.hoje() + 10, interno.hoje() + 12, 'publicado'
from cidades c join bairros b on b.cidade_id = c.id where c.slug = 'rio-das-ostras' limit 1;
insert into eventos (cidade_id, slug, nome, origem, local, bairro_id, data_inicio, data_fim, situacao)
select c.id, 'feira-hoje-teste-extra', 'Feira de Hoje Teste', 'avulso', 'Praça', b.id, interno.hoje(), interno.hoje(), 'publicado'
from cidades c join bairros b on b.cidade_id = c.id where c.slug = 'rio-das-ostras' limit 1;
insert into ids select 'show', id from eventos where slug = 'show-teste-extra';
insert into ids select 'festa', id from eventos where slug = 'festa-teste-extra';
insert into ids select 'feira', id from eventos where slug = 'feira-hoje-teste-extra';

-- Extra Agenda ---------------------------------------------------------------
select ok(not interno.evento_liberado((select id from ids where nome = 'show')), 'o comércio no Gratuito, sem o extra, não aparece na Agenda');
select throws_ok($$ select teste_extra('eeeeeeee-0000-0000-0000-0000000000f4', null, 1, null, interno.hoje(), interno.hoje(), interno.hoje() + 30) $$,
  'P0001', 'Este extra é só para comércios.', 'o autônomo não contrata o extra Agenda');
select lives_ok($$ insert into ids select 'pg1', teste_extra('eeeeeeee-0000-0000-0000-0000000000f1', null, 1, null, interno.hoje(), interno.hoje(),
  (interno.hoje() + interval '1 month')::date, 'pix', 'cccccccc-0000-0000-0000-0000000000f1', 798) $$,
  'o comércio no Gratuito contrata o extra Agenda (E2), com o atendimento do representante');
insert into ids select 'c1', id from extras_contratados where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000f1';
select ok((select vence_em = (interno.hoje() + interval '1 month')::date and encerrado_em is null from extras_contratados where id = (select id from ids where nome = 'c1')),
  'a contratação tem o vencimento próprio, um mês depois do pagamento');
select ok(interno.evento_liberado((select id from ids where nome = 'show')), 'com o extra Agenda, o show do comércio aparece');
select is((select valor_centavos from comissoes where pagamento_id = (select id from ids where nome = 'pg1') and origem = 'extra'), 798,
  'a comissão de extra (20%) fica com quem atendeu');
select is((select count(*)::integer from negociacoes where pagamento_id = (select id from ids where nome = 'pg1')), 0,
  'o pagamento do extra não mexe nas negociações da assinatura');
select throws_ok($$ select teste_extra('eeeeeeee-0000-0000-0000-0000000000f1', null, 1, null, interno.hoje(), interno.hoje(), interno.hoje() + 30) $$,
  'P0001', 'O anunciante já tem este extra: registre a renovação.', 'com o extra em vigor, o pagamento é renovação');
select throws_ok($$ select teste_extra('eeeeeeee-0000-0000-0000-0000000000f1', (select id from ids where nome = 'c1'), 3, (interno.hoje() + interval '1 month')::date,
  interno.hoje(), (interno.hoje() + interval '1 month')::date, (interno.hoje() + interval '2 months')::date) $$,
  'P0001', 'Outro pagamento deste extra foi registrado agora. Atualize a página.', 'a renovação confere o número do pagamento');
select lives_ok($$ insert into ids select 'pg2', teste_extra('eeeeeeee-0000-0000-0000-0000000000f1', (select id from ids where nome = 'c1'), 2,
  (interno.hoje() + interval '1 month')::date, interno.hoje(), (interno.hoje() + interval '1 month')::date, (interno.hoje() + interval '2 months')::date) $$,
  'a renovação mantém o dia do vencimento');
select ok((select vence_em = (interno.hoje() + interval '2 months')::date from extras_contratados where id = (select id from ids where nome = 'c1')),
  'a renovação leva o vencimento ao mês seguinte');
select throws_ok($$ select registrar_devolucao((select id from ids where nome = 'pg1'), 'Teste de devolução') $$,
  'P0001', 'Há pagamentos seguintes deste extra. Fale com o responsável pelo sistema.', 'com renovação paga, o 1º pagamento não volta sozinho');
select throws_ok($$ select registrar_devolucao((select id from ids where nome = 'pg2'), 'Teste de devolução') $$,
  'P0001', 'Só o primeiro pagamento de uma contratação pode ser devolvido.', 'renovação não tem devolução');

-- Devolução do extra no comércio 2.
select lives_ok($$ insert into ids select 'pg3', teste_extra('eeeeeeee-0000-0000-0000-0000000000f2', null, 1, null, interno.hoje(), interno.hoje(),
  (interno.hoje() + interval '1 month')::date) $$, 'o comércio 2 contrata o extra');
select lives_ok($$ select registrar_devolucao((select id from ids where nome = 'pg3'), 'Desistiu em 7 dias') $$, 'o 1º pagamento do extra é devolvido');
select is((select motivo_encerramento from extras_contratados where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000f2'), 'devolucao',
  'a devolução encerra o extra');
select ok((select plano_id = (select id from planos where codigo = 'com-nivel1') from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000f2'),
  'a devolução do extra não mexe no plano');

-- Contestação no cartão do comércio 3.
select lives_ok($$ insert into ids select 'pg4', teste_extra('eeeeeeee-0000-0000-0000-0000000000f3', null, 1, null, interno.hoje(), interno.hoje(),
  (interno.hoje() + interval '1 month')::date, 'credito') $$, 'o comércio 3 paga o extra no cartão');
select lives_ok($$ select registrar_contestacao((select id from ids where nome = 'pg4'), 'Contestou no cartão') $$, 'a contestação é registrada');
select is((select motivo_encerramento from extras_contratados where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000f3'), 'contestacao',
  'a contestação encerra o extra');

-- Evento avulso ---------------------------------------------------------------
select ok(not interno.evento_liberado((select id from ids where nome = 'festa')), 'o evento avulso sem pagamento não aparece');
select throws_ok($$ select teste_evento((select id from ids where nome = 'festa'), interno.hoje() + 10, interno.hoje() + 12, 1, 1, 3990) $$,
  'P0001', 'O valor não confere com o preço do bloco no catálogo. Atualize a página.', 'o valor do bloco vem do catálogo');
select lives_ok($$ insert into ids select 'pg5', teste_evento((select id from ids where nome = 'festa'), interno.hoje() + 10, interno.hoje() + 12, 1, 1, 4990) $$,
  'o evento de 3 dias paga 1 bloco');
select ok(interno.evento_liberado((select id from ids where nome = 'festa')), 'pago, o evento avulso aparece');
select lives_ok($$ update eventos set data_fim = interno.hoje() + 16 where id = (select id from ids where nome = 'festa') $$,
  'as datas mudam dentro do bloco pago (7 dias)');
select throws_ok($$ update eventos set data_fim = interno.hoje() + 17 where id = (select id from ids where nome = 'festa') $$,
  'P0001', null, 'as datas não passam dos blocos pagos (E3)');
select lives_ok($$ insert into ids select 'pg6', teste_evento((select id from ids where nome = 'festa'), interno.hoje() + 10, interno.hoje() + 20, 2, 1, 4990) $$,
  'o pagamento complementar leva as datas novas');
select ok((select data_fim = interno.hoje() + 20 from eventos where id = (select id from ids where nome = 'festa')) and interno.evento_liberado((select id from ids where nome = 'festa')),
  'com os 2 blocos pagos, o evento de 11 dias continua aparecendo');
select lives_ok($$ select registrar_devolucao((select id from ids where nome = 'pg6'), 'Desistiu antes do evento') $$,
  'antes do evento, o pagamento é devolvido');
select ok(not interno.evento_liberado((select id from ids where nome = 'festa')), 'sem todos os blocos pagos, o evento sai da Agenda');
select lives_ok($$ insert into ids select 'pg7', teste_evento((select id from ids where nome = 'feira'), interno.hoje(), interno.hoje(), 1, 1, 4990) $$,
  'o evento que começa hoje recebe pagamento');
select throws_ok($$ select registrar_devolucao((select id from ids where nome = 'pg7'), 'Desistiu no dia') $$,
  'P0001', 'O evento já começou: não há mais devolução.', 'depois do início do evento, não há devolução (E1)');
reset role;

-- Vencimento e lembretes -------------------------------------------------------
-- O extra do comércio 1 venceu há 10 dias (passou da tolerância de 7).
update extras_contratados set ancora = interno.hoje() - 40, vence_em = interno.hoje() - 10 where id = (select id from ids where nome = 'c1');
select is(interno.aplicar_vencimentos_extras() >= 1, true, 'o vencimento diário encerra o extra não renovado');
select ok((select motivo_encerramento = 'vencimento' from extras_contratados where id = (select id from ids where nome = 'c1'))
  and (select dados -> 'extras' -> 0 ->> 'nome' = 'Agenda' from avisos_email where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000f1' and tipo = 'extra_vencido')
  and not interno.evento_liberado((select id from ids where nome = 'show')),
  'o comércio recebe o aviso, e o show sai da Agenda');

select * from finish();
rollback;
