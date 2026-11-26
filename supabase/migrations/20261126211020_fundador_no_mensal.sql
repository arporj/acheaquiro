-- Fundador também no mensal (decisão de 26/11/2026, no lugar de "só o anual"):
-- vira Fundador quem paga um plano pago, mensal ou anual, até o prazo dos
-- Fundadores, e continua Fundador enquanto renovar (no mensal ou no anual)
-- até 7 dias depois do vencimento.
--
-- O banco já recebe a condição calculada pelo domínio (calcularPagamentoPlano,
-- em packages/domain/assinatura.ts) e o vencimento diário (interno.aplicar_vencimentos)
-- só tira a condição depois da tolerância, sem olhar a periodicidade. Por isso
-- nenhuma função muda: esta migration só corrige quem pagou o mensal até o
-- prazo pela regra antiga (hoje, a AP Advocacia, paga em 25/11/2026).
--
-- O pagamento já registrado continua com o valor cheio (decisão F1: quem vendeu
-- pelo valor cheio mantém a venda e a comissão); o desconto de Fundador vale
-- a partir da próxima mensalidade. A mudança em anunciantes entra na auditoria
-- pelo gatilho, como "sistema".

with prazo as (
  select (c.valor #>> '{}')::date as dia
  from public.configuracoes c
  where c.chave = 'prazo_fundador'
),
primeiro as (
  select distinct on (p.anunciante_id) p.id, p.anunciante_id, p.periodo_inicio
  from public.pagamentos p
  join public.anunciantes a on a.id = p.anunciante_id
  cross join prazo
  where p.tipo = 'plano'
    and p.devolvido_em is null
    and p.valor_cheio_centavos > 0
    and p.pago_em <= prazo.dia
    and not a.fundador
    and a.fundador_desde is null
    and a.status <> 'excluido'
  order by p.anunciante_id, p.pago_em, p.registrado_em
),
marcados as (
  update public.pagamentos p
  set tornou_fundador = true
  from primeiro
  where p.id = primeiro.id
  returning p.anunciante_id
)
update public.anunciantes a
set fundador = true,
    fundador_desde = primeiro.periodo_inicio
from primeiro
where a.id = primeiro.anunciante_id
  and a.id in (select anunciante_id from marcados);
