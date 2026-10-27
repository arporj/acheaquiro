// Valor da cobrança, desconto de Fundador e vencimento (itens 4.15, 4.16 e 6.1;
// Especificação Técnica, seções 8.3 e 8.5). Valores sempre em centavos.
import type { DegrauDescontoFundador, TipoAnunciante } from "@acheaqui/types";
import { mesesEntre, somarDias, somarMeses, type DataISO } from "./datas";

export type Periodicidade = "mensal" | "anual";

/**
 * O anunciante pode desistir em até 7 dias depois do primeiro pagamento de uma
 * contratação, com o dinheiro devolvido (decisão 11). A comissão espera o
 * mesmo prazo (DIAS_ESPERA_COMISSAO).
 */
export const DIAS_PARA_DESISTIR = 7;

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
  /** Percentual do ano de assinatura do Fundador (percentualFundadorNoAno). */
  percentualFundador: number;
}

/**
 * Confere a escala do desconto de Fundador, que vem da tabela de configurações:
 * ao menos um degrau, anos crescentes a partir do 1, percentuais inteiros de 0
 * a 100 e só o último degrau sem fim.
 */
export function validarEscalaFundador(escala: readonly DegrauDescontoFundador[]): void {
  if (escala.length === 0) throw new RangeError("A escala do desconto de Fundador precisa de ao menos um degrau.");
  let anoAnterior = 0;
  escala.forEach((degrau, posicao) => {
    if (!Number.isInteger(degrau.percentual) || degrau.percentual < 0 || degrau.percentual > 100) {
      throw new RangeError("Percentual do desconto de Fundador precisa ser inteiro, de 0 a 100.");
    }
    const ultimo = posicao === escala.length - 1;
    if (ultimo) {
      if (degrau.ateAno !== undefined) throw new RangeError("O último degrau do desconto de Fundador não tem ano final.");
      return;
    }
    if (degrau.ateAno === undefined || !Number.isInteger(degrau.ateAno) || degrau.ateAno <= anoAnterior) {
      throw new RangeError("Os anos da escala do desconto de Fundador precisam ser inteiros e crescentes, a partir do 1.");
    }
    anoAnterior = degrau.ateAno;
  });
}

/** Percentual de desconto do Fundador no ano de assinatura (1 = primeiro ano). */
export function percentualFundadorNoAno(escala: readonly DegrauDescontoFundador[], ano: number): number {
  validarEscalaFundador(escala);
  if (!Number.isInteger(ano) || ano < 1) throw new RangeError("O ano de assinatura começa em 1.");
  const degrau = escala.find((d) => d.ateAno === undefined || ano <= d.ateAno);
  // validarEscalaFundador garante o último degrau sem fim: sempre há um degrau.
  return degrau!.percentual;
}

/**
 * Em qual ano de assinatura cai um período, contado pelos aniversários do
 * primeiro pagamento anual: o período que começa no 1º aniversário já é o 2º ano.
 */
export function anoComoFundador(fundadorDesde: DataISO, inicioDoPeriodo: DataISO): number {
  if (inicioDoPeriodo < fundadorDesde) throw new RangeError("O período não pode começar antes de a pessoa virar Fundador.");
  let ano = 1;
  while (somarMeses(fundadorDesde, 12 * ano) <= inicioDoPeriodo) ano += 1;
  return ano;
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

/**
 * O desconto de Fundador no plano só existe no anual: o Fundador renova
 * sempre no anual, e quem passa para o mensal deixa de ser Fundador (20/10/2026).
 */
export function calcularCobrancaPlano(
  plano: ValoresPlano,
  periodicidade: Periodicidade,
  desconto: DescontoFundador,
): Cobranca {
  if (desconto.fundador && periodicidade === "mensal") {
    throw new RangeError("O Fundador renova o plano só no anual; no mensal, deixa de ser Fundador.");
  }
  const meses = periodicidade === "anual" ? plano.mesesCobradosNoAnual : 1;
  return calcular(plano.valorMensalCentavos, meses, desconto.fundador ? desconto.percentualFundador : 0);
}

export interface ValoresExtra extends ValoresPlano {
  /** Pacotes (fotos, categoria, encarte, produtos, endereço) têm desconto de Fundador; destaques não. */
  aceitaDescontoFundador: boolean;
  /** Extras sem venda no anual. O Destaque Exclusivo, vendido por dia, tem regra própria (destaque.ts). */
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

/**
 * Vencimento seguinte, sempre no dia em que a assinatura começou (a âncora),
 * mesmo quando o anunciante paga antes (item 4.15). Os meses contam da âncora,
 * e não do vencimento anterior: começando em 31/01, vence em 28/02 e depois
 * em 31/03, e não em 28/03.
 */
export function vencimentoSeguinte(ancora: DataISO, vencimentoAtual: DataISO, periodicidade: Periodicidade): DataISO {
  if (vencimentoAtual < ancora) throw new RangeError("O vencimento não pode ser antes do início da assinatura.");
  return somarMeses(ancora, mesesEntre(ancora, vencimentoAtual) + (periodicidade === "anual" ? 12 : 1));
}

export type SituacaoCobranca = "em_dia" | "em_atraso" | "vencida";

/**
 * O plano vale até o fim do dia do vencimento. Depois, o anunciante tem a
 * tolerância (7 dias) para pagar: "em atraso", no card da administração.
 * Passada a tolerância, "vencida" (efeitoDoVencimento).
 */
export function situacaoCobranca(assinatura: { venceEm: DataISO; hoje: DataISO; toleranciaDias: number }): SituacaoCobranca {
  if (assinatura.hoje <= assinatura.venceEm) return "em_dia";
  return assinatura.hoje <= somarDias(assinatura.venceEm, assinatura.toleranciaDias) ? "em_atraso" : "vencida";
}

/** Plano vencido sem pagamento: autônomo fica escondido; comércio vai para o Gratuito. */
export function efeitoDoVencimento(tipo: TipoAnunciante): "escondido_por_vencimento" | "plano_gratuito" {
  return tipo === "profissional" ? "escondido_por_vencimento" : "plano_gratuito";
}

/**
 * O Fundador perde a condição quando a assinatura vence e a renovação não é
 * paga dentro da tolerância (decisão 9: 7 dias), ou quando renova no mensal:
 * a renovação do Fundador é sempre anual (20/10/2026). A perda é definitiva.
 */
export function perdeCondicaoFundador(situacao: {
  venceuEm: DataISO;
  /** Data em que a renovação foi paga, se foi. */
  renovadaEm?: DataISO;
  /** Período escolhido na renovação, se já foi escolhido. */
  periodicidadeRenovacao?: Periodicidade;
  hoje: DataISO;
  toleranciaDias: number;
}): boolean {
  if (situacao.periodicidadeRenovacao === "mensal") return true;
  const limite = somarDias(situacao.venceuEm, situacao.toleranciaDias);
  return (situacao.renovadaEm ?? situacao.hoje) > limite;
}
