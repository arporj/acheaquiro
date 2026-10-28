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
import { aplicarDescontoRepresentante, calcularComissao, calcularComissaoCarteira, liberacaoDaComissao, type Comissao } from "./comissao";
import { diasEntre, somarDias, type DataISO } from "./datas";
import { precoDaRenovacao, type PrecoVigente } from "./precos";
import { parcelasDoPagamento, type FaixaUpgrade, type ParcelaDaFaixa } from "./upgrade";
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
  /** Preço de hoje: vale para quem contrata (e para quem volta depois da tolerância). */
  plano: ValoresPlano;
  /**
   * Histórico de preços do plano. Na renovação, um aumento só vale se foi
   * avisado pelo menos 30 dias antes (precoDaRenovacao). Sem histórico, vale o preço de hoje.
   */
  historicoPlano?: readonly PrecoVigente[];
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
  /**
   * Carteira do representante que trouxe o anunciante, se ele está ativo e
   * recebe comissão: o percentual (5%) vem das configurações. null sem carteira.
   */
  carteira: { percentual: number } | null;
  /**
   * Plano vendido pelo representante da venda, quando o pagamento é de outro
   * plano: as parcelas dele ficam sobre o valor desse plano, e a diferença é
   * de quem vendeu o upgrade (decisão S8, 28/10/2026). null no mesmo plano.
   */
  planoVendido?: ValoresPlano | null;
  /** Upgrades vendidos com atendimento, na ordem da venda: as parcelas saem quando cabem (decisão S7). */
  faixasUpgrade?: readonly FaixaUpgrade[];
  /** Desconto do representante na venda, só no 1º pagamento e até a comissão dele (decisão de 23/10/2026). */
  descontoVendaCentavos?: number;
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
  /** Comissão de venda, para o representante que atendeu a venda do plano, já sem o desconto que ele deu. */
  comissao: Comissao | null;
  /** Parcelas dos upgrades neste pagamento (as comissões já sem o desconto da 1ª parcela). */
  parcelasUpgrade: ParcelaDaFaixa[];
  /** Descontos dados pelos representantes neste pagamento. */
  descontoRepresentanteCentavos: number;
  /** O que o anunciante paga: o valor devido menos o desconto do representante. */
  valorCobradoCentavos: number;
  /** Comissão de carteira, para o representante que trouxe o anunciante, nos pagamentos fora da fase de venda. */
  comissaoCarteira: Comissao | null;
  /** As duas esperam os mesmos 7 dias. */
  comissaoLiberaEm: DataISO | null;
}

/** Tudo o que o registro de um pagamento do plano grava, calculado pelas regras do domínio. */
export function calcularPagamentoPlano(entrada: EntradaPagamentoPlano): PagamentoPlanoCalculado {
  const { periodicidade, pagoEm, regras, assinatura } = entrada;
  if (entrada.plano.valorMensalCentavos <= 0) throw new RangeError("Plano gratuito não tem pagamento.");
  if (entrada.confirmadoEm < pagoEm) throw new RangeError("O pagamento não pode ser confirmado antes de ser feito.");

  const periodo = periodoDoPagamento({
    pagoEm,
    periodicidade,
    aberturaAoPublico: regras.aberturaAoPublico,
    toleranciaDias: regras.toleranciaVencimentoDias,
    anterior: assinatura,
  });
  const plano =
    periodo.renovacao && entrada.historicoPlano?.length
      ? precoDaRenovacao({ historico: entrada.historicoPlano, inicioPeriodo: periodo.inicio, periodicidade, hoje: entrada.confirmadoEm })
      : entrada.plano;

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
  // Decisão S8: com o plano mudado, as parcelas da venda ficam no valor do plano vendido.
  const baseVenda = entrada.planoVendido
    ? Math.min(
        cobranca.valorDevidoCentavos,
        calcularCobrancaPlano(entrada.planoVendido, periodicidade, { fundador: fundadorDesde !== null, percentualFundador }).valorDevidoCentavos,
      )
    : cobranca.valorDevidoCentavos;
  const venda = (temRepresentante: boolean) =>
    calcularComissao({
      origem: "plano",
      periodicidade,
      valorPagoCentavos: baseVenda,
      numeroMensalidade: numero,
      mesesCobradosNoAnual: plano.mesesCobradosNoAnual,
      mensalidadesComissionadasAntes: assinatura?.algumAnual ? 0 : (assinatura?.pagamentosAnteriores ?? 0),
      temRepresentante: temRepresentante && !assinatura?.algumAnual,
      pagamentoConfirmado: true,
    });
  const comissaoBruta = venda(entrada.representanteRecebeComissao);
  const descontoVenda = entrada.descontoVendaCentavos ?? 0;
  if (descontoVenda !== 0 && (!comissaoBruta || numero !== 1)) {
    throw new RangeError("O desconto do representante só vale no 1º pagamento de uma venda com comissão.");
  }
  const comissao = liquida(comissaoBruta, descontoVenda);
  // As parcelas dos upgrades vêm depois da venda, no que sobra do pagamento.
  const { parcelas } = parcelasDoPagamento({
    valorCentavos: cobranca.valorDevidoCentavos - (comissaoBruta?.valorCentavos ?? 0),
    faixas: entrada.faixasUpgrade ?? [],
    periodicidade,
    percentualFundador,
  });
  const parcelasUpgrade = parcelas.map((p) => ({ ...p, comissao: liquida(p.comissao, p.descontoCentavos) }));
  const descontoRepresentanteCentavos = descontoVenda + parcelas.reduce((soma, p) => soma + p.descontoCentavos, 0);
  // A carteira começa quando acaba a fase de venda (os 135% do plano e dos
  // upgrades), recebendo ou não quem vendeu: um pagamento nunca gera as duas.
  const comissaoCarteira = entrada.carteira
    ? calcularComissaoCarteira({
        valorPagoCentavos: cobranca.valorDevidoCentavos - descontoRepresentanteCentavos,
        percentual: entrada.carteira.percentual,
        faseDeVenda: venda(true) !== null || parcelas.some((p) => p.comissao !== null),
      })
    : null;

  return {
    periodo,
    numero,
    cobranca,
    fundador: { fundador: fundadorDesde !== null, fundadorDesde, tornou, perdeu },
    comissao,
    parcelasUpgrade,
    descontoRepresentanteCentavos,
    valorCobradoCentavos: cobranca.valorDevidoCentavos - descontoRepresentanteCentavos,
    comissaoCarteira,
    comissaoLiberaEm:
      comissao || comissaoCarteira || parcelasUpgrade.some((p) => p.comissao) ? liberacaoDaComissao(entrada.confirmadoEm) : null,
  };
}

