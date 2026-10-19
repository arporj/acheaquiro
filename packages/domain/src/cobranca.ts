// Valor da cobrança, desconto de Fundador e vencimento (itens 4.15, 4.16 e 6.1;
// Especificação Técnica, seções 8.3 e 8.5). Valores sempre em centavos.
import type { TipoAnunciante } from "@acheaqui/types";
import { somarDias, somarMeses, type DataISO } from "./datas";

export type Periodicidade = "mensal" | "anual";

export interface ValoresPlano {
  valorMensalCentavos: number;
  /** O anual custa o equivalente a este número de mensalidades (hoje, 10). */
  mesesCobradosNoAnual: number;
}

export interface Cobranca {
  valorCheioCentavos: number;
  descontoFundadorCentavos: number;
  valorDevidoCentavos: number;
}

/**
 * Aplica um percentual inteiro a um valor em centavos, arredondando metade
 * para cima (5% de R$ 59,90 = 299,5 centavos → R$ 3,00). Só com inteiros,
 * para não haver erro de ponto flutuante.
 */
export function aplicarPercentual(centavos: number, percentual: number): number {
  if (!Number.isInteger(centavos) || centavos < 0 || !Number.isInteger(percentual) || percentual < 0) {
    throw new RangeError("Valor e percentual precisam ser inteiros e não negativos.");
  }
  return Math.floor((centavos * percentual + 50) / 100);
}

export interface DescontoFundador {
  fundador: boolean;
  /** Percentual vindo da tabela de configurações (hoje, 50). */
  percentualFundador: number;
}

/**
 * O valor devido é arredondado e o desconto é a diferença, para que os dois
 * sempre somem o valor cheio.
 */
function calcular(valorMensalCentavos: number, meses: number, percentualDesconto: number): Cobranca {
  const valorCheioCentavos = valorMensalCentavos * meses;
  const valorDevidoCentavos =
    percentualDesconto > 0 ? aplicarPercentual(valorCheioCentavos, 100 - percentualDesconto) : valorCheioCentavos;
  return { valorCheioCentavos, descontoFundadorCentavos: valorCheioCentavos - valorDevidoCentavos, valorDevidoCentavos };
}

export function calcularCobrancaPlano(
  plano: ValoresPlano,
  periodicidade: Periodicidade,
  desconto: DescontoFundador,
): Cobranca {
  const meses = periodicidade === "anual" ? plano.mesesCobradosNoAnual : 1;
  return calcular(plano.valorMensalCentavos, meses, desconto.fundador ? desconto.percentualFundador : 0);
}

export interface ValoresExtra extends ValoresPlano {
  /** Pacotes (fotos, categoria, encarte, produtos, endereço) têm desconto de Fundador; destaques não. */
  aceitaDescontoFundador: boolean;
  /** O Destaque Exclusivo do Mês é vendido só mês a mês. */
  permiteAnual: boolean;
}

/** Extras vendidos junto com a assinatura anual também são cobrados no anual. */
export function calcularCobrancaExtra(
  extra: ValoresExtra,
  periodicidade: Periodicidade,
  desconto: DescontoFundador,
): Cobranca {
  if (periodicidade === "anual" && !extra.permiteAnual) {
    throw new RangeError("Este extra só pode ser contratado mês a mês.");
  }
  const meses = periodicidade === "anual" ? extra.mesesCobradosNoAnual : 1;
  const comDesconto = desconto.fundador && extra.aceitaDescontoFundador;
  return calcular(extra.valorMensalCentavos, meses, comDesconto ? desconto.percentualFundador : 0);
}

/**
 * Vira Fundador quem paga a assinatura anual de um plano pago com o
 * comprovante enviado até o prazo (item 4.16). Não há limite de quantidade.
 */
export function tornaFundador(assinatura: {
  periodicidade: Periodicidade;
  valorMensalPlanoCentavos: number;
  comprovanteEnviadoEm: DataISO;
  prazoFundador: DataISO;
}): boolean {
  return (
    assinatura.periodicidade === "anual" &&
    assinatura.valorMensalPlanoCentavos > 0 &&
    assinatura.comprovanteEnviadoEm <= assinatura.prazoFundador
  );
}

/** Data de vencimento: 1 mês ou 12 meses depois do início. */
export function dataDeVencimento(inicio: DataISO, periodicidade: Periodicidade): DataISO {
  return somarMeses(inicio, periodicidade === "anual" ? 12 : 1);
}

export type SituacaoAssinatura = "aguardando_pagamento" | "ativa" | "vencida";

/** O plano vale até o fim do dia do vencimento. */
export function situacaoAssinatura(assinatura: {
  pagamentoConfirmado: boolean;
  venceEm: DataISO;
  hoje: DataISO;
}): SituacaoAssinatura {
  if (!assinatura.pagamentoConfirmado) return "aguardando_pagamento";
  return assinatura.hoje <= assinatura.venceEm ? "ativa" : "vencida";
}

/** Plano vencido sem pagamento: autônomo fica escondido; comércio vai para o Gratuito. */
export function efeitoDoVencimento(tipo: TipoAnunciante): "escondido_por_vencimento" | "plano_gratuito" {
  return tipo === "profissional" ? "escondido_por_vencimento" : "plano_gratuito";
}

/**
 * O Fundador perde a condição quando a assinatura vence e a renovação não é
 * paga dentro da tolerância (decisão 9: 7 dias).
 */
export function perdeCondicaoFundador(situacao: {
  venceuEm: DataISO;
  /** Data em que a renovação foi paga, se foi. */
  renovadaEm?: DataISO;
  hoje: DataISO;
  toleranciaDias: number;
}): boolean {
  const limite = somarDias(situacao.venceuEm, situacao.toleranciaDias);
  return (situacao.renovadaEm ?? situacao.hoje) > limite;
}
