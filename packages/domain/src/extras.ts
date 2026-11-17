// Contratação de extras e pagamento do evento avulso (decisões B3 e P1 a P4 e
// E1 a E3 de 17/11/2026):
// - todo extra tem vencimento próprio, no mesmo dia do mês (ou do ano) em que
//   foi pago, mesmo para quem tem plano pago (B3);
// - o extra que vence e não é renovado dentro da tolerância (7 dias) acaba
//   (E2); o banco repete a regra em interno.aplicar_vencimentos;
// - o evento avulso é pago por bloco de 7 dias, sem renovação; mudar as datas
//   só dentro dos blocos pagos, e o que passar deles é um pagamento
//   complementar (E3);
// - devolução do evento avulso: até 7 dias depois do pagamento e até a véspera
//   do primeiro dia do evento, o que vier primeiro (E1).
// Junta as regras de cobranca.ts, comissao.ts e assinatura.ts, para a
// administração gravar tudo de uma vez.
import { periodoDoPagamento, prazoParaDesistir, type AssinaturaAnterior, type PeriodoPago } from "./assinatura";
import { blocosDoEventoAvulso } from "./agenda";
import {
  anoComoFundador,
  calcularCobrancaExtra,
  percentualFundadorNoAno,
  type Cobranca,
  type Periodicidade,
  type ValoresExtra,
} from "./cobranca";
import { aplicarDescontoRepresentante, calcularComissao, calcularComissaoCarteira, liberacaoDaComissao, type Comissao } from "./comissao";
import { somarDias, type DataISO } from "./datas";
import { precoDaRenovacao, type PrecoVigente } from "./precos";
import type { DegrauDescontoFundador, TipoAnunciante } from "@acheaqui/types";

/** Como o extra é cobrado: por mês (ou ano), por dia (Banner Exclusivo) ou por evento (evento avulso). */
export type CobrancaExtra = "mensal" | "por_dia" | "por_evento";

/**
 * Por que o anunciante não pode contratar o extra agora, ou null quando pode.
 * Os extras "por dia" e "por evento" têm fluxo próprio (calendário do Banner e
 * pagamento do evento), fora da contratação mensal.
 */
export function impedimentoParaContratarExtra(entrada: {
  extra: { ativo: boolean; cobranca: CobrancaExtra; soComercio: boolean };
  tipoAnunciante: TipoAnunciante;
  /** O anunciante já tem este extra em dia (ou dentro da tolerância): o pagamento é renovação, não contratação nova. */
  jaContratado: boolean;
}): string | null {
  const { extra } = entrada;
  if (!extra.ativo) return "Este extra está desligado no catálogo.";
  if (extra.cobranca !== "mensal") return "Este extra não é contratado por mês: ele tem um fluxo próprio.";
  if (extra.soComercio && entrada.tipoAnunciante !== "comercio") return "Este extra é só para comércios.";
  if (entrada.jaContratado) return "O anunciante já tem este extra: registre a renovação.";
  return null;
}

export interface EntradaPagamentoExtra {
  /** Preço de hoje: vale para quem contrata e para quem volta depois da tolerância. */
  extra: ValoresExtra;
  /** Histórico de preços do extra: na renovação, o aumento só vale se avisado com 30 dias (precoDaRenovacao). */
  historicoExtra?: readonly PrecoVigente[];
  periodicidade: Periodicidade;
  pagoEm: DataISO;
  /** Dia em que a equipe confirma o pagamento: a comissão espera 7 dias a partir dele. */
  confirmadoEm: DataISO;
  regras: {
    escalaDescontoFundador: readonly DegrauDescontoFundador[];
    toleranciaVencimentoDias: number;
    aberturaAoPublico: DataISO;
  };
  /** A contratação deste extra, se já houve pagamento, com quantos pagamentos válidos teve. */
  contratacao: (AssinaturaAnterior & { pagamentosAnteriores: number }) | null;
  /** O anunciante é Fundador desde este dia (o desconto vale nos pacotes que aceitam). */
  fundadorDesde: DataISO | null;
  /**
   * Atendimento de um representante na venda deste pagamento. recebeComissao
   * é falso para o sócio. null quando o anunciante contratou sozinho.
   */
  atendimento: { recebeComissao: boolean } | null;
  /** Carteira do representante que trouxe o anunciante (5%, nas configurações); null sem carteira. */
  carteira: { percentual: number } | null;
  /** Desconto do representante, só no 1º pagamento e até a comissão dele. */
  descontoVendaCentavos?: number;
}

