// Patrocinadores (proposta Patrocinadores v3, ainda em discussão).
import type { CotaPatrocinio } from "@acheaqui/types";
import { somarDias } from "./datas";

/**
 * Tamanho em que o logo deve ser enviado em cada cota (largura x altura, em
 * pixels). A administração mostra estes tamanhos no cadastro do patrocinador.
 */
export const FORMATOS_LOGO_PATROCINIO: Record<CotaPatrocinio, { largura: number; altura: number }> = {
  master: { largura: 600, altura: 600 },
  ouro: { largura: 800, altura: 200 },
  apoio: { largura: 400, altura: 200 },
  grupo: { largura: 400, altura: 200 },
  categoria: { largura: 400, altura: 200 },
  agenda: { largura: 400, altura: 200 },
};

/**
 * Quando abre de novo uma vaga numa cota esgotada: no dia seguinte ao fim do
 * contrato que vence primeiro. `fins` são os últimos dias (AAAA-MM-DD) dos
 * contratos ativos da cota; sem nenhum, não há data a mostrar.
 */
export function novaVagaAPartirDe(fins: string[]): string | undefined {
  if (fins.length === 0) return undefined;
  return somarDias([...fins].sort()[0]!, 1);
}
