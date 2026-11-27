-- Fundador só no anual (migration 20261127163040): o contexto da proposta diz
-- se o anunciante é a exceção M1 (virou Fundador por um pagamento mensal), e os
-- Termos de Uso em vigor são a versão 4. Tudo numa transação desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'adm.anual@teste.invalid', 'authenticated', 'authenticated');
update perfis_usuario set papel = 'administrador', nome = 'Adm Anual' where usuario_id = 'aaaaaaaa-0000-0000-0000-0000000000a4';

-- Dois autônomos em análise: um vira Fundador pelo mensal (como a AP Advocacia, em 25/11), o outro pelo anual.
insert into anunciantes (id, cidade_id, tipo, slug, nome, status, categoria_principal_id, plano_escolhido_id)
select v.id::uuid, c.id, 'profissional', v.slug, v.nome, 'em_analise',
       (select id from categorias where ativa and tipo in ('profissional', 'ambos') limit 1),
       (select id from planos where cidade_id = c.id and tipo = 'profissional' and valor_mensal_centavos > 0 order by nivel limit 1)
from (values ('eeeeeeee-0000-0000-0000-0000000000a1', 'autonomo-teste-anual-1', 'Autônomo Teste Mensal'),
             ('eeeeeeee-0000-0000-0000-0000000000a2', 'autonomo-teste-anual-2', 'Autônomo Teste Anual'))
       as v (id, slug, nome)
cross join (select id from cidades where slug = 'rio-das-ostras') c;

create function public.teste_pagar_fundador(p_anunciante uuid, p_periodicidade text) returns uuid language sql as $$
  select public.registrar_pagamento_plano(a.id, a.plano_escolhido_id, p_periodicidade, 1, null, '2026-11-27', '2026-11-27',
      case when p_periodicidade = 'anual' then date '2027-11-27' else date '2026-12-27' end,
      p.valor_mensal_centavos, 0, 'pix', 1, null, '2026-11-25', '2026-11-25', null, '', null,
      date '2026-11-27', true,
      null, null, null, null, null, null, null, null, null, 0, '[]'::jsonb)
  from public.anunciantes a join public.planos p on p.id = a.plano_escolhido_id where a.id = p_anunciante
$$;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a4","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select lives_ok($$ select teste_pagar_fundador('eeeeeeee-0000-0000-0000-0000000000a1', 'mensal');
                   select teste_pagar_fundador('eeeeeeee-0000-0000-0000-0000000000a2', 'anual') $$,
  'os dois pagamentos são registrados');
select is((contexto_da_proposta('eeeeeeee-0000-0000-0000-0000000000a1') -> 'anunciante' ->> 'fundadorPeloMensal')::boolean, true,
  'quem virou Fundador pelo mensal é a exceção M1');
select is((contexto_da_proposta('eeeeeeee-0000-0000-0000-0000000000a2') -> 'anunciante' ->> 'fundadorPeloMensal')::boolean, false,
  'quem virou Fundador pelo anual não é a exceção');
reset role;

select is((select versao from documentos_legais where documento = 'termos' order by vigente_desde desc limit 1), '4',
  'os Termos de Uso em vigor são a versão 4');

select * from finish();
rollback;
