// Pagamento do plano registrado pela equipe (item 4.15; decisões de 27/10/2026):
// o período que ele paga, o Fundador, o valor e a comissão do representante.
// Junta as regras de cobranca.ts e comissao.ts numa conta só, para a
// administração gravar tudo de uma vez.
import {
  anoComoFundador,
  calcularCobrancaPlano,
  DIAS_PARA_DESISTIR,
  percentualFundadorNoAno,
  perdeCondicaoFundador,
  tornaFundador,
  vencimentoSeguinte,
  type Cobranca,
  type Periodicidade,
  type ValoresPlano,
} from "./cobranca";
import { calcularComissao, liberacaoDaComissao, type Comissao } from "./comissao";
import { diasEntre, somarDias, type DataISO } from "./datas";
import type { DegrauDescontoFundador } from "@acheaqui/types";

export interface AssinaturaAnterior {
  /** Dia em que a assinatura começou: os vencimentos caem sempre nesse dia. */
  ancora: DataISO;
  venceEm: DataISO;
}

export interface PeriodoPago {
  ancora: DataISO;
  inicio: DataISO;
  venceEm: DataISO;
  /** O pagamento renova a assinatura sem interrupção (antes do vencimento ou dentro da tolerância). */
  renovacao: boolean;
}

/**
 * Período pago:
 * - renovação paga antes do vencimento, ou até a tolerância (7 dias) depois
 *   dele: começa no vencimento anterior e mantém o dia (item 4.15);
 * - primeiro pagamento, ou pagamento depois da tolerância: começa no dia do
 *   pagamento, que vira o novo dia de vencimento;
 * - pagamento feito antes da abertura do site: começa na abertura (decisão de
 *   27/10/2026), sem período gratuito e sem perder dias.
 */
export function periodoDoPagamento(entrada: {
  pagoEm: DataISO;
  periodicidade: Periodicidade;
  aberturaAoPublico: DataISO;
  toleranciaDias: number;
  anterior: AssinaturaAnterior | null;
}): PeriodoPago {
  const { pagoEm, periodicidade, anterior } = entrada;
  if (anterior && pagoEm <= somarDias(anterior.venceEm, entrada.toleranciaDias)) {
    return {
      ancora: anterior.ancora,
      inicio: anterior.venceEm,
      venceEm: vencimentoSeguinte(anterior.ancora, anterior.venceEm, periodicidade),
      renovacao: true,
    };
  }
  const inicio = pagoEm < entrada.aberturaAoPublico ? entrada.aberturaAoPublico : pagoEm;
  return { ancora: inicio, inicio, venceEm: vencimentoSeguinte(inicio, inicio, periodicidade), renovacao: false };
}

/**
 * A devolução vale para o primeiro pagamento de uma contratação, em até 7 dias
 * depois dele (decisão 11). Renovação não tem devolução.
 */
export function podeDevolver(pagamento: { numero: number; pagoEm: DataISO; hoje: DataISO }): boolean {
  return pagamento.numero === 1 && pagamento.hoje <= somarDias(pagamento.pagoEm, DIAS_PARA_DESISTIR);
}

export interface EntradaPagamentoPlano {
  plano: ValoresPlano;
  periodicidade: Periodicidade;
  pagoEm: DataISO;
  /** Dia em que a equipe confirma o pagamento na administração: a comissão espera 7 dias a partir dele. */
  confirmadoEm: DataISO;
  regras: {
    escalaDescontoFundador: readonly DegrauDescontoFundador[];
    prazoFundador: DataISO;
    toleranciaVencimentoDias: number;
    aberturaAoPublico: DataISO;
  };
  /**
   * A assinatura do anunciante, se já houve pagamento: quantos pagamentos
   * válidos (não devolvidos) teve e se algum deles foi anual.
   */
  assinatura: (AssinaturaAnterior & { pagamentosAnteriores: number; algumAnual: boolean }) | null;
  /** O anunciante já é Fundador, desde o início do primeiro período anual. */
  fundadorDesde: DataISO | null;
  /** O representante que atendeu a venda recebe comissão (o sócio, por enquanto, não). */
  representanteRecebeComissao: boolean;
}

export interface PagamentoPlanoCalculado {
  periodo: PeriodoPago;
  /** Qual pagamento da assinatura este é (1, 2, 3...), para a comissão do mensal. */
  numero: number;
  cobranca: Cobranca;
  fundador: {
    /** Fundador depois deste pagamento. */
    fundador: boolean;
    fundadorDesde: DataISO | null;
    /** Virou Fundador com este pagamento. */
    tornou: boolean;
    /** Deixou de ser Fundador com este pagamento (renovou no mensal ou depois da tolerância). */
    perdeu: boolean;
  };
  comissao: Comissao | null;
  comissaoLiberaEm: DataISO | null;
}

