-- Dia em que o patrocínio foi encerrado, para o histórico da administração
-- (27/10/2026): a tela principal mostra só os rascunhos e os que estão no ar, e
-- o histórico mostra os encerrados. O fim do contrato (fim) continua o mesmo;
-- o encerramento pode vir antes dele.

alter table public.patrocinios add column encerrado_em timestamptz;

-- Os já encerrados: o momento vem do registro de alterações (sem registro, agora).
update public.patrocinios p
set encerrado_em = coalesce((
  select max(a.criado_em) from public.auditoria a
  where a.tabela = 'patrocinios' and a.registro_id = p.id::text and a.acao = 'update'
    and a.depois ->> 'situacao' = 'encerrado' and a.antes ->> 'situacao' is distinct from 'encerrado'
), now())
where p.situacao = 'encerrado';

alter table public.patrocinios
  add constraint patrocinios_encerrado_em check ((situacao = 'encerrado') = (encerrado_em is not null));
