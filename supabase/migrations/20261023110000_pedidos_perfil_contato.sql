-- Pedidos sobre o perfil (decisão de 23/10/2026): e-mail e telefone separados.
-- O e-mail recebe o convite do cadastro assistido depois da conferência; o
-- telefone é para a equipe falar com quem pediu. Quem pede "assumir" ou
-- "remover" declara ser o responsável pelo comércio. A tabela ainda está vazia.

alter table public.pedidos_perfil
  drop constraint pedidos_perfil_check,
  drop column contato,
  add column email text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  add column telefone text check (telefone ~ '^[0-9]{10,13}$'),
  add column declarou_responsavel boolean not null default false,
  add constraint pedidos_perfil_dados_de_quem_pede check (
    tipo = 'fechou' or (nome is not null and email is not null and telefone is not null and declarou_responsavel)
  );