/** Comissão menos o desconto dado pelo representante; null quando não sobra nada. */
function liquida(comissao: Comissao | null, descontoCentavos: number): Comissao | null {
  if (!comissao) return null;
  const { comissaoCentavos } = aplicarDescontoRepresentante({ valorCentavos: comissao.valorCentavos, comissaoCentavos: comissao.valorCentavos, descontoCentavos });
  return comissaoCentavos > 0 ? { ...comissao, valorCentavos: comissaoCentavos } : null;
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

export interface EntradaPagamentoUpgrade {
  planoAtual: ValoresPlano;
  planoNovo: ValoresPlano;
  periodicidade: Periodicidade;
  /** Período já pago, que continua: o vencimento não muda. */
  periodo: { inicio: DataISO; venceEm: DataISO };
  pagoEm: DataISO;
  confirmadoEm: DataISO;
  /** Desconto de Fundador do período (0 sem Fundador). */
  percentualFundador: number;
  /** Faixa nova do representante que vendeu o upgrade, com o desconto da proposta; null sem comissão. */
  faixa: FaixaUpgrade | null;
  carteira: { percentual: number } | null;
}

export interface PagamentoUpgradeCalculado {
  /** Diferença proporcional devida, antes do desconto do representante. */
  valorCentavos: number;
  /** A parcela da faixa, se coube neste pagamento (comissão já sem o desconto). */
  parcela: ParcelaDaFaixa | null;
  descontoRepresentanteCentavos: number;
  valorCobradoCentavos: number;
  comissaoCarteira: Comissao | null;
  comissaoLiberaEm: DataISO | null;
}

/**
 * Pagamento da mudança para um plano maior no meio do período: a diferença
 * proporcional (valorProporcionalUpgrade), a 1ª parcela da faixa quando cabe
 * (decisão S7) e, sem parcela de venda, a carteira (decisão S5: a diferença
 * paga entra na carteira como qualquer pagamento).
 */
export function calcularPagamentoUpgrade(entrada: EntradaPagamentoUpgrade): PagamentoUpgradeCalculado {
  const { periodicidade, percentualFundador } = entrada;
  if (entrada.confirmadoEm < entrada.pagoEm) throw new RangeError("O pagamento não pode ser confirmado antes de ser feito.");
  const desconto = { fundador: percentualFundador > 0, percentualFundador };
  const valorCentavos = valorProporcionalUpgrade({
    valorPeriodoAtualCentavos: calcularCobrancaPlano(entrada.planoAtual, periodicidade, desconto).valorDevidoCentavos,
    valorPeriodoNovoCentavos: calcularCobrancaPlano(entrada.planoNovo, periodicidade, desconto).valorDevidoCentavos,
    inicio: entrada.periodo.inicio,
    venceEm: entrada.periodo.venceEm,
    hoje: entrada.pagoEm,
  });
  if (valorCentavos <= 0) throw new RangeError("No dia do vencimento não há diferença a pagar: registre a renovação já no plano novo.");
  const { parcelas } = parcelasDoPagamento({ valorCentavos, faixas: entrada.faixa ? [entrada.faixa] : [], periodicidade, percentualFundador });
  const bruta = parcelas[0] ?? null;
  const parcela = bruta ? { ...bruta, comissao: liquida(bruta.comissao, bruta.descontoCentavos) } : null;
  const descontoRepresentanteCentavos = bruta?.descontoCentavos ?? 0;
  const comissaoCarteira = entrada.carteira
    ? calcularComissaoCarteira({
        valorPagoCentavos: valorCentavos - descontoRepresentanteCentavos,
        percentual: entrada.carteira.percentual,
        faseDeVenda: bruta?.comissao != null,
      })
    : null;
  return {
    valorCentavos,
    parcela,
    descontoRepresentanteCentavos,
    valorCobradoCentavos: valorCentavos - descontoRepresentanteCentavos,
    comissaoCarteira,
    comissaoLiberaEm: parcela?.comissao || comissaoCarteira ? liberacaoDaComissao(entrada.confirmadoEm) : null,
  };
}
