// O que o carrossel do topo mostra enquanto há vaga livre (decisão de
// 17/11/2026): sem nenhum anunciante, uma sequência do próprio Ache Aqui
// (atalhos de categorias e convites para anunciar) no mesmo formato dos cards
// pagos; com vaga sobrando, os pagos e um convite; cheio, só os pagos.

/** Vagas do Carrossel (no máximo 8, decisão de 29/10/2026). */
export const VAGAS_CARROSSEL = 8;

/** Convites "Sua empresa aqui" quando o carrossel está vazio. */
const CONVITES_COM_CARROSSEL_VAZIO = 2;

export interface ComposicaoCarrossel {
  /** Atalhos de categorias do Ache Aqui, só com o carrossel vazio. */
  atalhos: number;
  /** Cards "Sua empresa aqui", que levam a "Anuncie aqui". */
  convites: number;
}

export function composicaoCarrossel(ocupadas: number, vagas: number = VAGAS_CARROSSEL): ComposicaoCarrossel {
  if (!Number.isInteger(ocupadas) || ocupadas < 0) throw new Error(`Quantidade de vagas ocupadas inválida: ${ocupadas}`);
  if (ocupadas >= vagas) return { atalhos: 0, convites: 0 };
  if (ocupadas > 0) return { atalhos: 0, convites: 1 };
  return { atalhos: vagas - CONVITES_COM_CARROSSEL_VAZIO, convites: CONVITES_COM_CARROSSEL_VAZIO };
}
