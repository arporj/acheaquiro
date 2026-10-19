// Ordem da lista de resultados (Especificação Funcional, item 4.2; Especificação
// Técnica, seção 8.1). Ordena uma aba por vez (Profissionais ou Comércios).
import { criarAleatorio, embaralhar, sortearComPeso, type Aleatorio } from "./sorteio";

/** Quantas posições do topo são dos links patrocinados. */
export const MAXIMO_PATROCINADOS = 3;
/** A cada quantas posições existe uma vaga rotativa (10ª, 20ª, 30ª...). */
export const INTERVALO_VAGA_ROTATIVA = 10;

export interface CandidatoLista {
  id: string;
  /** Nível do plano: quanto maior, mais acima na lista. */
  nivelPlano: number;
  /** Link patrocinado ativo na categoria e no bairro buscados. */
  patrocinio?: "patrocinado" | "plus";
  /** Usada só no modo "Mais perto de mim". */
  distanciaKm?: number;
}

export interface OpcoesOrdenacao {
  modo: "padrao" | "distancia";
  /** Uma semente nova a cada busca; fixa nos testes. */
  semente: number;
  /**
   * Níveis dos dois planos de entrada do tipo da lista, vindos da tabela de
   * planos. O mais caro dos dois tem o dobro de chance na vaga rotativa.
   */
  niveisEntrada: { maisCaro: number; maisBarato: number };
}

export function ordenarResultados<T extends CandidatoLista>(candidatos: readonly T[], opcoes: OpcoesOrdenacao): T[] {
  const aleatorio = criarAleatorio(opcoes.semente);
  const patrocinados = sortearPatrocinados(candidatos, aleatorio);
  const idsPatrocinados = new Set(patrocinados.map((c) => c.id));
  // Patrocinados que não foram sorteados continuam na lista, no grupo do seu plano.
  const demais = candidatos.filter((c) => !idsPatrocinados.has(c.id));

  if (opcoes.modo === "distancia") {
    return [...patrocinados, ...ordenarPorDistancia(demais)];
  }

  const lista = [...patrocinados, ...agruparPorPlano(demais, aleatorio)];
  if (candidatos.length > INTERVALO_VAGA_ROTATIVA) {
    aplicarVagaRotativa(lista, opcoes.niveisEntrada, aleatorio);
  }
  return lista;
}

/** Até 3 patrocinados, sorteados com peso 2 para o Patrocinado Plus. */
function sortearPatrocinados<T extends CandidatoLista>(candidatos: readonly T[], aleatorio: Aleatorio): T[] {
  const comPatrocinio = candidatos
    .filter((c) => c.patrocinio)
    .map((c) => ({ item: c, peso: c.patrocinio === "plus" ? 2 : 1 }));
  return sortearComPeso(comPatrocinio, MAXIMO_PATROCINADOS, aleatorio);
}

/** Grupos do maior para o menor nível; dentro de cada grupo, a ordem alterna a cada busca. */
function agruparPorPlano<T extends CandidatoLista>(candidatos: readonly T[], aleatorio: Aleatorio): T[] {
  const niveis = [...new Set(candidatos.map((c) => c.nivelPlano))].sort((a, b) => b - a);
  return niveis.flatMap((nivel) =>
    embaralhar(
      candidatos.filter((c) => c.nivelPlano === nivel),
      aleatorio,
    ),
  );
}

/** Do mais perto para o mais longe; quem não tem distância vai para o fim. */
function ordenarPorDistancia<T extends CandidatoLista>(candidatos: readonly T[]): T[] {
  return [...candidatos].sort((a, b) => (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity));
}

/**
 * Nas posições 10, 20, 30... entra um anunciante dos dois planos de entrada,
 * sorteado entre os que estão daquela posição para baixo (subir, nunca
 * descer). Ele sai da posição original, então ninguém aparece duas vezes.
 * Sem candidatos dos planos de entrada, a vaga não é aplicada.
 */
function aplicarVagaRotativa<T extends CandidatoLista>(
  lista: T[],
  niveis: OpcoesOrdenacao["niveisEntrada"],
  aleatorio: Aleatorio,
): void {
  for (let posicao = INTERVALO_VAGA_ROTATIVA; posicao <= lista.length; posicao += INTERVALO_VAGA_ROTATIVA) {
    const indiceVaga = posicao - 1;
    const elegiveis = lista
      .map((candidato, indice) => ({ candidato, indice }))
      .filter(
        ({ candidato, indice }) =>
          indice >= indiceVaga &&
          (candidato.nivelPlano === niveis.maisCaro || candidato.nivelPlano === niveis.maisBarato),
      );
    if (elegiveis.length === 0) break;

    const [sorteado] = sortearComPeso(
      elegiveis.map((e) => ({ item: e, peso: e.candidato.nivelPlano === niveis.maisCaro ? 2 : 1 })),
      1,
      aleatorio,
    );
    lista.splice(sorteado!.indice, 1);
    lista.splice(indiceVaga, 0, sorteado!.candidato);
  }
}
