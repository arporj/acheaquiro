-- Usuário do banco só para o backup diário (Especificação Técnica, seção 11;
-- .github/workflows/backup.yml). Lê tudo e não altera nada: se a senha vazar
-- do GitHub, ninguém consegue mudar nem apagar dados.
-- - pg_read_all_data: leitura de todas as tabelas, inclusive as do Auth;
-- - bypassrls: sem isso, o RLS esconderia as linhas e o backup sairia vazio.
-- Criado sem login. A senha não fica no repositório: é definida fora da
-- migration (alter role backup_leitura login password ...) e guardada só no
-- segredo BACKUP_DB_PASSWORD do GitHub e no apps/web/.env.local.
create role backup_leitura nologin bypassrls;
grant pg_read_all_data to backup_leitura;
