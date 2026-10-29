// DADOS FICTÍCIOS para o layout: extras contratados (item 6.4) e valores que,
// no sistema real, são calculados na hora (aberto agora e distância).
import type { LinkDestacado } from "@acheaqui/types";

/** Banner Exclusivo: um único anunciante por dia. */
export const bannerExclusivoId = "c03";

/** Carrossel: no máximo 8 vagas. */
export const carrosselIds = ["a01", "c06", "a06", "c01", "a05", "c07", "a09", "c04"];

export const linksDestacados: LinkDestacado[] = [
  { anuncianteId: "a01", categoriaId: "eletricista" },
  { anuncianteId: "a06", categoriaId: "bombeiro-hidraulico" },
  { anuncianteId: "c01", categoriaId: "pet-shop" },
  { anuncianteId: "c06", categoriaId: "restaurante" },
];

/**
 * SIMULAÇÃO: "aberto agora" sai do horário de funcionamento e a distância sai
 * da localização do visitante. Aqui ficam fixos só para mostrar o layout.
 */
export const simulacaoComercios: Record<string, { abertoAgora: boolean; distanciaKm: number }> = {
  c01: { abertoAgora: true, distanciaKm: 1.2 },
  c02: { abertoAgora: false, distanciaKm: 3.4 },
  c03: { abertoAgora: true, distanciaKm: 0.8 },
  c04: { abertoAgora: true, distanciaKm: 0.5 },
  c05: { abertoAgora: false, distanciaKm: 0.3 },
  c06: { abertoAgora: false, distanciaKm: 2.1 },
  c07: { abertoAgora: true, distanciaKm: 2.7 },
  c08: { abertoAgora: true, distanciaKm: 0.4 },
  c09: { abertoAgora: true, distanciaKm: 4.6 },
  c20: { abertoAgora: true, distanciaKm: 1.6 },
  c21: { abertoAgora: false, distanciaKm: 2.9 },
};
