// Propaganda do próprio Ache Aqui nos espaços do Banner Exclusivo e do
// Carrossel enquanto não forem vendidos (decisão de 17/11/2026). Ocupa o mesmo
// tamanho do anúncio real, para quem vai anunciar ver onde vai aparecer. O
// Banner é exclusivo e por isso não alterna: mostra a propaganda dele mesmo.
// Quantos cards o carrossel recebe fica em composicaoCarrossel (packages/domain).
import type { Categoria } from "@acheaqui/types";

/** O que o topo mostra do Ache Aqui nos espaços sem anunciante. */
export interface AnunciosDaCasa {
  /** Banner Exclusivo à venda e sem anunciante no dia. */
  banner?: { nome: string; diariaCentavos?: number };
  /** Atalhos de categorias no carrossel vazio. */
  atalhos: Categoria[];
  /** Cards "Sua empresa aqui" no carrossel. */
  convites: number;
}

/** Códigos dos extras no catálogo (tabela extras). */
export const EXTRA_BANNER = "banner-exclusivo";
export const EXTRA_CARROSSEL = "carrossel";

/** Âncoras dos cards em "Extras", na página Anuncie aqui (ListaExtras). */
export function linkDoExtra(codigo: string): string {
  return `/anuncie#extra-${codigo}`;
}

export const TEXTOS_BANNER_DA_CASA = {
  etiqueta: "Espaço exclusivo",
  titulo: "Sua empresa aqui, sozinha no topo",
  descricao: "Nos dias que você escolher, só a sua empresa aparece neste espaço, em todas as páginas do Ache Aqui.",
  chamada: "Quero este espaço",
  /** Versão de uma linha, nos resultados e nos perfis. */
  compacto: "Sua empresa aqui",
} as const;

export const TEXTOS_CONVITE_CARROSSEL = {
  etiqueta: "Vaga livre",
  titulo: "Sua empresa aqui",
  subtitulo: "Anuncie no Carrossel",
} as const;

/** Convite ao lado do título "Anúncios" do Carrossel, quando há vaga (decisão de 26/11/2026). */
export const TEXTOS_CONVITE_TITULO_CARROSSEL = {
  completo: "coloque aqui o seu negócio",
  compacto: "Anuncie aqui",
} as const;
