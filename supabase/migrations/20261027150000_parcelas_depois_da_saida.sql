-- Representante que sai continua recebendo as parcelas de venda (decisão O1,
-- 27/10/2026): só a carteira acaba. A assinatura guarda quem vendeu o plano
-- (assinaturas.representante_id) e deixa de ser limpa na saída; os anunciantes
-- continuam ficando sem representante, e a carteira exige representante ativo
-- (registrar_pagamento_plano).

create or replace function interno.encerrar_carteira() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform set_config('app.vinculo_convite', 'sim', true);
  -- Os rascunhos sem conta ligada continuam com ele, para a equipe decidir o que fazer.
  update public.anunciantes set representante_id = null where representante_id = new.id and usuario_id is not null;
  perform set_config('app.vinculo_convite', '', true);
  return null;
end
$$;
