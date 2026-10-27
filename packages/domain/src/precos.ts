// Mudança de preço dos planos (item 4 do plano; decisões R1 e R2 de 27/10/2026
// e Termos de Uso v1, item 7.1): o valor novo vale na hora para quem contrata;
// para quem já assina, o aumento só vale na renovação que começa pelo menos 30
// dias depois do aviso por e-mail, e a redução vale já na próxima renovação.
// Cada assinante recebe o aviso com o próprio valor, já com o desconto de
// Fundador do ano em que a renovação cai.
import {
  anoComoFundador,
  calcularCobrancaPlano,
  percentualFundadorNoAno,
  vencimentoSeguinte,
  type Periodicidade,
  type ValoresPlano,
} from "./cobranca";
import { somarDias, type DataISO } from "./datas";
import type { DegrauDescontoFundador } from "@acheaqui/types";

/** Aviso mínimo, por e-mail, antes de um aumento valer para quem já assina (Termos de Uso, item 7.1). */
export const DIAS_AVISO_PRECO = 30;

/** Um preço do plano e o dia em que passou a valer. */
export interface PrecoVigente extends ValoresPlano {
  vigenteDesde: DataISO;
}

/** Valor do período (mensal ou anual), para comparar dois preços. */
const valorDoPeriodo = (v: ValoresPlano, periodicidade: Periodicidade) =>
  v.valorMensalCentavos * (periodicidade === "anual" ? v.mesesCobradosNoAnual : 1);

/** O preço que valia num dia: o último que começou até ele (ou o mais antigo, se o dia vem antes de todos). */
export function precoVigenteEm(historico: readonly PrecoVigente[], data: DataISO): ValoresPlano {
  if (historico.length === 0) throw new RangeError("O plano precisa de ao menos um preço no histórico.");
  const ordenado = [...historico].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
  const ultimo = ordenado.filter((p) => p.vigenteDesde <= data).at(-1) ?? ordenado[0]!;
  return { valorMensalCentavos: ultimo.valorMensalCentavos, mesesCobradosNoAnual: ultimo.mesesCobradosNoAnual };
}

/**
 * Preço da renovação que começa em inicioPeriodo: o que valia 30 dias antes
 * dela (o aumento anunciado depois disso ainda não vale), mas nunca mais caro
 * que o de hoje (a redução vale na hora). Pagamento adiantado usa o que se
 * conhece hoje.
 */
export function precoDaRenovacao(entrada: {
  historico: readonly PrecoVigente[];
  inicioPeriodo: DataISO;
  periodicidade: Periodicidade;
  hoje: DataISO;
}): ValoresPlano {
  const { historico, periodicidade, hoje } = entrada;
  const limite = somarDias(entrada.inicioPeriodo, -DIAS_AVISO_PRECO);
  const avisado = precoVigenteEm(historico, limite < hoje ? limite : hoje);
  const atual = precoVigenteEm(historico, hoje);
  return valorDoPeriodo(atual, periodicidade) < valorDoPeriodo(avisado, periodicidade) ? atual : avisado;
}

export interface AvisoDePreco {
  /** Início da primeira renovação com o valor novo (o vencimento em que ele passa a valer). */
  aPartirDe: DataISO;
  /** Valor que o assinante vai pagar nessa renovação, já com o desconto de Fundador. */
  valorCentavos: number;
  /** Valor que pagaria com o preço antigo, para saber se é aumento. */
  valorAntigoCentavos: number;
}

/**
 * Aviso individual de mudança de preço: a partir de qual vencimento e quanto o
 * assinante vai pagar. null quando o valor dele não sobe (redução ou mesma
 * coisa): só o aumento precisa de aviso.
 */
export function avisoDePreco(entrada: {
  assinatura: { ancora: DataISO; venceEm: DataISO; periodicidade: Periodicidade };
  antigo: ValoresPlano;
  novo: ValoresPlano;
  avisadoEm: DataISO;
  fundadorDesde: DataISO | null;
  escalaDescontoFundador: readonly DegrauDescontoFundador[];
}): AvisoDePreco | null {
  const { assinatura, fundadorDesde } = entrada;
  // Primeiro vencimento pelo menos 30 dias depois do aviso.
  const minimo = somarDias(entrada.avisadoEm, DIAS_AVISO_PRECO);
  let aPartirDe = assinatura.venceEm;
  while (aPartirDe < minimo) aPartirDe = vencimentoSeguinte(assinatura.ancora, aPartirDe, assinatura.periodicidade);

  const fundador = fundadorDesde !== null && assinatura.periodicidade === "anual";
  const percentualFundador = fundador ? percentualFundadorNoAno(entrada.escalaDescontoFundador, anoComoFundador(fundadorDesde!, aPartirDe)) : 0;
  const desconto = { fundador, percentualFundador };
  const valorCentavos = calcularCobrancaPlano(entrada.novo, assinatura.periodicidade, desconto).valorDevidoCentavos;
  const valorAntigoCentavos = calcularCobrancaPlano(entrada.antigo, assinatura.periodicidade, desconto).valorDevidoCentavos;
  return valorCentavos > valorAntigoCentavos ? { aPartirDe, valorCentavos, valorAntigoCentavos } : null;
}
