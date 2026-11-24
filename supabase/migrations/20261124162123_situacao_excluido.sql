-- Situação "excluido" do anunciante (decisões X1 a X6 de 24/11/2026): o registro
-- mínimo que fica, pela lei fiscal, de quem excluiu a conta depois de pagar.
-- Fica numa migration própria: o PostgreSQL não usa um valor novo de enum na
-- mesma transação em que ele foi criado (migration 20261124162128).
alter type public.status_anunciante add value if not exists 'excluido';
