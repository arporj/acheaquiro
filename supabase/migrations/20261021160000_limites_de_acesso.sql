-- Limites de acesso (Especificação Técnica, seções 6.2 e 10.3), usados pelo
-- servidor do site no login e na recuperação de senha:
-- - bloqueio da conta por 15 minutos depois de 5 senhas erradas seguidas;
-- - limite por chave e janela de tempo (20 tentativas de login por IP a cada
--   15 minutos, 3 pedidos de nova senha por e-mail por hora), reaproveitado
--   depois no cadastro, na denúncia e nos uploads.
--
-- Só a chave service_role (servidor) executa estas funções. Liberadas para o
-- visitante, qualquer pessoa poderia bloquear a conta dos outros ou gastar o
-- limite de um IP chamando o banco direto, sem passar pelo Turnstile.
--
-- O Supabase Auth também confere o Turnstile em toda entrada e recuperação de
-- senha (supabase/config.toml), inclusive nas chamadas diretas que não passam
-- por aqui.

/** Chave de tentativas_login: o e-mail sem espaços e em minúsculas. */
create function interno.chave_login(p_email text) returns text
language sql immutable
set search_path = ''
as $$
  select 'email:' || lower(trim(p_email))
$$;

/**
 * Conta mais uma requisição na janela atual e diz se ainda está dentro do
 * limite. Janelas fixas (por exemplo, de 15 em 15 minutos); a contagem é
 * atômica (insert ... on conflict), sem corrida entre requisições simultâneas.
 */
create function public.consumir_limite(p_chave text, p_limite integer, p_janela_segundos integer) returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  inicio timestamptz;
  total integer;
begin
  if p_chave is null or length(p_chave) = 0 or length(p_chave) > 300 or p_limite < 1 or p_janela_segundos < 1 then
    raise exception 'consumir_limite: parâmetros inválidos';
  end if;
  inicio := to_timestamp(floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos);
  insert into public.limites_requisicoes as l (chave, janela_inicio, contagem)
  values (p_chave, inicio, 1)
  on conflict (chave, janela_inicio) do update set contagem = l.contagem + 1
  returning contagem into total;
  return total <= p_limite;
end
$$;

/** Até quando a conta está bloqueada; vazio quando pode tentar. */
create function public.login_bloqueado_ate(p_email text) returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select t.bloqueado_ate
  from public.tentativas_login t
  where t.chave = interno.chave_login(p_email) and t.bloqueado_ate > now()
$$;

/**
 * Registra uma senha errada. Na 5ª seguida, bloqueia a conta por 15 minutos e
 * devolve o fim do bloqueio; antes disso, devolve vazio. Depois que um bloqueio
 * acaba, a contagem recomeça do zero.
 */
create function public.registrar_falha_login(p_email text) returns timestamptz
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  falhas_agora integer;
  fim timestamptz;
begin
  insert into public.tentativas_login as t (chave, falhas)
  values (interno.chave_login(p_email), 1)
  on conflict (chave) do update set
    falhas = case when t.bloqueado_ate is not null and t.bloqueado_ate <= now() then 1 else t.falhas + 1 end,
    bloqueado_ate = case when t.bloqueado_ate is not null and t.bloqueado_ate <= now() then null else t.bloqueado_ate end
  returning falhas into falhas_agora;

  if falhas_agora >= 5 then
    fim := now() + interval '15 minutes';
    update public.tentativas_login set falhas = 0, bloqueado_ate = fim where chave = interno.chave_login(p_email);
  end if;
  return fim;
end
$$;

/** Entrada certa: zera as falhas seguidas. */
create function public.limpar_falhas_login(p_email text) returns void
language sql volatile security definer
set search_path = ''
as $$
  delete from public.tentativas_login where chave = interno.chave_login(p_email)
$$;

revoke execute on function public.consumir_limite(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.login_bloqueado_ate(text) from public, anon, authenticated;
revoke execute on function public.registrar_falha_login(text) from public, anon, authenticated;
revoke execute on function public.limpar_falhas_login(text) from public, anon, authenticated;
revoke execute on function interno.chave_login(text) from public, anon, authenticated;
grant execute on function public.consumir_limite(text, integer, integer) to service_role;
grant execute on function public.login_bloqueado_ate(text) to service_role;
grant execute on function public.registrar_falha_login(text) to service_role;
grant execute on function public.limpar_falhas_login(text) to service_role;
