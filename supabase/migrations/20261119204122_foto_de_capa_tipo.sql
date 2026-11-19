-- Foto de capa do perfil do anunciante (decisão de 19/11/2026, no lugar da 1ª
-- foto da galeria como capa). O valor novo do tipo fica numa migration própria:
-- o Postgres só deixa usá-lo depois que a transação que o criou termina.
alter type public.finalidade_foto add value if not exists 'capa';
