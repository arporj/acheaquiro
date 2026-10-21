-- Cadastro assistido (administração, fase 2; decisões de 22/10/2026):
-- - Termos de Uso e Política de Privacidade, versão 1, com o texto no
--   repositório (apps/web/src/conteudo) e endereço fixo;
-- - plano escolhido e periodicidade no cadastro (H4), para mostrar o valor e
--   para o Pix e a comissão usarem depois; o plano em vigor (plano_id)
--   continua sendo só da administração;
-- - e-mail do convite e motivo do pedido de correção;
-- - ligação da conta convidada ao cadastro, conferindo que a conta é a do
--   e-mail convidado.

insert into public.documentos_legais (documento, versao, vigente_desde, texto_url) values
  ('termos', '1', '2026-10-22', '/termos/v1'),
  ('privacidade', '1', '2026-10-22', '/privacidade/v1');

alter table public.anunciantes
  add column email_convite text check (email_convite ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email_convite) <= 254),
  add column plano_escolhido_id uuid references public.planos (id),
  add column periodicidade_escolhida text check (periodicidade_escolhida in ('mensal', 'anual')),
  -- Último pedido de correção da administração, mostrado ao anunciante.
  add column motivo_correcao text check (length(motivo_correcao) <= 1000);

-- Mesma trava da migration 20261022120000, com a ligação do convite e o motivo de correção.
create or replace function interno.proteger_anunciante() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rep uuid;
begin
  -- Dois testes separados: num "or" o PostgreSQL pode calcular os dois lados,
  -- e a chave de serviço não precisa passar pela conferência de papel.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  -- Ligação da conta convidada (vincular_conta_anunciante), já conferida pela função.
  if current_setting('app.vinculo_convite', true) = 'sim' then
    return new;
  end if;
  if interno.eh_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    rep := interno.meu_representante_id();
    if rep is not null then
      -- Cadastro assistido pelo representante: rascunho vinculado a ele. A conta do
      -- anunciante é ligada pelo servidor, ao enviar o convite (chave de serviço).
      if new.representante_id is distinct from rep or new.status <> 'rascunho' or new.usuario_id is not null then
        raise exception 'O representante só cria rascunhos vinculados a ele, sem conta ligada.';
      end if;
    elsif new.representante_id is not null or new.status <> 'rascunho' or new.usuario_id is distinct from auth.uid() then
      raise exception 'O cadastro começa como rascunho da própria conta.';
    end if;
    if new.plano_id is not null or new.fundador or new.aprovado_em is not null or new.aprovado_por is not null then
      raise exception 'Plano, Fundador e aprovação são definidos pela administração.';
    end if;
    new.cadastrado_por := auth.uid();
    return new;
  end if;

  if new.plano_id is distinct from old.plano_id
     or new.fundador is distinct from old.fundador
     or new.fundador_desde is distinct from old.fundador_desde
     or new.representante_id is distinct from old.representante_id
     or new.aprovado_em is distinct from old.aprovado_em
     or new.aprovado_por is distinct from old.aprovado_por
     or new.slug is distinct from old.slug
     or new.cidade_id is distinct from old.cidade_id
     or new.tipo is distinct from old.tipo
     or new.cadastrado_por is distinct from old.cadastrado_por
     or new.motivo_correcao is distinct from old.motivo_correcao
     or new.usuario_id is distinct from old.usuario_id then
    raise exception 'Este campo só pode ser alterado pela administração.';
  end if;

  if new.status is distinct from old.status and not (
    (old.status in ('rascunho', 'aguardando_anunciante') and new.status = 'em_analise' and old.usuario_id = auth.uid())
    or (old.status = 'publicado' and new.status = 'pausado')
    or (old.status = 'pausado' and new.status = 'publicado')
  ) then
    raise exception 'Mudança de situação não permitida: %', new.status;
  end if;
  return new;
end
$$;

/**
 * Liga a conta recém-convidada ao cadastro e passa a situação para
 * "aguardando o anunciante". Quem chama é quem pode editar o cadastro
 * (representante que o trouxe, enquanto rascunho, ou administrador). A conta
 * precisa ser a do e-mail do convite, ainda sem senha criada e sem outro
 * cadastro ligado: assim ninguém liga um rascunho à conta de outra pessoa.
 */
create function public.vincular_conta_anunciante(p_anunciante uuid, p_usuario uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  cadastro record;
begin
  select a.id, a.status, a.email_convite, a.usuario_id into cadastro from public.anunciantes a where a.id = p_anunciante;
  if cadastro.id is null or not interno.pode_editar_anunciante(p_anunciante) then
    raise exception 'Cadastro não encontrado ou sem permissão.';
  end if;
  if cadastro.status not in ('rascunho', 'aguardando_anunciante') then
    raise exception 'Este cadastro já foi assumido pelo anunciante.';
  end if;
  if cadastro.usuario_id is not null and cadastro.usuario_id <> p_usuario then
    raise exception 'Este cadastro já está ligado a outra conta.';
  end if;
  if not exists (
    select 1 from auth.users u
    join public.perfis_usuario p on p.usuario_id = u.id
    where u.id = p_usuario
      and lower(u.email) = lower(cadastro.email_convite)
      and u.email_confirmed_at is null
      and p.papel = 'anunciante'
  ) then
    raise exception 'A conta não corresponde ao e-mail convidado.';
  end if;
  if exists (select 1 from public.anunciantes a where a.usuario_id = p_usuario and a.id <> p_anunciante) then
    raise exception 'Esta conta já tem outro cadastro.';
  end if;
  perform set_config('app.vinculo_convite', 'sim', true);
  update public.anunciantes set usuario_id = p_usuario, status = 'aguardando_anunciante' where id = p_anunciante;
  perform set_config('app.vinculo_convite', '', true);
end
$$;

revoke execute on function public.vincular_conta_anunciante(uuid, uuid) from public, anon;
grant execute on function public.vincular_conta_anunciante(uuid, uuid) to authenticated;
