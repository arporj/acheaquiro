-- Exclusão da conta pelo anunciante (migrations 20261124162123 e 20261124162128):
-- conta sem nada, anunciante sem pagamento, anunciante com pagamento (registro
-- mínimo, CNPJ bloqueado, exclusão agendada e desistência), evento avulso pago
-- e aceites guardados. Tudo dentro de uma transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(33);

-- A = administrador; U1 = cliente sem anúncio; U2 = anunciante sem pagamento;
-- U3 = comércio da Receita com o extra Agenda pago; U4 = organizador de evento avulso pago.
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'adm.exclusao@teste.invalid', 'authenticated', 'authenticated'),
  ('d1d1d1d1-0000-0000-0000-0000000000d1', 'u1.exclusao@teste.invalid', 'authenticated', 'authenticated'),
  ('d2d2d2d2-0000-0000-0000-0000000000d1', 'u2.exclusao@teste.invalid', 'authenticated', 'authenticated'),
  ('d3d3d3d3-0000-0000-0000-0000000000d1', 'u3.exclusao@teste.invalid', 'authenticated', 'authenticated'),
  ('d4d4d4d4-0000-0000-0000-0000000000d1', 'u4.exclusao@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000d1';
insert into aceites_documentos (usuario_id, documento, versao)
select u.id::uuid, d.documento, d.versao
from (values ('d1d1d1d1-0000-0000-0000-0000000000d1'), ('d3d3d3d3-0000-0000-0000-0000000000d1')) as u (id)
cross join lateral (
  select distinct on (documento) documento, versao from documentos_legais
  where documento in ('termos', 'privacidade') and vigente_desde <= interno.hoje()
  order by documento, vigente_desde desc
) d;

insert into anunciantes (id, cidade_id, tipo, slug, nome, status, origem, categoria_principal_id, plano_id, usuario_id, whatsapp, descricao)
select v.id::uuid, c.id, 'comercio', v.slug, v.nome, 'publicado', v.origem,
       (select id from categorias where cidade_id = c.id and ativa and tipo <> 'profissional' limit 1),
       (select id from planos where codigo = 'com-nivel1'), v.usuario::uuid, '22999990000', 'Descrição de teste'
from (values ('eeeeeeee-0000-0000-0000-0000000000d2', 'comercio-exclusao-2', 'Comércio Exclusão 2', 'cadastro', 'd2d2d2d2-0000-0000-0000-0000000000d1'),
             ('eeeeeeee-0000-0000-0000-0000000000d3', 'comercio-exclusao-3', 'Comércio Exclusão 3', 'receita', 'd3d3d3d3-0000-0000-0000-0000000000d1'))
       as v (id, slug, nome, origem, usuario)
cross join (select id from cidades where slug = 'rio-das-ostras') c;
insert into fotos (anunciante_id, cidade_id, finalidade, chave, largura, altura)
select 'eeeeeeee-0000-0000-0000-0000000000d2', cidade_id, 'galeria', 'fotos/eeeeeeee-0000-0000-0000-0000000000d2/11111111-2222-3333-4444-555555555555', 800, 800
from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000d2';
insert into dados_receita (anunciante_id, cidade_id, cnpj, razao_social, cnae_principal, referencia)
select id, cidade_id, '99888777000166', 'Comércio Exclusão Ltda', '5611201', '2026-10' from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000d3';

create temporary table ids (nome text primary key, id uuid);
grant all on ids to authenticated;

create function public.teste_extra_exclusao() returns uuid language sql as $$
  select public.registrar_pagamento_extra('eeeeeeee-0000-0000-0000-0000000000d3', (select id from public.extras where codigo = 'agenda'), null, 'mensal',
      1, null, interno.hoje(), interno.hoje(), (interno.hoje() + interval '1 month')::date, 3990, 0, 0, 'pix',
      1, null, interno.hoje(), interno.hoje(), null, '', null, null, null, null, null, null, null, null, null)
$$;
create function public.teste_evento_exclusao(p_evento uuid) returns uuid language sql as $$
  select public.registrar_pagamento_evento(p_evento, interno.hoje() + 10, interno.hoje() + 11, 1, 1, 4990, 0, 'pix', 1, null,
      interno.hoje(), interno.hoje(), null, '', null, null, null, null, null, null, null, null, null)
$$;

-- A administração registra o pagamento do extra do U3 e do evento avulso do U4.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
insert into eventos (cidade_id, slug, nome, origem, usuario_id, local, bairro_id, data_inicio, data_fim, situacao)
select c.id, v.slug, v.nome, 'avulso', v.usuario::uuid, 'Praça', (select b.id from bairros b where b.cidade_id = c.id limit 1),
       interno.hoje() + 10, interno.hoje() + 11, 'publicado'
from (values ('festa-paga-exclusao', 'Festa paga', 'd4d4d4d4-0000-0000-0000-0000000000d1'),
             ('festa-rascunho-exclusao', 'Festa rascunho', 'd4d4d4d4-0000-0000-0000-0000000000d1'),
             ('festa-do-u2-exclusao', 'Festa do U2', 'd2d2d2d2-0000-0000-0000-0000000000d1')) as v (slug, nome, usuario)
cross join (select id from cidades where slug = 'rio-das-ostras') c;
insert into ids select 'paga', id from eventos where slug = 'festa-paga-exclusao';
insert into ids select 'rascunho', id from eventos where slug = 'festa-rascunho-exclusao';
insert into ids select 'do_u2', id from eventos where slug = 'festa-do-u2-exclusao';
select lives_ok($$ select public.teste_extra_exclusao() $$, 'a administração registra o extra Agenda do U3');
select lives_ok($$ select public.teste_evento_exclusao((select id from ids where nome = 'paga')) $$, 'a administração registra o evento avulso pago do U4');
reset role;

-- ---------------------------------------------------------------------------
-- U1: conta sem anúncio nem pagamento
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"d1d1d1d1-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(situacao_da_minha_conta() ->> 'pagoAte', null, 'sem nada pago, não há período a manter');
select throws_ok($$ select excluir_minha_conta(true) $$, 'P0001', 'Não há período pago em vigor para manter. Escolha excluir agora.',
  'sem período pago, não dá para agendar');
select is(excluir_minha_conta(false) ->> 'excluida', 'true', 'o cliente exclui a própria conta');
reset role;
select is((select count(*) from auth.users where id = 'd1d1d1d1-0000-0000-0000-0000000000d1'), 0::bigint, 'a conta do U1 sai');
select is((select count(*) from aceites_documentos where usuario_id = 'd1d1d1d1-0000-0000-0000-0000000000d1'), 2::bigint,
  'os aceites dos Termos e da Política ficam (X4)');
select is((select count(*) from avisos_email where tipo = 'conta_excluida' and para = 'u1.exclusao@teste.invalid'), 1::bigint,
  'o e-mail de confirmação vai para a fila');

-- ---------------------------------------------------------------------------
-- U2: anunciante sem pagamento (apagado inteiro)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"d2d2d2d2-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select lives_ok($$ select excluir_minha_conta(false) $$, 'o anunciante sem pagamento exclui a conta');
reset role;
select is((select count(*) from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000d2'), 0::bigint, 'sem pagamento, o anúncio é apagado inteiro');
select is((select count(*) from arquivos_para_apagar where chave = 'fotos/eeeeeeee-0000-0000-0000-0000000000d2/11111111-2222-3333-4444-555555555555'), 1::bigint,
  'a foto entra na fila de arquivos a apagar');
select is((select count(*) from eventos where id = (select id from ids where nome = 'do_u2')), 0::bigint, 'o evento sem pagamento é apagado');

-- ---------------------------------------------------------------------------
-- U3: comércio da Receita com extra pago (agenda, desiste, exclui no dia)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"d3d3d3d3-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((situacao_da_minha_conta() ->> 'pagoAte')::date, (interno.hoje() + interval '1 month')::date, 'o período pago vai até o vencimento do extra');
select is((situacao_da_minha_conta() ->> 'ultimoPagamento')::date, interno.hoje(), 'o último pagamento aparece, para o aviso dos 7 dias');
select is((excluir_minha_conta(true) ->> 'agendadaPara')::date, (interno.hoje() + interval '1 month')::date, 'a exclusão fica agendada para o fim do período pago');
select is((situacao_da_minha_conta() ->> 'exclusaoEm')::date, (interno.hoje() + interval '1 month')::date, 'a tela vê a data agendada');
reset role;
select is((select count(*) from avisos_email where tipo = 'exclusao_agendada' and para = 'u3.exclusao@teste.invalid'), 1::bigint,
  'o e-mail do agendamento vai para a fila');
insert into avisos_email (cidade_id, anunciante_id, tipo, referencia, para)
select cidade_id, id, 'extra_lembrete_7_dias', interno.hoje(), 'u3.exclusao@teste.invalid' from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000d3';
select is((select count(*) from avisos_email where tipo = 'extra_lembrete_7_dias' and anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000d3'), 0::bigint,
  'quem vai sair não recebe lembrete de renovação');

select set_config('request.jwt.claims', '{"sub":"d3d3d3d3-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select desistir_da_exclusao();
select is(situacao_da_minha_conta() ->> 'exclusaoEm', null, 'o anunciante desiste da exclusão agendada');
select lives_ok($$ select excluir_minha_conta(true) $$, 'e agenda de novo');
reset role;

-- O dia chega: o pg_cron aplica a exclusão.
update perfis_usuario set exclusao_em = interno.hoje() where usuario_id = 'd3d3d3d3-0000-0000-0000-0000000000d1';
select lives_ok($$ select interno.aplicar_exclusoes_agendadas() $$, 'a exclusão agendada roda no dia');
select is((select count(*) from auth.users where id = 'd3d3d3d3-0000-0000-0000-0000000000d1'), 0::bigint, 'a conta do U3 sai');
select is((select status::text from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000d3'), 'excluido',
  'com pagamento, fica o registro mínimo com a situação "excluido" (X2)');
select ok((select usuario_id is null and whatsapp is null and descricao = '' from anunciantes where id = 'eeeeeeee-0000-0000-0000-0000000000d3'),
  'o registro mínimo fica sem login, contatos nem descrição');
select is((select count(*) from pagamentos where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000d3'), 1::bigint, 'o pagamento fica, pela lei fiscal');
select is((select motivo_encerramento from extras_contratados where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000d3'), 'exclusao',
  'o extra em vigor acaba com o motivo "exclusao"');
select is((select count(*) from cnpjs_bloqueados where cnpj = '99888777000166'), 1::bigint, 'o CNPJ fica bloqueado para a importação (X5)');
select is((select count(*) from dados_receita where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000d3'), 0::bigint, 'os dados da Receita saem');
select is((select count(*) from nao_procurar where anunciante_id = 'eeeeeeee-0000-0000-0000-0000000000d3'), 1::bigint,
  'o registro mínimo sai da prospecção dos representantes');

-- ---------------------------------------------------------------------------
-- U4: organizador com evento avulso pago (X6)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"d4d4d4d4-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((situacao_da_minha_conta() ->> 'pagoAte')::date, interno.hoje() + 12, 'o período pago do organizador vai até o dia seguinte ao fim do evento');
select lives_ok($$ select excluir_minha_conta(false) $$, 'o organizador exclui a conta na hora');
reset role;
select ok((select situacao = 'cancelado' and usuario_id is null from eventos where id = (select id from ids where nome = 'paga')),
  'o evento pago fica cancelado, sem o organizador, pelo registro do pagamento');
select is((select count(*) from eventos where id = (select id from ids where nome = 'rascunho')), 0::bigint, 'o evento sem pagamento é apagado');

select * from finish();
rollback;
