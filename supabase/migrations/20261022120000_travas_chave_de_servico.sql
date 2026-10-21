-- Ajuste de 22/10/2026: o servidor, com a chave de serviço (convite do
-- cadastro assistido, tarefas), não conseguia gravar perfis: as travas de
-- colunas chamavam funções do esquema interno, sem acesso para a service_role.
-- Achado no teste de ponta a ponta do envio de fotos.

grant usage on schema interno to service_role;

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

create or replace function interno.proteger_conteudo() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Dois testes separados: num "or" o PostgreSQL pode calcular os dois lados,
  -- e a chave de serviço não precisa passar pela conferência de papel.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if interno.eh_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.situacao <> 'publicado' or new.removida_por is not null or new.removida_em is not null then
      raise exception 'Conteúdo novo entra publicado.';
    end if;
    new.enviada_por := auth.uid();
    return new;
  end if;
  if new.situacao is distinct from old.situacao
     or new.removida_por is distinct from old.removida_por
     or new.removida_em is distinct from old.removida_em
     or new.motivo_remocao is distinct from old.motivo_remocao
     or new.enviada_por is distinct from old.enviada_por
     or new.chave is distinct from old.chave
     or new.anunciante_id is distinct from old.anunciante_id then
    raise exception 'Este campo só pode ser alterado pela administração.';
  end if;
  return new;
end
$$;
