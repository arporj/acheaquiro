-- Contatos registrados e acompanhamento (decisão de 02/11/2026): o
-- representante vê todos os contatos que registrou, com a etapa em que cada
-- comércio está hoje; a administração vê os de todos e um resumo por pessoa.
-- Funções security definer porque a etapa olha cadastros e pagamentos que o
-- representante não lê direto (o cadastro feito por outro representante, por
-- exemplo). A regra de quem vê o quê é a mesma da tabela atendimentos: o
-- representante, só os próprios registros; o administrador, todos.
--
-- Etapa do comércio, na ordem em que é decidida:
-- - nao_procurar: pediu para não ser mais procurado.
-- - plano_pago: tem pagamento de plano válido (não devolvido).
-- - convite_enviado / em_cadastro: alguém fechou com ele e o cadastro está em
--   andamento, com ou sem o convite enviado ao comerciante.
-- - prospeccao: comércio importado da Receita, ninguém fechou ainda.
-- - aceito: aceitou o convite (em análise ou aguardando o pagamento).
-- - publicado: no ar, sem plano pago.
-- - fora_do_ar: suspenso ou escondido por vencimento.

create function interno.etapa_do_anunciante(p_anunciante uuid)
returns table (etapa text, cadastro_id uuid, fechado_por text)
language sql stable security definer
set search_path = ''
as $$
  with a as (
    select an.id, an.origem, an.status, an.email_convite
    from public.anunciantes an
    where an.id = p_anunciante
  ),
  -- Cadastro em andamento copiado do importado ("Fechei com este comércio").
  copia as (
    select c.id, c.email_convite, c.representante_id
    from public.anunciantes c
    where c.importado_id = p_anunciante and c.status in ('rascunho', 'aguardando_anunciante')
    order by c.criado_em desc
    limit 1
  ),
  rep as (
    select r.id, p.nome
    from public.representantes r
    join public.perfis_usuario p on p.usuario_id = r.usuario_id
  )
  select
    case
      when exists (select 1 from public.nao_procurar n where n.anunciante_id = a.id) then 'nao_procurar'
      when exists (select 1 from public.pagamentos pg where pg.anunciante_id = a.id and pg.devolvido_em is null) then 'plano_pago'
      when copia.id is not null then case when copia.email_convite is null then 'em_cadastro' else 'convite_enviado' end
      when a.origem = 'receita' then 'prospeccao'
      when a.status = 'rascunho' then case when a.email_convite is null then 'em_cadastro' else 'convite_enviado' end
      when a.status = 'aguardando_anunciante' then 'convite_enviado'
      when a.status in ('em_analise', 'aguardando_pagamento') then 'aceito'
      when a.status in ('publicado', 'pausado') then 'publicado'
      else 'fora_do_ar'
    end,
    coalesce(copia.id, a.id),
    (select rep.nome from rep where rep.id = coalesce(copia.representante_id, (select an.representante_id from public.anunciantes an where an.id = a.id)))
  from a
  left join copia on true
$$;

revoke execute on function interno.etapa_do_anunciante(uuid) from public, anon, authenticated;

/**
 * Contatos registrados entre p_inicio e p_fim. O representante recebe só os
 * dele (p_autor é ignorado); o administrador, os de todos ou só os de p_autor.
 * p_busca filtra pelo nome do comércio. No máximo 500 linhas, do mais recente.
 */