export interface PagamentoExtraCalculado {
  periodo: PeriodoPago;
  /** Qual pagamento da contratação este é (1, 2, 3...). */
  numero: number;
  cobranca: Cobranca;
  /** Comissão de venda (20% no 1º pagamento com atendimento), já sem o desconto do representante. */
  comissao: Comissao | null;
  descontoRepresentanteCentavos: number;
  valorCobradoCentavos: number;
  /** Carteira: do 2º pagamento em diante do extra vendido com atendimento, ou desde o 1º do contratado sozinho. */
  comissaoCarteira: Comissao | null;
  comissaoLiberaEm: DataISO | null;
}

/** Tudo o que o registro de um pagamento de extra mensal (ou anual) grava. */
export function calcularPagamentoExtra(entrada: EntradaPagamentoExtra): PagamentoExtraCalculado {
  const { periodicidade, pagoEm, regras, contratacao } = entrada;
  if (entrada.extra.valorMensalCentavos <= 0) throw new RangeError("Extra sem valor não tem pagamento.");
  if (entrada.confirmadoEm < pagoEm) throw new RangeError("O pagamento não pode ser confirmado antes de ser feito.");

  const periodo = periodoDoPagamento({
    pagoEm,
    periodicidade,
    aberturaAoPublico: regras.aberturaAoPublico,
    toleranciaDias: regras.toleranciaVencimentoDias,
    anterior: contratacao,
  });
  // Depois da tolerância, a contratação recomeça: é uma venda nova.
  const numero = periodo.renovacao ? (contratacao?.pagamentosAnteriores ?? 0) + 1 : 1;
  const valores =
    periodo.renovacao && entrada.historicoExtra?.length
      ? { ...entrada.extra, ...precoDaRenovacao({ historico: entrada.historicoExtra, inicioPeriodo: periodo.inicio, periodicidade, hoje: entrada.confirmadoEm }) }
      : entrada.extra;

  const percentualFundador = entrada.fundadorDesde
    ? percentualFundadorNoAno(regras.escalaDescontoFundador, anoComoFundador(entrada.fundadorDesde, periodo.inicio))
    : 0;
  const cobranca = calcularCobrancaExtra(valores, periodicidade, { fundador: entrada.fundadorDesde !== null, percentualFundador });

  const venda = (recebeComissao: boolean) =>
    calcularComissao({
      origem: "extra",
      periodicidade,
      valorPagoCentavos: cobranca.valorDevidoCentavos,
      numeroMensalidade: numero,
      mesesCobradosNoAnual: valores.mesesCobradosNoAnual,
      temRepresentante: recebeComissao,
      pagamentoConfirmado: true,
    });
  const bruta = venda(entrada.atendimento?.recebeComissao ?? false);
  const descontoRepresentanteCentavos = entrada.descontoVendaCentavos ?? 0;
  if (descontoRepresentanteCentavos !== 0 && !bruta) {
    throw new RangeError("O desconto do representante só vale no 1º pagamento de uma venda com comissão.");
  }
  const comissao = liquida(bruta, descontoRepresentanteCentavos);
  const valorCobradoCentavos = cobranca.valorDevidoCentavos - descontoRepresentanteCentavos;
  // Um pagamento nunca gera venda e carteira: o 1º pagamento com atendimento é a venda, recebendo ou não quem atendeu.
  const comissaoCarteira = entrada.carteira
    ? calcularComissaoCarteira({
        valorPagoCentavos: valorCobradoCentavos,
        percentual: entrada.carteira.percentual,
        faseDeVenda: entrada.atendimento !== null && venda(true) !== null,
      })
    : null;

  return {
    periodo,
    numero,
    cobranca,
    comissao,
    descontoRepresentanteCentavos,
    valorCobradoCentavos,
    comissaoCarteira,
    comissaoLiberaEm: comissao || comissaoCarteira ? liberacaoDaComissao(entrada.confirmadoEm) : null,
  };
}

export interface EntradaPagamentoEvento {
  /** Datas do evento hoje: o pagamento cobre os blocos de 7 dias entre elas. */
  inicio: DataISO;
  fim: DataISO;
  valorBlocoCentavos: number;
  /** Blocos já pagos (pagamentos válidos anteriores): o pagamento complementar cobra só o que falta (E3). */
  blocosJaPagos: number;
  pagoEm: DataISO;
  confirmadoEm: DataISO;
  /** Atendimento de um representante nesta venda; null quando o produtor procurou a equipe sozinho. */
  atendimento: { recebeComissao: boolean } | null;
  /** Carteira, quando quem paga é um anunciante trazido por um representante; null nos outros casos. */
  carteira: { percentual: number } | null;
  descontoVendaCentavos?: number;
}

