-- Comércio importado fechado por um representante (decisões Z1, Z3 e Z4, de
-- 24/10/2026):
-- - "Fechei com este comércio" cria um rascunho copiado do importado e ligado
--   a ele (importado_id). O representante faz o cadastro completo nesse
--   rascunho e envia o convite pelo fluxo do cadastro assistido;
-- - até o comerciante aceitar, o site continua mostrando o importado, só com
--   os dados da Receita. Quando o comerciante aceita (o rascunho passa para
--   "em análise"), o banco troca o importado pelo cadastro novo: o endereço do
--   perfil, os dados da Receita e o histórico de atendimento passam para ele,
--   que vai para o ar na hora, marcado para a equipe conferir depois;
-- - os outros representantes veem "Em cadastro por fulano" e não pegam o
--   comércio por 7 dias. Sem convite nesse prazo, ele volta para a prospecção
--   (conferido na hora de cada consulta, sem tarefa agendada). Com o convite
--   enviado, fica "em atendimento" até o comerciante aceitar.
-- Substitui a conversão direta da migration 20261024110000.

drop function public.preparar_conversao_importado(uuid, text);
drop function public.vincular_conta_importado(uuid, uuid);

alter table public.anunciantes
  -- Rascunho que vai substituir o comércio importado quando o comerciante aceitar.
  add column importado_id uuid unique references public.anunciantes (id) on delete set null,
  -- Foi ao ar sem a aprovação prévia da equipe (importado assumido): aparece em "Para analisar".
  add column revisar boolean not null default false;

/** Só a administração e as funções do banco mudam a ligação com o importado e a marcação de revisar. */
create function interno.proteger_importado() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or interno.eh_admin()
     or current_setting('app.vinculo_convite', true) = 'sim' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.importado_id is not null or new.revisar then
      raise exception 'O cadastro do comércio importado começa pelo botão da prospecção.';
    end if;
  elsif new.importado_id is distinct from old.importado_id or new.revisar is distinct from old.revisar then
    raise exception 'Este campo só pode ser alterado pela administração.';
  end if;
  return new;
end
$$;

create trigger proteger_importado before insert or update on public.anunciantes
for each row execute function interno.proteger_importado();

-- ---------------------------------------------------------------------------
-- "Fechei com este comércio"
-- ---------------------------------------------------------------------------

/** Dias que o representante tem para enviar o convite depois de fechar com o comércio. */
create function interno.dias_reserva_importado() returns integer
language sql immutable
as $$ select 7 $$;

/**
 * Cria o rascunho do representante para o comércio importado (ou devolve o que
 * ele já tem). Recusa se outro representante está com o comércio: em cadastro
 * há menos de 7 dias ou com o convite já enviado. Rascunho de outro
 * representante com a reserva vencida e sem convite é apagado.
 */
create function public.assumir_importado(p_importado uuid) returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  rep uuid := interno.meu_representante_id();
  imp record;
  copia record;
  novo uuid;
