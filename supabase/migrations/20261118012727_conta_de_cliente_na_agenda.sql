-- Conta de cliente na Agenda (etapa C; decisões K1 a K3 de 17/11/2026):
-- - o cliente (papel anunciante, com ou sem anúncio) cadastra e edita os
--   próprios eventos: o evento avulso ligado à conta dele (usuario_id) e os do
--   comércio ou do artista que ele anuncia. Cria sempre como rascunho e publica
--   quando quiser; o evento só aparece na Agenda se estiver liberado
--   (interno.evento_liberado: pago, com a Agenda ou de artista anunciante) (K2);
-- - o evento publicado por um cliente vai direto para o site e entra em "Para
--   conferir" na administração (conferido_em vazio); qualquer mudança do cliente
--   num evento publicado o põe de novo na lista (K1);
-- - o representante cadastra rascunhos para os clientes e os edita até o
--   cliente publicar pela primeira vez (publicado_em), que vale como o aceite do
--   cliente (K3); quem publica é o cliente ou a equipe;
-- - escrever exige o aceite das versões em vigor dos Termos e da Política;
-- - o organizador do evento avulso (a conta do cliente) é escolhido pelo e-mail,
--   pela administração ou pelo representante no rascunho dele
--   (ligar_organizador_evento). Sem conta, o servidor manda o convite e liga.

alter table public.eventos
  add column conferido_em timestamptz,
  add column conferido_por uuid references auth.users (id) on delete set null,
  add column publicado_em timestamptz;

-- Os eventos que existem foram cadastrados pela equipe.
update public.eventos set conferido_em = now(), publicado_em = case when situacao = 'publicado' then now() end;
create index eventos_para_conferir_idx on public.eventos (cidade_id) where conferido_em is null;
create index eventos_conferido_por_idx on public.eventos (conferido_por) where conferido_por is not null;

-- ---------------------------------------------------------------------------
-- Quem é dono do evento
-- ---------------------------------------------------------------------------

/** O usuário aceitou as versões em vigor dos Termos de Uso e da Política de Privacidade. */
create function interno.cliente_aceitou_termos() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.aceitou_documento('termos') and interno.aceitou_documento('privacidade')
$$;