export interface PagamentoEventoCalculado {
  /** Blocos do evento inteiro e os que este pagamento cobra. */
  blocos: number;
  blocosPagos: number;
  valorCentavos: number;
  comissao: Comissao | null;
  descontoRepresentanteCentavos: number;
  valorCobradoCentavos: number;
  comissaoCarteira: Comissao | null;
  comissaoLiberaEm: DataISO | null;
}

/**
 * Pagamento do evento avulso: os blocos que faltam pagar, sem desconto de
 * Fundador. Com atendimento, 20% do valor pago (comissão de extra), em todo
 * pagamento do evento, porque cada um é uma venda de blocos.
 */
export function calcularPagamentoEvento(entrada: EntradaPagamentoEvento): PagamentoEventoCalculado {
  if (entrada.confirmadoEm < entrada.pagoEm) throw new RangeError("O pagamento não pode ser confirmado antes de ser feito.");
  if (!Number.isInteger(entrada.valorBlocoCentavos) || entrada.valorBlocoCentavos <= 0) {
    throw new RangeError(`Valor do bloco inválido: ${entrada.valorBlocoCentavos}.`);
  }
  if (!Number.isInteger(entrada.blocosJaPagos) || entrada.blocosJaPagos < 0) throw new RangeError("Blocos já pagos inválidos.");
  const blocos = blocosDoEventoAvulso(entrada.inicio, entrada.fim);
  const blocosPagos = blocos - entrada.blocosJaPagos;
  if (blocosPagos <= 0) throw new RangeError("Os blocos deste evento já estão pagos.");
  const valorCentavos = blocosPagos * entrada.valorBlocoCentavos;

  const venda = (recebeComissao: boolean) =>
    calcularComissao({
      origem: "extra",
      periodicidade: "mensal",
      valorPagoCentavos: valorCentavos,
      numeroMensalidade: 1,
      mesesCobradosNoAnual: 1,
      temRepresentante: recebeComissao,
      pagamentoConfirmado: true,
    });
  const bruta = venda(entrada.atendimento?.recebeComissao ?? false);
  const descontoRepresentanteCentavos = entrada.descontoVendaCentavos ?? 0;
  if (descontoRepresentanteCentavos !== 0 && !bruta) {
    throw new RangeError("O desconto do representante só vale numa venda com comissão.");
  }
  const comissao = liquida(bruta, descontoRepresentanteCentavos);
  const valorCobradoCentavos = valorCentavos - descontoRepresentanteCentavos;
  const comissaoCarteira = entrada.carteira
    ? calcularComissaoCarteira({ valorPagoCentavos: valorCobradoCentavos, percentual: entrada.carteira.percentual, faseDeVenda: entrada.atendimento !== null })
    : null;
  return {
    blocos,
    blocosPagos,
    valorCentavos,
    comissao,
    descontoRepresentanteCentavos,
    valorCobradoCentavos,
    comissaoCarteira,
    comissaoLiberaEm: comissao || comissaoCarteira ? liberacaoDaComissao(entrada.confirmadoEm) : null,
  };
}

/** As datas novas de um evento já pago cabem nos blocos pagos (E3)? Sem pagamento, qualquer data serve. */
export function datasCabemNosBlocosPagos(evento: { inicio: DataISO; fim: DataISO; blocosPagos: number }): boolean {
  return evento.blocosPagos === 0 || blocosDoEventoAvulso(evento.inicio, evento.fim) <= evento.blocosPagos;
}

/**
 * Último dia para desistir do evento avulso (E1): 7 dias depois do pagamento,
 * mas no máximo a véspera do primeiro dia do evento. Pago no dia do evento (ou
 * depois de ele começar), o prazo fica antes do pagamento: não há devolução.
 */
export function prazoParaDesistirDoEvento(pagoEm: DataISO, inicioDoEvento: DataISO): DataISO {
  const vespera = somarDias(inicioDoEvento, -1);
  const prazo = prazoParaDesistir(pagoEm);
  return vespera < prazo ? vespera : prazo;
}

/** O evento avulso pode ser devolvido hoje (E1)? */
export function podeDevolverEvento(pagamento: { pagoEm: DataISO; inicioDoEvento: DataISO; hoje: DataISO }): boolean {
  return pagamento.hoje <= prazoParaDesistirDoEvento(pagamento.pagoEm, pagamento.inicioDoEvento);
}

/** Comissão menos o desconto dado pelo representante; null quando não sobra nada. */
function liquida(comissao: Comissao | null, descontoCentavos: number): Comissao | null {
  if (!comissao) return null;
  const { comissaoCentavos } = aplicarDescontoRepresentante({ valorCentavos: comissao.valorCentavos, comissaoCentavos: comissao.valorCentavos, descontoCentavos });
  return comissaoCentavos > 0 ? { ...comissao, valorCentavos: comissaoCentavos } : null;
}