create function public.contatos_registrados(p_inicio date, p_fim date, p_autor uuid default null, p_busca text default null)
returns table (
  id uuid,
  dia date,
  observacao text,
  autor_id uuid,
  autor_nome text,
  anunciante_id uuid,
  anunciante_nome text,
  anunciante_tipo public.tipo_anunciante,
  etapa text,
  cadastro_id uuid,
  fechado_por text,
  do_meu_representante boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  admin boolean := interno.eh_admin();
  meu_rep uuid := interno.meu_representante_id();
  autor uuid;
  termo text := nullif(interno.normalizar(trim(coalesce(p_busca, ''))), '');
begin
  if not admin and meu_rep is null then
    raise exception 'Sem permissão.';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Escolha um período de até 400 dias.';
  end if;
  autor := case when admin then p_autor else auth.uid() end;

  return query
    select
      t.id, t.dia, t.observacao, t.autor_id, pu.nome, a.id, a.nome, a.tipo,
      e.etapa, e.cadastro_id, e.fechado_por,
      meu_rep is not null and exists (
        select 1 from public.anunciantes c where c.id = e.cadastro_id and c.representante_id = meu_rep
      )
    from public.atendimentos t
    join public.anunciantes a on a.id = t.anunciante_id
    left join public.perfis_usuario pu on pu.usuario_id = t.autor_id
    cross join lateral interno.etapa_do_anunciante(a.id) e
    where t.dia between p_inicio and p_fim
      and (autor is null or t.autor_id = autor)
      and (termo is null or interno.normalizar(a.nome) like '%' || replace(replace(replace(termo, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    order by t.dia desc, t.criado_em desc
    limit 500;
end
$$;

revoke execute on function public.contatos_registrados(date, date, uuid, text) from public, anon;
grant execute on function public.contatos_registrados(date, date, uuid, text) to authenticated;

/**
 * Resumo por pessoa no período, só para o administrador: contatos registrados,
 * comércios contatados, cadastros iniciados (anunciantes criados com o
 * representante dele), vendas (1º pagamento de plano válido atendido por ele)
 * e o valor dessas vendas. Entra quem registrou contato ou vendeu no período.
 */
create function public.resumo_contatos(p_inicio date, p_fim date)
returns table (
  autor_id uuid,
  nome text,
  papel public.papel_usuario,
  ativo boolean,
  contatos bigint,
  comercios bigint,
  cadastros_iniciados bigint,
  vendas bigint,
  valor_vendido_centavos bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not interno.eh_admin() then
    raise exception 'Sem permissão.';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Escolha um período de até 400 dias.';
  end if;

  return query
    with contatos as (
      select t.autor_id, count(*) as contatos, count(distinct t.anunciante_id) as comercios
      from public.atendimentos t
      where t.dia between p_inicio and p_fim
      group by t.autor_id
    ),
    cadastros as (
      select r.usuario_id as autor_id, count(*) as cadastros
      from public.anunciantes a
      join public.representantes r on r.id = a.representante_id
      where (a.criado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
        and a.origem is distinct from 'receita'
      group by r.usuario_id
    ),
    vendas as (
      select r.usuario_id as autor_id, count(*) as vendas, sum(pg.valor_centavos) as valor
      from public.pagamentos pg
      join public.representantes r on r.id = pg.representante_id
      where pg.numero = 1 and pg.devolvido_em is null and pg.pago_em between p_inicio and p_fim
      group by r.usuario_id
    ),
    pessoas as (
      select c.autor_id from contatos c
      union select v.autor_id from vendas v
      union select k.autor_id from cadastros k
    )
    select
      p.autor_id, pu.nome, pu.papel, pu.ativo,
      coalesce(c.contatos, 0), coalesce(c.comercios, 0), coalesce(k.cadastros, 0),
      coalesce(v.vendas, 0), coalesce(v.valor, 0)::bigint
    from pessoas p
    left join public.perfis_usuario pu on pu.usuario_id = p.autor_id
    left join contatos c on c.autor_id = p.autor_id
    left join cadastros k on k.autor_id = p.autor_id
    left join vendas v on v.autor_id = p.autor_id
    order by coalesce(v.vendas, 0) desc, coalesce(c.contatos, 0) desc, pu.nome;
end
$$;

revoke execute on function public.resumo_contatos(date, date) from public, anon;
grant execute on function public.resumo_contatos(date, date) to authenticated;
