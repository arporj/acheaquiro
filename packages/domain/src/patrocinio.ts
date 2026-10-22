// Patrocinadores (proposta Patrocinadores v3, ainda em discussão).
import type { CotaPatrocinio } from "@acheaqui/types";

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
