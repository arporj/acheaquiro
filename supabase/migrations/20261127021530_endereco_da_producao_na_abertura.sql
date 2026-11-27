-- Abertura ao público (27/11/2026): a produção sai de prod.acheaquiro.com.br e vai
-- para acheaquiro.com.br. A exclusão agendada chama o site por POST para apagar os
-- arquivos da fila, e um POST que passa por redirecionamento pode chegar como GET:
-- por isso o endereço é trocado aqui, e não deixado para o redirecionamento do prod.
-- O resto da função é igual ao da migration 20261124162128.

create or replace function interno.aplicar_exclusoes_agendadas() returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  for v_usuario in select p.usuario_id from public.perfis_usuario p where p.exclusao_em <= interno.hoje() loop
    perform interno.executar_exclusao(v_usuario);
  end loop;
  if exists (select 1 from public.arquivos_para_apagar) then
    perform net.http_post(
      url := 'https://acheaquiro.com.br/api/tarefas/apagar-arquivos',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  end if;
end
$$;

revoke execute on function interno.aplicar_exclusoes_agendadas() from public, anon, authenticated;
