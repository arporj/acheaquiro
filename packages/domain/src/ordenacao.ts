// Ordem da lista de resultados (Especificação Funcional, item 4.2; Especificação
// Técnica, seção 8.1). Ordena uma aba por vez (Profissionais ou Comércios).
import { criarAleatorio, embaralhar, sortearComPeso, type Aleatorio } from "./sorteio";

/** Quantas posições do topo são dos links patrocinados. */
export const MAXIMO_PATROCINADOS = 3;
/** A cada quantas posições existe uma vaga rotativa (10ª, 20ª, 30ª...). */
export const INTERVALO_VAGA_ROTATIVA = 10;

/** Um link patrocinado contratado na categoria da lista. */
export interface Patrocinio {
  /** Patrocinado Plus: o dobro de chance no sorteio. */
  plus: boolean;
  /** Bairros do pacote (até 3). Vazio = cidade toda. */
  bairroIds?: readonly string[];
}

export interface CandidatoLista {
  id: string;
  /** Nível do plano: quanto maior, mais acima na lista. */
  nivelPlano: number;
  /** Links patrocinados ativos do anunciante na categoria buscada. */
  patrocinios?: readonly Patrocinio[];
  /** Usada só no modo "Mais perto de mim". */
  distanciaKm?: number;
}

export interface OpcoesOrdenacao {
  modo: "padrao" | "distancia";
  /** Uma semente nova a cada busca; fixa nos testes. */
  semente: number;
  /** Bairro escolhido pelo visitante; sem bairro, só os patrocinados da cidade toda disputam o topo. */
  bairro?: string;
  /**
   * Níveis dos dois planos de entrada do tipo da lista, vindos da tabela de
   * planos. O mais caro dos dois tem o dobro de chance na vaga rotativa.
   */
  niveisEntrada: { maisCaro: number; maisBarato: number };
}

export interface ListaOrdenada<T> {
  /** As até 3 primeiras posições, marcadas como "Patrocinado". */
  patrocinados: T[];
  /**
   * Todos os candidatos, na ordem dos planos. Os patrocinados também estão
   * aqui, na posição do seu plano: o patrocínio é um lugar a mais no topo.
   */
  lista: T[];
}

export function ordenarResultados<T extends CandidatoLista>(
  candidatos: readonly T[],
  opcoes: OpcoesOrdenacao,
): ListaOrdenada<T> {
  const aleatorio = criarAleatorio(opcoes.semente);
  const patrocinados = sortearPatrocinados(candidatos, opcoes.bairro, aleatorio);

  if (opcoes.modo === "distancia") {
    return { patrocinados, lista: ordenarPorDistancia(candidatos) };
  }

  // A vaga rotativa conta as posições da página inteira, com os patrocinados do topo.
  const exibicao = [...patrocinados, ...agruparPorPlano(candidatos, aleatorio)];
  if (candidatos.length > INTERVALO_VAGA_ROTATIVA) {
    aplicarVagaRotativa(exibicao, patrocinados.length, opcoes.niveisEntrada, aleatorio);
  }
  return { patrocinados, lista: exibicao.slice(patrocinados.length) };
}

/** Peso no sorteio do topo nesta busca; 0 quando nenhum patrocínio vale para o bairro. */
export function pesoPatrocinio(patrocinios: readonly Patrocinio[] | undefined, bairro: string | undefined): number {
  const validos = (patrocinios ?? []).filter((p) =>
    p.bairroIds && p.bairroIds.length > 0 ? bairro !== undefined && p.bairroIds.includes(bairro) : true,
  );
  if (validos.length === 0) return 0;
  return validos.some((p) => p.plus) ? 2 : 1;
}

/** Até 3 patrocinados, sorteados com peso 2 para o Patrocinado Plus. */
function sortearPatrocinados<T extends CandidatoLista>(
  candidatos: readonly T[],
  bairro: string | undefined,
  aleatorio: Aleatorio,
): T[] {
  const comPatrocinio = candidatos
    .map((c) => ({ item: c, peso: pesoPatrocinio(c.patrocinios, bairro) }))
    .filter((c) => c.peso > 0);
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
 * descer). Ele sai da posição original, então ninguém aparece duas vezes na
 * lista. Sem candidatos dos planos de entrada, a vaga não é aplicada.
 */
function aplicarVagaRotativa<T extends CandidatoLista>(
  exibicao: T[],
  inicioLista: number,
  niveis: OpcoesOrdenacao["niveisEntrada"],
  aleatorio: Aleatorio,
): void {
  for (let posicao = INTERVALO_VAGA_ROTATIVA; posicao <= exibicao.length; posicao += INTERVALO_VAGA_ROTATIVA) {
    const indiceVaga = posicao - 1;
    const elegiveis = exibicao
      .map((candidato, indice) => ({ candidato, indice }))
      .filter(
        ({ candidato, indice }) =>
          indice >= Math.max(indiceVaga, inicioLista) &&
          (candidato.nivelPlano === niveis.maisCaro || candidato.nivelPlano === niveis.maisBarato),
      );
    if (elegiveis.length === 0) break;

    const [sorteado] = sortearComPeso(
      elegiveis.map((e) => ({ item: e, peso: e.candidato.nivelPlano === niveis.maisCaro ? 2 : 1 })),
      1,
      aleatorio,
    );
    exibicao.splice(sorteado!.indice, 1);
    exibicao.splice(indiceVaga, 0, sorteado!.candidato);
  }
}
