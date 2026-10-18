// DADOS FICTÍCIOS para o layout: extras contratados (item 6.4) e valores que,
// no sistema real, são calculados na hora (aberto agora e distância).
import type { LinkPatrocinado } from "@acheaqui/types";

/** Destaque Exclusivo do Mês: um único anunciante por vez. */
export const destaqueExclusivoId = "c03";

/** Carrossel Super Destaque: no máximo 8 vagas. */
export const superDestaqueIds = ["a01", "c06", "a06", "c01", "a05", "c07", "a09", "c04"];

export const linksPatrocinados: LinkPatrocinado[] = [
  { anuncianteId: "a01", categoriaId: "eletricista", plus: true },
  { anuncianteId: "a06", categoriaId: "bombeiro-hidraulico", plus: false },
  { anuncianteId: "c01", categoriaId: "pet-shop", plus: false },
  { anuncianteId: "c06", categoriaId: "restaurante", plus: false },
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
};
