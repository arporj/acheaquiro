// Preços e comissões mostrados nas páginas institucionais. As contas são as de
// packages/domain (testadas); aqui só se adapta o formato dos dados das páginas.
import {
  calcularCobrancaExtra,
  calcularCobrancaPlano,
  calcularComissao,
  PERCENTUAIS_COMISSAO_MENSAL,
  percentualFundadorNoAno,
  validarEscalaFundador,
  type Periodicidade,
} from "@acheaqui/domain";
import type { DegrauDescontoFundador, Extra, Plano, RegrasCobranca } from "@acheaqui/types";
import { formatarPreco } from "./contato";

export function formatarCentavos(centavos: number): string {
  return formatarPreco(centavos / 100);
}

/**
 * As páginas mostram o preço do 1º ano: é o que o Fundador paga no
 * pré-cadastro. Os anos seguintes seguem a escala (descricaoDescontoFundador).
 */
function desconto(fundador: boolean, regras: RegrasCobranca) {
  return { fundador, percentualFundador: percentualInicialFundador(regras) };
}

/** Desconto do Fundador no 1º ano de assinatura. */
export function percentualInicialFundador(regras: RegrasCobranca): number {
  return percentualFundadorNoAno(regras.escalaDescontoFundador, 1);
}

/** A escala em texto: "50% no 1º ano, 40% no 2º ano ... e 10% no 5º ano" ou "50% nos 3 primeiros anos e 25% a partir do 4º ano". */
export function descricaoDescontoFundador(escala: readonly DegrauDescontoFundador[]): string {
  validarEscalaFundador(escala);
  let anoAnterior = 0;
  const partes = escala.map(({ ateAno, percentual }) => {
    const inicio = anoAnterior + 1;
    anoAnterior = ateAno ?? anoAnterior;
    if (ateAno === undefined) return inicio === 1 ? `${percentual}% todo ano` : `${percentual}% a partir do ${inicio}º ano`;
    if (inicio === 1) return ateAno === 1 ? `${percentual}% no 1º ano` : `${percentual}% nos ${ateAno} primeiros anos`;
    return inicio === ateAno ? `${percentual}% no ${inicio}º ano` : `${percentual}% do ${inicio}º ao ${ateAno}º ano`;
  });
  return partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}

/** Valor devido pelo plano no período, com ou sem o desconto de Fundador. */
export function valorPlano(plano: Plano, periodicidade: Periodicidade, fundador: boolean, regras: RegrasCobranca): number {
  return calcularCobrancaPlano(plano, periodicidade, desconto(fundador, regras)).valorDevidoCentavos;
}

/** Valor devido pelo extra; null quando o extra não pode ser contratado no período. */
export function valorExtra(
  extra: Extra,
  periodicidade: Periodicidade,
  fundador: boolean,
  regras: RegrasCobranca,
): number | null {
  if (periodicidade === "anual" && !extra.permiteAnual) return null;
  return calcularCobrancaExtra(extra, periodicidade, desconto(fundador, regras)).valorDevidoCentavos;
}

export interface ExemploComissao {
  /** Comissão de cada mensalidade paga no plano mensal (1ª, 2ª, 3ª e 4ª). */
  parcelasMensal: { mensalidade: number; percentual: number; centavos: number }[];
  totalMensal: number;
  anual: number;
  anualFundador: number;
}

/** Comissão do representante numa venda do plano, nos três cenários da página. */
export function exemploComissao(plano: Plano, regras: RegrasCobranca): ExemploComissao {
  const base = {
    origem: "plano" as const,
    mesesCobradosNoAnual: plano.mesesCobradosNoAnual,
    temRepresentante: true,
    pagamentoConfirmado: true,
  };
  const comissao = (periodicidade: Periodicidade, fundador: boolean, numeroMensalidade = 1) =>
    calcularComissao({
      ...base,
      periodicidade,
      numeroMensalidade,
      valorPagoCentavos: valorPlano(plano, periodicidade, fundador, regras),
    })?.valorCentavos ?? 0;

  const parcelasMensal = PERCENTUAIS_COMISSAO_MENSAL.map((percentual, i) => ({
    mensalidade: i + 1,
    percentual,
    centavos: comissao("mensal", false, i + 1),
  }));
  return {
    parcelasMensal,
    totalMensal: parcelasMensal.reduce((total, p) => total + p.centavos, 0),
    anual: comissao("anual", false),
    anualFundador: comissao("anual", true),
  };
}

/**
 * Valor do plano escolhido no cadastro assistido, em texto: "R$ 29,90 por mês",
 * "R$ 299,00 por ano" (com o valor de Fundador do 1º ano, até o prazo) ou
 * "Grátis". O script do FormularioAnunciante refaz o mesmo texto no navegador.
 */
export function textoValorPlano(
  valores: { mensal: number; anual: number; anualFundador: number | null } | undefined,
  periodicidade: Periodicidade,
): { valor: string; fundador: string } {
  if (!valores) return { valor: "", fundador: "" };
  if (valores.mensal === 0) return { valor: "Grátis", fundador: "" };
  if (periodicidade === "mensal") return { valor: `${formatarCentavos(valores.mensal)} por mês`, fundador: "" };
  return {
    valor: `${formatarCentavos(valores.anual)} por ano`,
    fundador: valores.anualFundador === null ? "" : `Fundador: ${formatarCentavos(valores.anualFundador)} no 1º ano`,
  };
}
