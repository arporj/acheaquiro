// Filtros da lista de resultados. Usados no servidor (estado inicial da
// página) e no navegador (cliques nas abas e nos filtros), para a regra ficar
// num lugar só.
import type { ItemResultado } from "@/dados/consultas";

export type Aba = "profissional" | "comercio";

export interface EstadoLista {
  aba: Aba;
  bairro: string;
  somenteAbertos: boolean;
  maisPerto: boolean;
}

/** O que o navegador precisa saber de cada cartão para filtrar e ordenar. */
export type DadosFiltro = Pick<ItemResultado, "tipo" | "bairroIds" | "todaCidade" | "abertoAgora" | "destacado" | "distanciaKm">;

export function paraDadosFiltro(item: ItemResultado): DadosFiltro {
  const { tipo, bairroIds, todaCidade, abertoAgora, destacado, distanciaKm } = item;
  return { tipo, bairroIds, todaCidade, abertoAgora, destacado, distanciaKm };
}

export function abaInicial(itens: readonly DadosFiltro[]): Aba {
  const temProfissional = itens.some((i) => i.tipo === "profissional");
  return !temProfissional && itens.length > 0 ? "comercio" : "profissional";
}

/** Comércio com bairro escolhido: o bairro reordena a lista, sem esconder ninguém (decisão de 20/10/2026). */
export function bairroReordena(estado: EstadoLista): boolean {
  return estado.aba === "comercio" && Boolean(estado.bairro) && !estado.maisPerto;
}

export function passaNoFiltro(item: DadosFiltro, estado: EstadoLista): boolean {
  return (
    item.tipo === estado.aba &&
    (!estado.bairro || estado.aba === "comercio" || item.todaCidade || item.bairroIds.includes(estado.bairro)) &&
    (estado.aba !== "comercio" || !estado.somenteAbertos || Boolean(item.abertoAgora))
  );
}

/**
 * Ordem de exibição, em posições da lista original: os destacados do box
 * "Anúncios", o resto da lista e onde começam os comércios de outros bairros
 * no resto (-1 quando não há essa divisão).
 * SIMULAÇÃO: em "Mais perto de mim", o resto pela distância; com bairro
 * escolhido, os comércios do bairro na ordem do servidor e depois os outros
 * pela distância, como se o visitante tivesse permitido a localização. A regra
 * real está em packages/domain (ordenarResultados).
 */
export function ordemDeExibicao(
  itens: readonly DadosFiltro[],
  estado: EstadoLista,
): { anuncios: number[]; ordem: number[]; inicioOutrosBairros: number } {
  const posicoes = itens.map((_, i) => i);
  const porDistancia = (a: number, b: number) => (itens[a].distanciaKm ?? 99) - (itens[b].distanciaKm ?? 99);
  const anuncios = posicoes.filter((i) => itens[i].destacado);
  const demais = posicoes.filter((i) => !itens[i].destacado);

  if (estado.aba === "comercio" && estado.maisPerto) {
    return { anuncios, ordem: demais.sort(porDistancia), inicioOutrosBairros: -1 };
  }
  if (bairroReordena(estado)) {
    const doBairro = demais.filter((i) => itens[i].bairroIds.includes(estado.bairro));
    const outros = demais.filter((i) => !itens[i].bairroIds.includes(estado.bairro)).sort(porDistancia);
    return { anuncios, ordem: [...doBairro, ...outros], inicioOutrosBairros: outros.length > 0 ? doBairro.length : -1 };
  }
  return { anuncios, ordem: demais, inicioOutrosBairros: -1 };
}