/** Tudo o que o registro de um pagamento do plano grava, calculado pelas regras do domínio. */
export function calcularPagamentoPlano(entrada: EntradaPagamentoPlano): PagamentoPlanoCalculado {
  const { plano, periodicidade, pagoEm, regras, assinatura } = entrada;
  if (plano.valorMensalCentavos <= 0) throw new RangeError("Plano gratuito não tem pagamento.");
  if (entrada.confirmadoEm < pagoEm) throw new RangeError("O pagamento não pode ser confirmado antes de ser feito.");

  const periodo = periodoDoPagamento({
    pagoEm,
    periodicidade,
    aberturaAoPublico: regras.aberturaAoPublico,
    toleranciaDias: regras.toleranciaVencimentoDias,
    anterior: assinatura,
  });

  // Fundador: quem já é continua só renovando no anual, sem interrupção.
  let fundadorDesde = entrada.fundadorDesde;
  let perdeu = false;
  let tornou = false;
  if (fundadorDesde) {
    perdeu =
      !assinatura ||
      perdeCondicaoFundador({
        venceuEm: assinatura.venceEm,
        renovadaEm: pagoEm,
        periodicidadeRenovacao: periodicidade,
        hoje: pagoEm,
        toleranciaDias: regras.toleranciaVencimentoDias,
      });
    if (perdeu) fundadorDesde = null;
  } else if (
    tornaFundador({
      periodicidade,
      valorMensalPlanoCentavos: plano.valorMensalCentavos,
      comprovanteEnviadoEm: pagoEm,
      prazoFundador: regras.prazoFundador,
    })
  ) {
    fundadorDesde = periodo.inicio;
    tornou = true;
  }

  const percentualFundador = fundadorDesde
    ? percentualFundadorNoAno(regras.escalaDescontoFundador, anoComoFundador(fundadorDesde, periodo.inicio))
    : 0;
  const cobranca = calcularCobrancaPlano(plano, periodicidade, { fundador: fundadorDesde !== null, percentualFundador });

  // Depois de uma interrupção, a assinatura recomeça, mas a comissão não: o
  // representante recebe os 135% uma vez por anunciante. Quem já pagou um
  // anual já gerou os 135% de uma vez: passar para o mensal não gera parcelas.
  // Quem passa do mensal para o anual completa os 135% (decisão M1).
  const numero = (assinatura?.pagamentosAnteriores ?? 0) + 1;
  const comissao = calcularComissao({
    origem: "plano",
    periodicidade,
    valorPagoCentavos: cobranca.valorDevidoCentavos,
    numeroMensalidade: numero,
    mesesCobradosNoAnual: plano.mesesCobradosNoAnual,
    mensalidadesComissionadasAntes: assinatura?.algumAnual ? 0 : (assinatura?.pagamentosAnteriores ?? 0),
    temRepresentante: entrada.representanteRecebeComissao && !assinatura?.algumAnual,
    pagamentoConfirmado: true,
  });

  return {
    periodo,
    numero,
    cobranca,
    fundador: { fundador: fundadorDesde !== null, fundadorDesde, tornou, perdeu },
    comissao,
    comissaoLiberaEm: comissao ? liberacaoDaComissao(entrada.confirmadoEm) : null,
  };
}

/**
 * Valor que o anunciante paga ao mudar para um plano maior no meio do período
 * (decisão de 23/10/2026): a diferença entre os valores do período (mensal ou
 * anual, já com o desconto de Fundador), proporcional aos dias que faltam até
 * o vencimento. O plano muda na hora; o vencimento continua o mesmo.
 */
export function valorProporcionalUpgrade(entrada: {
  valorPeriodoAtualCentavos: number;
  valorPeriodoNovoCentavos: number;
  inicio: DataISO;
  venceEm: DataISO;
  hoje: DataISO;
}): number {
  const { valorPeriodoAtualCentavos: atual, valorPeriodoNovoCentavos: novo } = entrada;
  if (!Number.isInteger(atual) || !Number.isInteger(novo) || atual < 0 || novo <= atual) {
    throw new RangeError("O plano novo precisa custar mais que o atual, em centavos inteiros.");
  }
  const total = diasEntre(entrada.inicio, entrada.venceEm);
  const faltam = diasEntre(entrada.hoje, entrada.venceEm);
  if (total <= 0 || faltam < 0 || faltam > total) throw new RangeError("A mudança precisa cair dentro do período pago.");
  // Arredonda metade para cima, só com inteiros.
  return Math.floor(((novo - atual) * faltam * 2 + total) / (2 * total));
}
