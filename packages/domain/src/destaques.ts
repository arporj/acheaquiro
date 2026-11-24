// Bloco "Acontece em Rio das Ostras" da página inicial (decisões J1 a J5 de
// 24/11/2026): divulgação feita pelo próprio site. Sem limite de quantidade;
// um destaque por vez, trocando sozinho. O banco repete a regra de "no ar"
// em interno.destaque_no_ar (migration 20261124134213): mudou uma, muda a outra.
import type { OrigemEvento, TipoDestaque } from "@acheaqui/types";
import type { DataISO } from "./datas";

export type SituacaoDestaque = "no_ar" | "programado" | "encerrado" | "desligado";

/** Tempo de cada destaque na tela antes de passar para o próximo (decisão H3). */
export const SEGUNDOS_POR_DESTAQUE = 6;

export interface DestaqueParaRegra {
  inicio: DataISO;
  fim: DataISO;
  ligado: boolean;
  ordem: number;
  /** Último dia do evento, no destaque de evento: depois dele, o destaque encerra. */
  eventoFim?: DataISO | null;
}

/**
 * Situação do destaque no dia. O desligado conta como desligado mesmo dentro
 * das datas; o de evento encerra no fim do que vier primeiro, o destaque ou o evento.
 */
export function situacaoDoDestaque(destaque: DestaqueParaRegra, hoje: DataISO): SituacaoDestaque {
  if (!destaque.ligado) return "desligado";
  const fim = destaque.eventoFim && destaque.eventoFim < destaque.fim ? destaque.eventoFim : destaque.fim;
  if (hoje > fim) return "encerrado";
  if (hoje < destaque.inicio) return "programado";
  return "no_ar";
}

/** Os que aparecem hoje, na ordem escolhida pela administração (empate: o que começou antes). */
export function destaquesNoAr<T extends DestaqueParaRegra>(destaques: readonly T[], hoje: DataISO): T[] {
  return destaques
    .filter((d) => situacaoDoDestaque(d, hoje) === "no_ar")
    .sort((a, b) => a.ordem - b.ordem || a.inicio.localeCompare(b.inicio));
}

/** Quantos há em cada situação, para o resumo da administração. */
export function contarDestaquesPorSituacao(destaques: readonly DestaqueParaRegra[], hoje: DataISO): Record<SituacaoDestaque, number> {
  const contagem: Record<SituacaoDestaque, number> = { no_ar: 0, programado: 0, encerrado: 0, desligado: 0 };
  for (const d of destaques) contagem[situacaoDoDestaque(d, hoje)] += 1;
  return contagem;
}

/**
 * Segundos até o mesmo destaque voltar à tela, com `quantidadeNoAr` na rodada.
 * Com um só, ele fica parado (zero).
 */
export function segundosAteVoltar(quantidadeNoAr: number, segundosPorDestaque = SEGUNDOS_POR_DESTAQUE): number {
  if (!Number.isInteger(quantidadeNoAr) || quantidadeNoAr < 0) throw new Error("Quantidade de destaques inválida.");
  return quantidadeNoAr <= 1 ? 0 : quantidadeNoAr * segundosPorDestaque;
}

/**
 * Etiqueta "Divulgação" (Código de Defesa do Consumidor, art. 36): aparece
 * quando o destaque divulga um negócio, ou seja, um comércio citado ou um
 * evento que não é de órgão público. A divulgação do próprio Ache Aqui não leva.
 */
export function destaqueEhDivulgacao(destaque: { tipo: TipoDestaque; comercio: string | null; origemEvento?: OrigemEvento | null }): boolean {
  if (destaque.tipo === "ache_aqui") return false;
  if (destaque.comercio) return true;
  return destaque.tipo === "evento" && destaque.origemEvento !== "orgao_publico";
}