/** O evento é do cliente logado: a conta do organizador ou o anúncio dele (comércio ou artista). */
create function interno.evento_do_cliente(p_evento uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.tem_papel('anunciante') and exists (
    select 1 from public.eventos e
    where e.id = p_evento
      and (e.usuario_id = auth.uid()
           or exists (select 1 from public.anunciantes a where a.id = e.anunciante_id and a.usuario_id = auth.uid()))
  )
$$;

/** Evento cadastrado pelo representante logado (ele continua lendo depois de entregue ao cliente). */
create function interno.evento_do_representante(p_evento uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.meu_representante_id() is not null
    and exists (select 1 from public.eventos e where e.id = p_evento and e.criado_por = auth.uid())
$$;

/** Rascunho do representante logado, ainda não publicado pelo cliente: só aí ele edita (K3). */
create function interno.rascunho_do_representante(p_evento uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select interno.meu_representante_id() is not null
    and exists (
      select 1 from public.eventos e
      where e.id = p_evento and e.criado_por = auth.uid() and e.situacao = 'rascunho' and e.publicado_em is null
    )
$$;

-- ---------------------------------------------------------------------------
-- Travas de quem não é da administração
-- ---------------------------------------------------------------------------

/**
 * - Endereço (slug) livre na criação, para quem não enxerga todos os eventos.
 * - Quem cadastra, o representante, a cidade e o endereço não mudam pela tela.
 * - O dono do evento (organizador ou anúncio) só muda pela administração ou
 *   por ligar_organizador_evento.
 * - Evento publicado ou mudado por quem não é da administração volta para
 *   "Para conferir" (K1); a administração marca como conferido.
 * - publicado_em guarda a primeira publicação (fim da edição do representante).
 */
create function interno.proteger_evento() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  equipe boolean := interno.eh_admin() or coalesce(auth.role(), '') <> 'authenticated';
  base text;
  n integer := 2;
begin
  if tg_op = 'INSERT' then
    base := left(new.slug, 75);
    while exists (select 1 from public.eventos e where e.cidade_id = new.cidade_id and e.slug = new.slug) loop
      new.slug := base || '-' || n;
      n := n + 1;
    end loop;
    if equipe then
      new.conferido_em := now();
      new.conferido_por := auth.uid();
    else
      new.criado_por := auth.uid();
      new.representante_id := interno.meu_representante_id();
      new.conferido_em := null;
      new.conferido_por := null;
    end if;
    new.publicado_em := case when new.situacao = 'publicado' then now() end;
    return new;
  end if;

  new.publicado_em := coalesce(old.publicado_em, case when new.situacao = 'publicado' then now() end);
  if equipe then
    if new.conferido_em is distinct from old.conferido_em then
      new.conferido_em := case when new.conferido_em is null then null else now() end;
      new.conferido_por := case when new.conferido_em is null then null else auth.uid() end;
    else
      new.conferido_por := old.conferido_por;
    end if;
    return new;
  end if;

  if new.anunciante_id is distinct from old.anunciante_id then
    raise exception 'O anúncio do evento não muda. Cadastre outro evento.';
  end if;
  if new.usuario_id is distinct from old.usuario_id and current_setting('app.ligar_organizador', true) is distinct from 'sim' then
    raise exception 'Só a administração troca o organizador do evento.';
  end if;
  new.cidade_id := old.cidade_id;
  new.slug := old.slug;
  new.criado_por := old.criado_por;
  new.representante_id := old.representante_id;
  if old.situacao = 'publicado' or new.situacao = 'publicado' then
    new.conferido_em := null;
    new.conferido_por := null;
  else
    new.conferido_em := old.conferido_em;
    new.conferido_por := old.conferido_por;
  end if;
  return new;
end
$$;

create trigger proteger before insert or update on public.eventos for each row execute function interno.proteger_evento();

/** Programação ou barraca mudada por quem não é da administração num evento publicado: volta para "Para conferir" (K1). */
create function interno.marcar_evento_para_conferir() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if interno.eh_admin() or coalesce(auth.role(), '') <> 'authenticated' then
    return null;
  end if;
  update public.eventos set conferido_em = null
  where id = coalesce(new.evento_id, old.evento_id) and situacao = 'publicado' and conferido_em is not null;
  return null;
end
$$;

create trigger para_conferir after insert or update or delete on public.programacao_evento
  for each row execute function interno.marcar_evento_para_conferir();
create trigger para_conferir after insert or update or delete on public.barracas_evento
  for each row execute function interno.marcar_evento_para_conferir();

-- ---------------------------------------------------------------------------
-- Organizador e situação do evento
-- ---------------------------------------------------------------------------

/**
 * Liga o evento avulso à conta do cliente pelo e-mail: 'ligado'; 'sem_conta'
 * se o e-mail não tem conta (o servidor convida e chama de novo); e-mail vazio
 * desliga (só a administração), 'desligado'. Conta da equipe ou desativada não
 * organiza evento (uma conta, um papel).
 */
create function public.ligar_organizador_evento(p_evento uuid, p_email text) returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_origem public.origem_evento;
  v_usuario uuid;
  v_papel public.papel_usuario;
  v_ativo boolean;
begin
  if not (interno.eh_admin() or interno.rascunho_do_representante(p_evento)) then
    raise exception 'Só a administração ou o representante que cadastrou o rascunho escolhem o organizador.';
  end if;
  select e.origem into v_origem from public.eventos e where e.id = p_evento;
  if v_origem is null then
    raise exception 'Evento não encontrado.';
  end if;
  if v_origem <> 'avulso' then
    raise exception 'O evento do comércio ou do artista fica com a conta do anúncio.';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then
    if not interno.eh_admin() then
      raise exception 'Informe o e-mail do organizador.';
    end if;
  else
    select u.id, p.papel, p.ativo into v_usuario, v_papel, v_ativo
    from auth.users u
    join public.perfis_usuario p on p.usuario_id = u.id
    where lower(u.email) = lower(trim(p_email));
    if v_usuario is null then
      return 'sem_conta';
    end if;
    if v_papel <> 'anunciante' or not v_ativo then
      raise exception 'Este e-mail é de uma conta da equipe ou desativada. Use outro e-mail.';
    end if;
  end if;
  perform set_config('app.ligar_organizador', 'sim', true);
  update public.eventos set usuario_id = v_usuario where id = p_evento;
  perform set_config('app.ligar_organizador', '', true);
  return case when v_usuario is null then 'desligado' else 'ligado' end;
end
$$;

/**
 * Para quem cuida do evento (administração, cliente dono ou representante que
 * cadastrou): se aparece na Agenda, os blocos de 7 dias pagos e necessários e o
 * e-mail do organizador (este só para a administração e o representante).
 * null para quem não cuida do evento.
 */
create function public.situacao_do_evento(p_evento uuid) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'liberado', interno.evento_liberado(e.id),
    'blocosPagos', interno.blocos_pagos_do_evento(e.id),
    'blocos', interno.blocos_do_evento(e.data_inicio, e.data_fim),
    'organizador', case when interno.eh_admin() or interno.evento_do_representante(e.id)
                        then (select u.email from auth.users u where u.id = e.usuario_id) end
  )
  from public.eventos e
  where e.id = p_evento
    and (interno.eh_admin() or interno.evento_do_cliente(e.id) or interno.evento_do_representante(e.id))
$$;

revoke execute on function interno.cliente_aceitou_termos() from public, anon;
revoke execute on function interno.evento_do_cliente(uuid) from public, anon;
revoke execute on function interno.evento_do_representante(uuid) from public, anon;
revoke execute on function interno.rascunho_do_representante(uuid) from public, anon;
grant execute on function interno.cliente_aceitou_termos() to authenticated;
grant execute on function interno.evento_do_cliente(uuid) to authenticated;
grant execute on function interno.evento_do_representante(uuid) to authenticated;
grant execute on function interno.rascunho_do_representante(uuid) to authenticated;
revoke execute on function interno.proteger_evento() from public, anon, authenticated;
revoke execute on function interno.marcar_evento_para_conferir() from public, anon, authenticated;
revoke execute on function public.ligar_organizador_evento(uuid, text) from public, anon;
grant execute on function public.ligar_organizador_evento(uuid, text) to authenticated;
revoke execute on function public.situacao_do_evento(uuid) from public, anon;
grant execute on function public.situacao_do_evento(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: cliente (papel anunciante) e representante
-- ---------------------------------------------------------------------------

drop policy "anunciante lê os visíveis" on public.eventos;
drop policy "representante lê os visíveis" on public.eventos;

create policy "anunciante lê os visíveis e os seus" on public.eventos for select to authenticated
  using ((select interno.tem_papel('anunciante'))
         and (interno.evento_visivel(id)
              or usuario_id = (select auth.uid())
              or anunciante_id in (select a.id from public.anunciantes a where a.usuario_id = (select auth.uid()))));
create policy "anunciante cadastra os seus" on public.eventos for insert to authenticated
  with check ((select interno.tem_papel('anunciante')) and (select interno.cliente_aceitou_termos()) and situacao = 'rascunho'
              and ((origem = 'avulso' and anunciante_id is null and usuario_id = (select auth.uid()))
                   or (origem in ('comercio', 'artista') and usuario_id is null
                       and anunciante_id in (select a.id from public.anunciantes a where a.usuario_id = (select auth.uid())))));
create policy "anunciante altera os seus" on public.eventos for update to authenticated
  using ((select interno.tem_papel('anunciante'))
         and (usuario_id = (select auth.uid())
              or anunciante_id in (select a.id from public.anunciantes a where a.usuario_id = (select auth.uid()))))
  with check ((select interno.tem_papel('anunciante')) and (select interno.cliente_aceitou_termos())
              and (usuario_id = (select auth.uid())
                   or anunciante_id in (select a.id from public.anunciantes a where a.usuario_id = (select auth.uid()))));

create policy "representante lê os visíveis e os que cadastrou" on public.eventos for select to authenticated
  using ((select interno.meu_representante_id()) is not null and (interno.evento_visivel(id) or criado_por = (select auth.uid())));
create policy "representante cadastra rascunhos" on public.eventos for insert to authenticated
  with check ((select interno.meu_representante_id()) is not null and situacao = 'rascunho' and usuario_id is null
              and origem in ('avulso', 'comercio', 'artista'));
create policy "representante altera os rascunhos dele" on public.eventos for update to authenticated
  using ((select interno.meu_representante_id()) is not null and criado_por = (select auth.uid()) and situacao = 'rascunho' and publicado_em is null)
  with check ((select interno.meu_representante_id()) is not null and situacao = 'rascunho');

drop policy "anunciante lê dos eventos visíveis" on public.programacao_evento;
drop policy "representante lê dos eventos visíveis" on public.programacao_evento;
create policy "anunciante lê dos visíveis e dos seus" on public.programacao_evento for select to authenticated
  using ((select interno.tem_papel('anunciante')) and (interno.evento_visivel(evento_id) or interno.evento_do_cliente(evento_id)));
create policy "anunciante altera a dos seus" on public.programacao_evento for all to authenticated
  using (interno.evento_do_cliente(evento_id) and (select interno.cliente_aceitou_termos()))
  with check (interno.evento_do_cliente(evento_id) and (select interno.cliente_aceitou_termos()));
create policy "representante lê dos visíveis e dos que cadastrou" on public.programacao_evento for select to authenticated
  using ((select interno.meu_representante_id()) is not null and (interno.evento_visivel(evento_id) or interno.evento_do_representante(evento_id)));
create policy "representante altera a dos rascunhos dele" on public.programacao_evento for all to authenticated
  using (interno.rascunho_do_representante(evento_id)) with check (interno.rascunho_do_representante(evento_id));

drop policy "anunciante lê dos eventos visíveis" on public.barracas_evento;
drop policy "representante lê dos eventos visíveis" on public.barracas_evento;
create policy "anunciante lê dos visíveis e dos seus" on public.barracas_evento for select to authenticated
  using ((select interno.tem_papel('anunciante')) and (interno.evento_visivel(evento_id) or interno.evento_do_cliente(evento_id)));
create policy "anunciante altera as dos seus" on public.barracas_evento for all to authenticated
  using (interno.evento_do_cliente(evento_id) and (select interno.cliente_aceitou_termos()))
  with check (interno.evento_do_cliente(evento_id) and (select interno.cliente_aceitou_termos()));
create policy "representante lê dos visíveis e dos que cadastrou" on public.barracas_evento for select to authenticated
  using ((select interno.meu_representante_id()) is not null and (interno.evento_visivel(evento_id) or interno.evento_do_representante(evento_id)));
create policy "representante altera as dos rascunhos dele" on public.barracas_evento for all to authenticated
  using (interno.rascunho_do_representante(evento_id)) with check (interno.rascunho_do_representante(evento_id));
