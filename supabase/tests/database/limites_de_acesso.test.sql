-- Bloqueio de login e limites de requisições (migration 20261021160000).
-- Roda com: supabase test db (local) ou supabase test db --linked.
-- Tudo dentro de uma transação desfeita no fim: não deixa dados no banco.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

-- Só o servidor (service_role) executa as funções.
select ok(not has_function_privilege('anon', 'public.registrar_falha_login(text)', 'execute'), 'visitante não registra falha de login');
select ok(not has_function_privilege('authenticated', 'public.login_bloqueado_ate(text)', 'execute'), 'usuário logado não consulta bloqueio');
select ok(not has_function_privilege('anon', 'public.consumir_limite(text, integer, integer)', 'execute'), 'visitante não consome limite');
select ok(has_function_privilege('service_role', 'public.registrar_falha_login(text)', 'execute'), 'servidor registra falha de login');

-- 4 falhas seguidas não bloqueiam; a 5ª bloqueia por 15 minutos.
select is(registrar_falha_login('Teste.Bloqueio@Exemplo.com'), null, '1ª falha não bloqueia');
select registrar_falha_login('teste.bloqueio@exemplo.com') from generate_series(1, 3);
select is(login_bloqueado_ate(' teste.bloqueio@exemplo.com '), null, '4 falhas não bloqueiam (e-mail normalizado)');
-- A função fica numa subconsulta para ser chamada uma vez só: "x between a and b"
-- vira "x >= a and x <= b" e a chamaria duas vezes.
select ok((select fim between now() + interval '14 minutes 59 seconds' and now() + interval '15 minutes 1 second'
  from (select registrar_falha_login('teste.bloqueio@exemplo.com') as fim) as quinta), '5ª falha bloqueia por 15 minutos');
select isnt(login_bloqueado_ate('teste.bloqueio@exemplo.com'), null, 'conta bloqueada');

-- Bloqueio vencido: a contagem recomeça.
update tentativas_login set bloqueado_ate = now() - interval '1 second' where chave = 'email:teste.bloqueio@exemplo.com';
select is(login_bloqueado_ate('teste.bloqueio@exemplo.com'), null, 'bloqueio vencido libera a conta');
select is(registrar_falha_login('teste.bloqueio@exemplo.com'), null, 'depois do bloqueio, a contagem recomeça');
select is((select falhas from tentativas_login where chave = 'email:teste.bloqueio@exemplo.com'), 1, 'contagem recomeçou em 1');

-- Entrada certa zera as falhas.
select limpar_falhas_login('teste.bloqueio@exemplo.com');
select is((select count(*)::integer from tentativas_login where chave = 'email:teste.bloqueio@exemplo.com'), 0, 'entrada certa zera as falhas');

-- Limite por janela: 3 dentro, a 4ª fora.
select is(array_agg(consumir_limite('teste:limite', 3, 3600)), array[true, true, true], '3 requisições dentro do limite')
from generate_series(1, 3);
select is(consumir_limite('teste:limite', 3, 3600), false, 'a 4ª passa do limite');
select is(consumir_limite('teste:outra-chave', 3, 3600), true, 'cada chave tem a sua contagem');
select throws_ok($$ select consumir_limite('', 3, 3600) $$, 'P0001', 'consumir_limite: parâmetros inválidos', 'chave vazia é recusada');

select * from finish();
rollback;
