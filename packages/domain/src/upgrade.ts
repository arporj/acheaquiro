// Mudança para um plano maior (item 4.12; decisões de 23 e 28/10/2026). O plano
// muda na hora e o anunciante paga a diferença proporcional ao tempo que falta
// no período. Com o atendimento de um representante, ele recebe 135% da
// diferença das mensalidades sobre o maior plano já comissionado, nas parcelas
// do mensal (100%, 20%, 10% e 5%) ou de uma vez no anual.
//
// Decisão S7 (28/10/2026): cada parcela vai no primeiro pagamento que a cobre,
// para nenhum pagamento pagar mais comissão do que recebe. No mensal, o
// proporcional não cobre os 100% e as parcelas vão nas 4 mensalidades
// seguintes; no anual, os 135% vão no proporcional quando ele cobre, ou na
// renovação. O desconto do representante fica no pagamento da 1ª parcela.
import { aplicarPercentual, type Periodicidade } from "./cobranca";
import { PERCENTUAIS_COMISSAO_MENSAL, PERCENTUAL_COMISSAO_ANUAL, percentualMensalAcumulado, type Comissao } from "./comissao";

/** Venda de um upgrade com o atendimento de um representante: a faixa da comissão. */
export interface FaixaUpgrade {
  id: string;
  /**
   * Mensalidade do plano novo menos a do maior plano já comissionado (ou do
   * plano que o anunciante já tinha, se for maior), sem o desconto de
   * Fundador, fixada na venda.
   */
  diferencaMensalCentavos: number;
  /** Parcelas do mensal já pagas (0 a 4). No anual, a faixa conclui de uma vez. */
  parcelasPagas: number;
  concluida: boolean;
  /** Desconto prometido na proposta: sai no pagamento que leva a 1ª parcela. */
  descontoCentavos: number;
}

export interface ParcelaDaFaixa {
  faixaId: string;
  /** Comissão bruta da parcela; null quando o pagamento não a cobre (fica para o próximo). */
  comissao: Comissao | null;
  /** Desconto do representante neste pagamento (até a comissão). */
  descontoCentavos: number;
  parcelasPagasDepois: number;
  concluida: boolean;
}

/** Diferença sobre a qual o upgrade gera comissão: zero quando o plano novo não passa do maior já comissionado nem do atual. */
export function diferencaParaComissao(entrada: {
  mensalidadeNovaCentavos: number;
  mensalidadeAtualCentavos: number;
  maiorComissionadaCentavos: number;
}): number {
  for (const v of Object.values(entrada)) {
    if (!Number.isInteger(v) || v < 0) throw new RangeError("Mensalidades precisam ser inteiras e não negativas.");
  }
  return Math.max(0, entrada.mensalidadeNovaCentavos - Math.max(entrada.mensalidadeAtualCentavos, entrada.maiorComissionadaCentavos));
}

/**
 * A parcela da faixa neste pagamento. A base é a diferença com o desconto de
 * Fundador do período; a parcela só sai se couber no que ainda sobra do
 * pagamento (disponivelCentavos), senão espera o próximo.
 */
export function parcelaDaFaixa(entrada: {
  faixa: FaixaUpgrade;
  periodicidade: Periodicidade;
  percentualFundador: number;
  disponivelCentavos: number;
}): ParcelaDaFaixa {
  const { faixa, periodicidade, disponivelCentavos } = entrada;
  if (!Number.isInteger(faixa.diferencaMensalCentavos) || faixa.diferencaMensalCentavos <= 0) {
    throw new RangeError("A diferença da faixa precisa ser inteira e positiva.");
  }
  if (!Number.isInteger(faixa.parcelasPagas) || faixa.parcelasPagas < 0 || faixa.parcelasPagas > PERCENTUAIS_COMISSAO_MENSAL.length) {
    throw new RangeError("Parcelas pagas da faixa inválidas.");
  }
  if (!Number.isInteger(disponivelCentavos) || disponivelCentavos < 0) throw new RangeError("Valor disponível inválido.");
  const igual = { faixaId: faixa.id, comissao: null, descontoCentavos: 0, parcelasPagasDepois: faixa.parcelasPagas };
  if (faixa.concluida) return { ...igual, concluida: true };

  const base = faixa.diferencaMensalCentavos - aplicarPercentual(faixa.diferencaMensalCentavos, entrada.percentualFundador);
  let percentual: number;
  let valorCentavos: number;
  let parcelasPagasDepois: number;
  let concluida: boolean;
  if (periodicidade === "anual") {
    // Quem passou do mensal para o anual completa os 135% (como na decisão M1).
    percentual = PERCENTUAL_COMISSAO_ANUAL - percentualMensalAcumulado(faixa.parcelasPagas);
    valorCentavos = aplicarPercentual(base, percentual);
    parcelasPagasDepois = faixa.parcelasPagas;
    concluida = true;
  } else {
    const p = PERCENTUAIS_COMISSAO_MENSAL[faixa.parcelasPagas];
    if (p === undefined) return { ...igual, concluida: true };
    percentual = p;
    valorCentavos = aplicarPercentual(base, p);
    parcelasPagasDepois = faixa.parcelasPagas + 1;
    concluida = parcelasPagasDepois === PERCENTUAIS_COMISSAO_MENSAL.length;
  }
  if (valorCentavos > disponivelCentavos) return { ...igual, concluida: false };
  const primeira = faixa.parcelasPagas === 0;
  return {
    faixaId: faixa.id,
    comissao: valorCentavos > 0 ? { baseCentavos: base, percentual, valorCentavos } : null,
    descontoCentavos: primeira ? Math.min(faixa.descontoCentavos, valorCentavos) : 0,
    parcelasPagasDepois,
    concluida,
  };
}

/**
 * Parcelas das faixas num pagamento, na ordem em que os upgrades foram
 * vendidos: cada uma sai só se couber no que sobra do valor (decisão S7). No
 * pagamento proporcional do upgrade, a 1ª parcela do mensal (100% da
 * diferença) nunca cabe; a do anual cabe quando ainda falta tempo no período.
 */
export function parcelasDoPagamento(entrada: {
  valorCentavos: number;
  faixas: readonly FaixaUpgrade[];
  periodicidade: Periodicidade;
  percentualFundador: number;
}): { parcelas: ParcelaDaFaixa[]; disponivelCentavos: number } {
  let disponivel = entrada.valorCentavos;
  const parcelas: ParcelaDaFaixa[] = [];
  for (const faixa of entrada.faixas) {
    const parcela = parcelaDaFaixa({ faixa, periodicidade: entrada.periodicidade, percentualFundador: entrada.percentualFundador, disponivelCentavos: disponivel });
    if (parcela.comissao) disponivel -= parcela.comissao.valorCentavos;
    parcelas.push(parcela);
  }
  return { parcelas, disponivelCentavos: disponivel };
}
