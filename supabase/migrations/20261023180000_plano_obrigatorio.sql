-- Plano obrigatório no cadastro (decisão de 23/10/2026):
-- - todo comércio começa no plano Gratuito (plano em vigor desde o cadastro);
-- - o autônomo escolhe um plano para se cadastrar (o plano em vigor vem com o Pix).
-- O gatilho roda depois de "proteger" (ordem alfabética dos gatilhos), que
-- recusa plano_id vindo de quem não é administrador; aqui o banco mesmo o preenche.

create function interno.plano_inicial() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'comercio' and new.plano_id is null then
    select p.id into new.plano_id
    from public.planos p
    where p.cidade_id = new.cidade_id and p.tipo = 'comercio' and p.ativo and p.valor_mensal_centavos = 0
    order by p.nivel
    limit 1;
    if new.plano_id is null then
      raise exception 'A cidade não tem plano Gratuito de comércio ativo.';
    end if;
  end if;
  if new.tipo = 'comercio' and new.plano_escolhido_id is null then
    new.plano_escolhido_id := new.plano_id;
  end if;
  return new;
end
$$;

create trigger zz_plano_inicial before insert on public.anunciantes
for each row execute function interno.plano_inicial();

alter table public.anunciantes
  add constraint anunciantes_comercio_com_plano check (tipo <> 'comercio' or plano_id is not null),
  add constraint anunciantes_autonomo_com_plano check (tipo <> 'profissional' or plano_id is not null or plano_escolhido_id is not null);
