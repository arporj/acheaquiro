// Comissão do representante (item 4.12; Especificação Técnica, seção 8.4).
// Calculada sobre o valor efetivamente pago, já com descontos de Fundador, e
// paga ao representante que atendeu aquela venda (decisões de 23/10/2026).
import { aplicarPercentual, DIAS_PARA_DESISTIR, type Periodicidade } from "./cobranca";
import { somarDias, type DataISO } from "./datas";

/** Percentuais da 1ª à 4ª mensalidade do plano mensal; da 5ª em diante, nada. */
export const PERCENTUAIS_COMISSAO_MENSAL = [100, 20, 10, 5] as const;
/** No plano anual, 135% de uma mensalidade, pagos de uma vez. */
export const PERCENTUAL_COMISSAO_ANUAL = 135;
/**
 * Extras vendidos com o atendimento do representante, junto com a assinatura
 * ou depois: 20% do valor pago nessa venda, uma vez só, porque o anunciante
 * pode parar de pagar o extra e continuar no plano (decisões de 20 e 23/10/2026).
 */
export const PERCENTUAL_COMISSAO_EXTRAS = 20;
/** Patrocinador atendido pelo representante: 20% do valor pago no contrato, de uma vez (decisão de 23/10/2026). */
export const PERCENTUAL_COMISSAO_PATROCINIO = 20;
/**
 * A comissão fica aguardando o prazo de devolução do anunciante antes de ser
 * liberada: a mesma regra para todo pagamento (decisão de 23/10/2026).
 */
export const DIAS_ESPERA_COMISSAO = DIAS_PARA_DESISTIR;

export interface PagamentoComissionavel {
  /**
   * O plano, um extra ou um contrato de patrocínio. Na troca de cota no meio
   * do contrato, o valor pago é a diferença paga.
   */
  origem: "plano" | "extra" | "patrocinio";
  periodicidade: Periodicidade;
  /** Valor efetivamente pago neste pagamento, em centavos (sem o desconto dado pelo representante). */
  valorPagoCentavos: number;
  /**
   * Qual pagamento da assinatura (ou do extra) este é: 1, 2, 3... No anual, a
   * renovação do 2º ano é o pagamento 2. A compra de dias do Destaque Exclusivo
   * e o contrato de patrocínio são sempre o pagamento 1.
   */
  numeroMensalidade: number;
  /** No anual: quantas mensalidades o anual custa (hoje, 10). */
  mesesCobradosNoAnual: number;
  /**
   * A venda teve o atendimento de um representante que recebe comissão. Venda
   * feita pelo anunciante sozinho, ou pelo sócio, não gera comissão.
   */
  temRepresentante: boolean;
  pagamentoConfirmado: boolean;
}

export interface Comissao {
  baseCentavos: number;
  /** Percentual sobre a base. No anual, 135% de uma mensalidade = 13,5% do valor anual. */
  percentual: number;
  valorCentavos: number;
}

function validarInteiros(base: number, numero: number) {
  if (!Number.isInteger(base) || base < 0 || !Number.isInteger(numero) || numero < 1) {
    throw new RangeError("Valor pago e número da mensalidade precisam ser inteiros válidos.");
  }
}

/** 135% de uma mensalidade, de uma vez: a base é o valor anual, dividido pelos meses cobrados. */
function comissaoAnual(baseAnual: number, meses: number): Comissao {
  if (!Number.isInteger(meses) || meses < 1) throw new RangeError("Meses cobrados no anual inválidos.");
  // 135% de (valor anual ÷ meses), arredondando metade para cima, só com inteiros.
  const valorCentavos = Math.floor((baseAnual * PERCENTUAL_COMISSAO_ANUAL + 50 * meses) / (100 * meses));
  return { baseCentavos: baseAnual, percentual: PERCENTUAL_COMISSAO_ANUAL / meses, valorCentavos };
}

/** 100%, 20%, 10% e 5% das 4 primeiras mensalidades; null da 5ª em diante. */
function comissaoMensal(base: number, numero: number): Comissao | null {
  const percentual = PERCENTUAIS_COMISSAO_MENSAL[numero - 1];
  if (percentual === undefined) return null;
  return { baseCentavos: base, percentual, valorCentavos: aplicarPercentual(base, percentual) };
}

