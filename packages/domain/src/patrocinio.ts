// Patrocinadores (proposta Patrocinadores v3; decisões de 21 e 22/10/2026).
// O banco repete as travas de vaga, grupo, categoria e ramo
// (supabase/migrations/20261022170000_patrocinadores.sql).
import type { CotaPatrocinio } from "@acheaqui/types";
import { somarDias, somarMeses, type DataISO } from "./datas";

/**
 * Tamanho em que o logo deve ser enviado em cada cota (largura x altura, em
 * pixels), no site de apresentação. Na produção, vem da tabela
 * cotas_patrocinio, editável pela administração.
 */
export const FORMATOS_LOGO_PATROCINIO: Record<CotaPatrocinio, { largura: number; altura: number }> = {
  master: { largura: 600, altura: 600 },
  ouro: { largura: 800, altura: 200 },
  apoio: { largura: 400, altura: 200 },
  grupo: { largura: 400, altura: 200 },
  categoria: { largura: 400, altura: 200 },
  agenda: { largura: 400, altura: 200 },
};

/** Meses de cada contrato de patrocínio. */
export const MESES_DO_PATROCINIO = 12;
/** Site fora do ar por mais que estes dias seguidos: o tempo é somado ao prazo. */
export const DIAS_FORA_DO_AR_SEM_COMPENSAR = 3;
/** Cotas em que entra mais de uma empresa do mesmo ramo. */
const COTAS_SEM_EXCLUSIVIDADE: readonly CotaPatrocinio[] = ["apoio"];

/**
 * Quando abre de novo uma vaga numa cota esgotada: no dia seguinte ao fim do
 * contrato que vence primeiro. `fins` são os últimos dias (AAAA-MM-DD) dos
 * contratos ativos da cota; sem nenhum, não há data a mostrar.
 */
export function novaVagaAPartirDe(fins: DataISO[]): DataISO | undefined {
  if (fins.length === 0) return undefined;
  return somarDias([...fins].sort()[0]!, 1);
}

/**
 * Convite "Quer seu nome aqui? Seja um patrocinador" num espaço que recebe
 * patrocínio (decisão de 29/10/2026): aparece quando o espaço ainda tem lugar
 * (categoria ou grupo sem patrocinador; coluna do rodapé com menos logos que
 * as vagas da cota) e a cota está no catálogo com vaga livre. Cota esgotada ou
 * fora do catálogo não convida.
 */
export function mostraConvitePatrocinio(cota: { vagasLivres: number } | undefined, espacoCheio: boolean): boolean {
  return !espacoCheio && cota !== undefined && cota.vagasLivres > 0;
}

/**
 * Último dia do patrocínio: 12 meses contados do dia em que o logo entrou no
 * ar, mais os dias somados por site fora do ar. Entrou em 27/11/2026, vai até
 * 26/11/2027.
 */
export function fimDoPatrocinio(inicio: DataISO, diasSomados = 0): DataISO {
  if (!Number.isInteger(diasSomados) || diasSomados < 0) throw new RangeError("Dias somados inválidos.");
  return somarDias(somarMeses(inicio, MESES_DO_PATROCINIO), diasSomados - 1);
}

/**
 * Dias a somar ao prazo pelos períodos em que o site ficou fora do ar: só os
 * períodos de mais de 3 dias seguidos contam, e contam inteiros. Cada período
 * vai do primeiro ao último dia fora do ar.
 */
export function diasASomarPorSiteForaDoAr(periodos: { inicio: DataISO; fim: DataISO }[]): number {
  let total = 0;
  for (const { inicio, fim } of periodos) {
    if (fim < inicio) throw new RangeError(`Período fora do ar inválido: ${inicio} a ${fim}.`);
    let dias = 1;
    while (somarDias(inicio, dias) <= fim) dias++;
    if (dias > DIAS_FORA_DO_AR_SEM_COMPENSAR) total += dias;
  }
  return total;
}

/** Valor do patrocínio fechado num dia: o de Fundador até o prazo (inclusive), o cheio depois. */
export function valorDoPatrocinio(
  cota: { valorCentavos: number; valorFundadorCentavos: number },
  fechadoEm: DataISO,
  prazoFundador: DataISO,
): { valorCentavos: number; precoFundador: boolean } {
  const fundador = fechadoEm <= prazoFundador;
  return { valorCentavos: fundador ? cota.valorFundadorCentavos : cota.valorCentavos, precoFundador: fundador };
}

/** Um patrocínio, só com o que importa para as regras de vaga. */
export interface PatrocinioParaRegra {
  id?: string;
  cota: CotaPatrocinio;
  ramo: string;
  grupo?: string;
  categoriaId?: string;
}

/** O mesmo critério de interno.normalizar no banco: minúsculas, sem acento, sem espaços nas pontas. */
function normalizarRamo(ramo: string): string {
  return ramo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Confere se um patrocínio pode entrar no ar, diante dos que já estão no ar.
 * Devolve a mensagem do impedimento, ou null quando pode. Regras: vagas da cota
 * (Master, Ouro, Apoio, Agenda; null nas de grupo e categoria); uma empresa por
 * grupo e por categoria; uma de cada ramo por cota, menos no Apoio.
 */
export function impedimentoParaEntrarNoAr(
  novo: PatrocinioParaRegra,
  noAr: PatrocinioParaRegra[],
  vagasDaCota: number | null,
): string | null {
  const daCota = noAr.filter((p) => p.cota === novo.cota && p.id !== novo.id);
  if (vagasDaCota !== null && daCota.length >= vagasDaCota) {
    return `A cota já tem todas as ${vagasDaCota} ${vagasDaCota === 1 ? "vaga ocupada" : "vagas ocupadas"}.`;
  }
  if (novo.cota === "grupo" && daCota.some((p) => p.grupo === novo.grupo)) return `O grupo ${novo.grupo} já tem patrocinador.`;
  if (novo.cota === "categoria" && daCota.some((p) => p.categoriaId === novo.categoriaId)) return "Esta categoria já tem patrocinador.";
  if (!COTAS_SEM_EXCLUSIVIDADE.includes(novo.cota) && daCota.some((p) => normalizarRamo(p.ramo) === normalizarRamo(novo.ramo))) {
    return `Já há uma empresa do ramo "${novo.ramo}" nesta cota.`;
  }
  return null;
}