begin
  if rep is null then
    raise exception 'Só o representante fecha com um comércio da prospecção.';
  end if;
  select a.* into imp from public.anunciantes a where a.id = p_importado for update;
  if imp.id is null or imp.origem <> 'receita' or imp.status <> 'publicado' or imp.usuario_id is not null then
    raise exception 'Este comércio não está na prospecção.';
  end if;
  if exists (select 1 from public.nao_procurar n where n.anunciante_id = p_importado) then
    raise exception 'Este comércio pediu para não ser mais procurado.';
  end if;

  select a.id, a.representante_id, a.usuario_id, a.criado_em into copia
  from public.anunciantes a where a.importado_id = p_importado;
  if copia.id is not null then
    if copia.representante_id = rep then
      return copia.id;
    end if;
    if copia.usuario_id is not null then
      raise exception 'Este comércio já está em atendimento por outro representante.';
    end if;
    if copia.criado_em > now() - make_interval(days => interno.dias_reserva_importado()) then
      raise exception 'Este comércio está em cadastro por outro representante até %.',
        to_char((copia.criado_em + make_interval(days => interno.dias_reserva_importado())) at time zone 'America/Sao_Paulo', 'DD/MM');
    end if;
    delete from public.anunciantes where id = copia.id;
  end if;

  perform set_config('app.vinculo_convite', 'sim', true);
  insert into public.anunciantes (
    cidade_id, tipo, slug, nome, representante_id, cadastrado_por, status, origem, importado_id,
    categoria_principal_id, descricao, whatsapp, telefone, instagram, formas_pagamento, site_proprio,
    faz_entrega, entrega_toda_cidade
  ) values (
    imp.cidade_id, imp.tipo, left(imp.slug, 73) || '-' || substr(md5(gen_random_uuid()::text), 1, 6), imp.nome, rep, auth.uid(),
    'rascunho', 'cadastro', p_importado,
    imp.categoria_principal_id, imp.descricao, imp.whatsapp, imp.telefone, imp.instagram, imp.formas_pagamento, imp.site_proprio,
    imp.faz_entrega, imp.entrega_toda_cidade
  ) returning id into novo;
  insert into public.enderecos (anunciante_id, cidade_id, logradouro, numero, complemento, bairro_id, local, principal)
  select novo, e.cidade_id, e.logradouro, e.numero, e.complemento, e.bairro_id, e.local, e.principal
  from public.enderecos e where e.anunciante_id = p_importado;
  perform set_config('app.vinculo_convite', '', true);
  return novo;
end
$$;

/**
 * Situação de cada comércio da prospecção: quem está com ele, desde quando e
 * se o convite já saiu. O representante não lê os rascunhos dos outros; aqui
 * vê só o nome e as datas.
 */
create function public.situacao_importados(p_importados uuid[])
returns table (importado_id uuid, autor_nome text, desde timestamptz, ate timestamptz, convite_enviado boolean, meu_rascunho uuid)
language sql stable security definer
set search_path = ''
as $$
  select a.importado_id,
         coalesce(nullif(p.nome, ''), r.codigo),
         a.criado_em,
         a.criado_em + make_interval(days => interno.dias_reserva_importado()),
         a.usuario_id is not null,
         case when a.representante_id = interno.meu_representante_id() then a.id end
  from public.anunciantes a
  join public.representantes r on r.id = a.representante_id
  left join public.perfis_usuario p on p.usuario_id = r.usuario_id
  where a.importado_id = any (p_importados)
    and (interno.meu_representante_id() is not null or interno.eh_admin())
$$;

-- ---------------------------------------------------------------------------
-- Aceite do comerciante: o cadastro novo substitui o importado
-- ---------------------------------------------------------------------------

create function interno.trocar_importado() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  imp record;
begin
  select a.id, a.slug, a.usuario_id into imp from public.anunciantes a where a.id = new.importado_id for update;
  if imp.id is null then
    return null;
  end if;
  if imp.usuario_id is not null then
    raise exception 'O comércio importado já tem dono. Fale com a equipe.';
  end if;
  perform set_config('app.vinculo_convite', 'sim', true);
  update public.dados_receita set anunciante_id = new.id where anunciante_id = imp.id;
  update public.atendimentos set anunciante_id = new.id where anunciante_id = imp.id;
  delete from public.anunciantes where id = imp.id;
  update public.anunciantes
  set slug = imp.slug, status = 'publicado', aprovado_em = now(), revisar = true, importado_id = null
  where id = new.id;
  perform set_config('app.vinculo_convite', '', true);
  return null;
end
$$;

create trigger trocar_importado after update of status on public.anunciantes
for each row
when (new.importado_id is not null and new.status = 'em_analise' and old.status is distinct from 'em_analise')
execute function interno.trocar_importado();

revoke execute on function public.assumir_importado(uuid) from public, anon;
grant execute on function public.assumir_importado(uuid) to authenticated;
revoke execute on function public.situacao_importados(uuid[]) from public, anon;
grant execute on function public.situacao_importados(uuid[]) to authenticated;