/** Devolve a comissão deste pagamento, ou null quando ele não gera comissão. */
export function calcularComissao(pagamento: PagamentoComissionavel): Comissao | null {
  const { valorPagoCentavos: base, numeroMensalidade } = pagamento;
  validarInteiros(base, numeroMensalidade);
  if (!pagamento.temRepresentante || !pagamento.pagamentoConfirmado) return null;

  if (pagamento.origem !== "plano") {
    if (numeroMensalidade > 1) return null;
    const percentual = pagamento.origem === "extra" ? PERCENTUAL_COMISSAO_EXTRAS : PERCENTUAL_COMISSAO_PATROCINIO;
    return { baseCentavos: base, percentual, valorCentavos: aplicarPercentual(base, percentual) };
  }

  if (pagamento.periodicidade === "anual") {
    const anual = comissaoAnual(base, pagamento.mesesCobradosNoAnual);
    // Os 135% são pagos uma vez: a renovação do anual não gera nova comissão.
    return numeroMensalidade > 1 ? null : anual;
  }
  return comissaoMensal(base, numeroMensalidade);
}

export interface UpgradeComissionavel {
  /** Mensalidade do plano novo, já com o desconto de Fundador quando houver. */
  mensalidadeNovaCentavos: number;
  /**
   * Mensalidade do maior plano que já gerou comissão para este anunciante, já
   * com o desconto de Fundador. Descer de plano e subir de novo não gera
   * comissão nova (decisão de 23/10/2026). 0 se nenhum plano gerou comissão.
   */
  maiorMensalidadeComissionadaCentavos: number;
  periodicidade: Periodicidade;
  /** Qual pagamento depois da mudança este é: 1, 2, 3... */
  numeroMensalidade: number;
  temRepresentante: boolean;
  pagamentoConfirmado: boolean;
}

/**
 * Mudança para um plano maior com o atendimento do representante: 135% da
 * diferença entre as mensalidades, nas mesmas parcelas do mensal (100%, 20%,
 * 10% e 5%) ou de uma vez no anual. A base é a diferença das mensalidades.
 */
export function calcularComissaoUpgrade(upgrade: UpgradeComissionavel): Comissao | null {
  const { mensalidadeNovaCentavos: nova, maiorMensalidadeComissionadaCentavos: maior, numeroMensalidade } = upgrade;
  validarInteiros(nova, numeroMensalidade);
  validarInteiros(maior, 1);
  if (!upgrade.temRepresentante || !upgrade.pagamentoConfirmado) return null;
  const diferenca = nova - maior;
  if (diferenca <= 0) return null;
  if (upgrade.periodicidade === "anual") {
    // 135% de uma mensalidade da diferença: a mesma conta do anual com 1 mês.
    return numeroMensalidade > 1 ? null : comissaoAnual(diferenca, 1);
  }
  return comissaoMensal(diferenca, numeroMensalidade);
}

/**
 * Desconto dado pelo representante no primeiro pagamento da venda (decisão de
 * 23/10/2026): até o valor da comissão desse pagamento. A comissão continua
 * calculada sobre o preço sem o desconto, e o representante recebe a comissão
 * menos o desconto; o Ache Aqui recebe o mesmo valor líquido.
 */
export function aplicarDescontoRepresentante(entrada: {
  valorCentavos: number;
  comissaoCentavos: number;
  descontoCentavos: number;
}): { valorCobradoCentavos: number; comissaoCentavos: number } {
  const { valorCentavos, comissaoCentavos, descontoCentavos } = entrada;
  for (const v of [valorCentavos, comissaoCentavos, descontoCentavos]) {
    if (!Number.isInteger(v) || v < 0) throw new RangeError("Valores precisam ser inteiros e não negativos.");
  }
  if (descontoCentavos > comissaoCentavos) throw new RangeError("O desconto não pode passar da comissão deste pagamento.");
  return { valorCobradoCentavos: valorCentavos - descontoCentavos, comissaoCentavos: comissaoCentavos - descontoCentavos };
}

/** Dia em que a comissão é liberada: 7 dias depois da confirmação do pagamento. */
export function liberacaoDaComissao(confirmadoEm: DataISO): DataISO {
  return somarDias(confirmadoEm, DIAS_ESPERA_COMISSAO);
}

export type SituacaoComissao = "aguardando" | "liberada" | "paga" | "cancelada";

/** Pagamento devolvido cancela a comissão; paga é a que a equipe já transferiu. */
export function situacaoComissao(comissao: { liberaEm: DataISO; hoje: DataISO; cancelada: boolean; paga: boolean }): SituacaoComissao {
  if (comissao.cancelada) return "cancelada";
  if (comissao.paga) return "paga";
  return comissao.hoje >= comissao.liberaEm ? "liberada" : "aguardando";
}
