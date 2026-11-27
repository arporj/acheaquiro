-- Fundador só no anual de novo (decisões M1 a M4 de 27/11/2026, no lugar das
-- F1 a F4 de 26/11/2026). A regra fica no domínio (tornaFundador,
-- perdeCondicaoFundador e calcularCobrancaPlano, em packages/domain/cobranca.ts):
-- o banco recebe a condição calculada no registro do pagamento, e o vencimento
-- diário (interno.aplicar_vencimentos) não olha a periodicidade. Por isso só
-- mudam aqui o contexto da proposta e os Termos de Uso.
--
-- M1: quem virou Fundador pelo mensal enquanto valeu a regra de 26/11/2026 (hoje,
-- só a AP Advocacia) continua Fundador no mensal, pelo preço cheio. Ninguém é
-- desmarcado. O banco não guarda uma marca nova: a exceção é o pagamento que
-- tornou Fundador ser mensal (pagamentos.tornou_fundador e periodicidade), e
-- depois desta data nenhum pagamento mensal torna Fundador.

-- 1. Contexto da proposta com a exceção M1, para a proposta mostrar a renovação
--    no mensal sem tirar a condição de quem tem a exceção.
create or replace function public.contexto_da_proposta(p_anunciante uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  a record;
  s record;
  ultimo record;
begin
  select an.id, an.nome, an.slug, an.tipo, an.status, an.cidade_id, an.usuario_id, an.fundador_desde, an.plano_id
  into a from public.anunciantes an where an.id = p_anunciante;
  if a.id is null
     or not (interno.eh_admin() or interno.meu_representante_id() is not null or a.usuario_id = auth.uid()) then
    raise exception 'Anunciante não encontrado.';
  end if;
  select * into s from public.assinaturas where anunciante_id = a.id;
  select p.periodo_inicio, p.vence_em into ultimo from public.pagamentos p
  where p.anunciante_id = a.id and p.devolvido_em is null and p.tipo = 'plano'
  order by p.registrado_em desc limit 1;
  return jsonb_build_object(
    'anunciante', jsonb_build_object('id', a.id, 'nome', a.nome, 'slug', a.slug, 'tipo', a.tipo, 'status', a.status,
                                     'temConta', a.usuario_id is not null, 'fundadorDesde', a.fundador_desde, 'planoId', a.plano_id,
                                     'fundadorPeloMensal', exists (
                                       select 1 from public.pagamentos p
                                       where p.anunciante_id = a.id and p.devolvido_em is null and p.tipo = 'plano'
                                         and p.tornou_fundador and p.periodicidade = 'mensal')),
    'assinatura', case when s.anunciante_id is null then null else jsonb_build_object(
      'planoId', s.plano_id, 'periodicidade', s.periodicidade, 'ancora', s.ancora, 'venceEm', s.vence_em,
      'periodoInicio', ultimo.periodo_inicio, 'planoSeguinteId', s.plano_seguinte_id) end,
    'pagamentosValidos', (select count(*) from public.pagamentos p where p.anunciante_id = a.id and p.devolvido_em is null and p.tipo = 'plano'),
    'algumAnual', exists (select 1 from public.pagamentos p where p.anunciante_id = a.id and p.devolvido_em is null and p.tipo = 'plano' and p.periodicidade = 'anual'),
    -- Maior mensalidade já comissionada: a do plano vendido com representante e a dos upgrades com comissão.
    'maiorComissionadaCentavos', greatest(
      coalesce((select pl.valor_mensal_centavos from public.planos pl where pl.id = s.plano_vendido_id and s.representante_id is not null), 0),
      coalesce((select max(pl.valor_mensal_centavos) from public.upgrades u join public.planos pl on pl.id = u.plano_id
                where u.anunciante_id = a.id and u.cancelado_em is null), 0)),
    'planos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'nivel', p.nivel, 'valorMensalCentavos', p.valor_mensal_centavos,
                                          'mesesCobradosNoAnual', p.meses_cobrados_no_anual) order by p.nivel)
      from public.planos p where p.cidade_id = a.cidade_id and p.tipo = a.tipo and p.ativo and p.valor_mensal_centavos > 0
    ), '[]'::jsonb)
  );
end
$$;
revoke execute on function public.contexto_da_proposta(uuid) from public, anon;
grant execute on function public.contexto_da_proposta(uuid) to authenticated;

-- 2. Termos de Uso, versão 4 (texto em apps/web/src/conteudo/termos-v4.md): só o
--    item 7.5 muda. Vale a partir de hoje: interno.aceitou_documento passa a
--    exigir a versão 4, e a área do anunciante pede o novo aceite no próximo
--    acesso.
--
--    Aviso por e-mail (item 15) a cada conta ativa de anunciante ou cliente que
--    já aceitou os Termos, uma vez só, pela fila de avisos. Contado antes de
--    aplicar (aviso em massa, decisão de 24/11/2026): 3 e-mails, que saem no
--    mesmo dia.

insert into public.documentos_legais (documento, versao, vigente_desde, texto_url) values
  ('termos', '4', '2026-11-27', '/termos/v4');

insert into public.avisos_email (cidade_id, anunciante_id, tipo, referencia, para, dados, prioridade)
select c.id, null, 'termos_novos', date '2026-11-27', u.email,
       jsonb_build_object(
         'nome', p.nome,
         'versao', '4',
         'vigenteDesde', '2026-11-27',
         'mudancas',
         'o item 7.5, dos Fundadores. É Fundador quem paga a assinatura anual de um plano pago até 26/11/2026, '
           || 'e as 100 vagas de Fundador a partir de 27/11/2026 vão para o primeiro pagamento da assinatura anual. '
           || 'O desconto de Fundador no plano vale só no anual, e quem renova no mensal deixa de ser Fundador. '
           || 'Quem virou Fundador pelo plano mensal até 26/11/2026 continua Fundador no mensal, pagando o valor cheio'
       ),
       2
from public.perfis_usuario p
join auth.users u on u.id = p.usuario_id
cross join (select id from public.cidades where slug = 'rio-das-ostras') c
where p.papel = 'anunciante' and p.ativo and u.email is not null and u.email not like '%.invalid'
  and exists (select 1 from public.aceites_documentos a where a.usuario_id = p.usuario_id and a.documento = 'termos');
