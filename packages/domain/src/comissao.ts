// Comissão do representante (item 4.12; Especificação Técnica, seção 8.4).
// Calculada sobre o valor efetivamente pago, já com descontos de Fundador.
import { aplicarPercentual, type Periodicidade } from "./cobranca";

/** Percentuais da 1ª à 4ª mensalidade do plano mensal; da 5ª em diante, nada. */
export const PERCENTUAIS_COMISSAO_MENSAL = [100, 20, 10, 5] as const;
/** No plano anual, 135% de uma mensalidade, pagos de uma vez. */
export const PERCENTUAL_COMISSAO_ANUAL = 135;
/**
 * Extras vendidos junto com a assinatura: 20% do valor pago nessa venda, uma
 * vez só, porque o anunciante pode parar de pagar o extra e continuar no plano
 * (decisão de 20/10/2026).
 */
export const PERCENTUAL_COMISSAO_EXTRAS = 20;

export interface PagamentoComissionavel {
  /** O plano, ou um extra vendido junto com a assinatura (venda direta), ou um extra contratado depois. */
  origem: "plano" | "extra_na_assinatura" | "extra_avulso";
  periodicidade: Periodicidade;
  /** Valor efetivamente pago neste pagamento, em centavos. */
  valorPagoCentavos: number;
  /**
   * Qual pagamento da assinatura (ou do extra) este é: 1, 2, 3... No anual, a
   * renovação do 2º ano é o pagamento 2. A compra de dias do Destaque Exclusivo
   * é sempre o pagamento 1.
   */
  numeroMensalidade: number;
  /** No anual: quantas mensalidades o anual custa (hoje, 10). */
  mesesCobradosNoAnual: number;
  temRepresentante: boolean;
  pagamentoConfirmado: boolean;
}

export interface Comissao {
  baseCentavos: number;
  /** Percentual sobre a base. No anual, 135% de uma mensalidade = 13,5% do valor anual. */
  percentual: number;
  valorCentavos: number;
}

/** Devolve a comissão deste pagamento, ou null quando ele não gera comissão. */
export function calcularComissao(pagamento: PagamentoComissionavel): Comissao | null {
  const { valorPagoCentavos: base, numeroMensalidade, mesesCobradosNoAnual: meses } = pagamento;
  if (!Number.isInteger(base) || base < 0 || !Number.isInteger(numeroMensalidade) || numeroMensalidade < 1) {
    throw new RangeError("Valor pago e número da mensalidade precisam ser inteiros válidos.");
  }
  if (!pagamento.temRepresentante || !pagamento.pagamentoConfirmado || pagamento.origem === "extra_avulso") {
    return null;
  }

  if (pagamento.origem === "extra_na_assinatura") {
    if (numeroMensalidade > 1) return null;
    const percentual = PERCENTUAL_COMISSAO_EXTRAS;
    return { baseCentavos: base, percentual, valorCentavos: aplicarPercentual(base, percentual) };
  }

  if (pagamento.periodicidade === "anual") {
    if (!Number.isInteger(meses) || meses < 1) throw new RangeError("Meses cobrados no anual inválidos.");
    // Os 135% são pagos uma vez: a renovação do anual não gera nova comissão.
    if (numeroMensalidade > 1) return null;
    // 135% de (valor anual ÷ meses), arredondando metade para cima, só com inteiros.
    const valorCentavos = Math.floor((base * PERCENTUAL_COMISSAO_ANUAL + 50 * meses) / (100 * meses));
    return { baseCentavos: base, percentual: PERCENTUAL_COMISSAO_ANUAL / meses, valorCentavos };
  }

  const percentual = PERCENTUAIS_COMISSAO_MENSAL[numeroMensalidade - 1];
  if (percentual === undefined) return null;
  return { baseCentavos: base, percentual, valorCentavos: aplicarPercentual(base, percentual) };
}

