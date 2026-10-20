// Preços e comissões mostrados nas páginas institucionais. As contas são as de
// packages/domain (testadas); aqui só se adapta o formato dos dados das páginas.
import {
  calcularCobrancaExtra,
  calcularCobrancaPlano,
  calcularComissao,
  PERCENTUAIS_COMISSAO_MENSAL,
  type Periodicidade,
} from "@acheaqui/domain";
import type { Extra, Plano, RegrasCobranca } from "@acheaqui/types";
import { formatarPreco } from "./contato";

export function formatarCentavos(centavos: number): string {
  return formatarPreco(centavos / 100);
}

function desconto(fundador: boolean, regras: RegrasCobranca) {
  return { fundador, percentualFundador: regras.percentualDescontoFundador };
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
