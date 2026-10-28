-- O e-mail da proposta usava interno.dados_do_aviso, que é nulo para quem ainda
-- não tem assinatura (a proposta de assinatura): agora leva ao menos o nome e o tipo.

create or replace function public.criar_proposta(p_anunciante uuid, p_plano uuid, p_periodicidade text, p_desconto integer) returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  rep uuid := interno.meu_representante_id();
  a record;
  pl record;
  s record;
  atual integer;
  v_tipo text;
  v_periodicidade text := p_periodicidade;
  nova uuid;
begin
  if rep is null then
    raise exception 'Só o representante faz propostas.';
  end if;
  select an.id, an.cidade_id, an.tipo, an.status, an.usuario_id into a from public.anunciantes an where an.id = p_anunciante;
  if a.id is null or a.usuario_id is null or a.status not in ('aguardando_pagamento', 'publicado', 'pausado', 'escondido_por_vencimento') then
    raise exception 'Este anunciante não pode receber proposta agora: ele precisa ter conta e cadastro aprovado.';
  end if;
  select p.id, p.valor_mensal_centavos, p.meses_cobrados_no_anual into pl from public.planos p
  where p.id = p_plano and p.cidade_id = a.cidade_id and p.tipo = a.tipo and p.ativo and p.valor_mensal_centavos > 0;
  if pl.id is null then
    raise exception 'Escolha um plano pago deste tipo de anunciante.';
  end if;
  if p_desconto is null or p_desconto < 0 then
    raise exception 'Desconto inválido.';
  end if;

  select ss.plano_id, ss.periodicidade, ss.vence_em into s from public.assinaturas ss where ss.anunciante_id = a.id;
  if s.plano_id is not null and s.vence_em + interno.tolerancia_vencimento(a.cidade_id) >= interno.hoje()
     and exists (select 1 from public.anunciantes an where an.id = a.id and an.plano_id = s.plano_id) then
    select p.valor_mensal_centavos into atual from public.planos p where p.id = s.plano_id;
    if pl.valor_mensal_centavos <= atual then
      raise exception 'A proposta precisa ser de um plano maior que o atual. Para um plano menor, o anunciante fala com a equipe.';
    end if;
    v_tipo := 'upgrade';
    v_periodicidade := s.periodicidade;
  else
    if p_periodicidade not in ('mensal', 'anual') then
      raise exception 'Escolha mensal ou anual.';
    end if;
    v_tipo := 'assinatura';
  end if;

  insert into public.propostas (cidade_id, anunciante_id, representante_id, tipo, plano_id, periodicidade,
                                valor_mensal_centavos, meses_cobrados_no_anual, desconto_centavos, expira_em)
  values (a.cidade_id, a.id, rep, v_tipo, pl.id, v_periodicidade, pl.valor_mensal_centavos, pl.meses_cobrados_no_anual,
          p_desconto, interno.hoje() + 7)
  returning id into nova;

  insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
  select a.cidade_id, a.id, 'proposta', interno.hoje(), u.email,
         coalesce(interno.dados_do_aviso(a.id), (select jsonb_build_object('nome', an.nome, 'tipo', an.tipo) from public.anunciantes an where an.id = a.id)) || jsonb_build_object(
           'propostaId', nova,
           'representante', (select coalesce(nullif(pu.nome, ''), r.codigo) from public.representantes r
                             left join public.perfis_usuario pu on pu.usuario_id = r.usuario_id where r.id = rep),
           'planoNovo', (select p.nome from public.planos p where p.id = pl.id),
           'expiraEm', interno.hoje() + 7),
         0
  from auth.users u where u.id = a.usuario_id and u.email is not null;
  return nova;
end
$$;
