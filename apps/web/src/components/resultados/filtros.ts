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
export type DadosFiltro = Pick<ItemResultado, "tipo" | "bairroIds" | "todaCidade" | "abertoAgora" | "patrocinado" | "distanciaKm">;

export function paraDadosFiltro(item: ItemResultado): DadosFiltro {
  const { tipo, bairroIds, todaCidade, abertoAgora, patrocinado, distanciaKm } = item;
  return { tipo, bairroIds, todaCidade, abertoAgora, patrocinado, distanciaKm };
}

export function abaInicial(itens: readonly DadosFiltro[]): Aba {
  const temProfissional = itens.some((i) => i.tipo === "profissional");
  return !temProfissional && itens.length > 0 ? "comercio" : "profissional";
}

export function passaNoFiltro(item: DadosFiltro, estado: EstadoLista): boolean {
  return (
    item.tipo === estado.aba &&
    (!estado.bairro || item.todaCidade || item.bairroIds.includes(estado.bairro)) &&
    (estado.aba !== "comercio" || !estado.somenteAbertos || Boolean(item.abertoAgora))
  );
}

/**
 * Ordem de exibição, em posições da lista original.
 * SIMULAÇÃO: em "Mais perto de mim", patrocinados continuam no topo e o resto
 * vai pela distância. A regra real está em packages/domain (ordenarResultados).
 */
export function ordemDeExibicao(itens: readonly DadosFiltro[], estado: EstadoLista): number[] {
  const posicoes = itens.map((_, i) => i);
  if (estado.aba !== "comercio" || !estado.maisPerto) return posicoes;
  const patrocinados = posicoes.filter((i) => itens[i].patrocinado);
  const demais = posicoes
    .filter((i) => !itens[i].patrocinado)
    .sort((a, b) => (itens[a].distanciaKm ?? 99) - (itens[b].distanciaKm ?? 99));
  return [...patrocinados, ...demais];
}
