// Ordem da lista de resultados (Especificação Funcional, item 4.2; Especificação
// Técnica, seção 8.1). Ordena uma aba por vez (Profissionais ou Comércios).
import { criarAleatorio, embaralhar, sortearComPeso, type Aleatorio } from "./sorteio";

/** Quantas posições do topo são dos links destacados. */
export const MAXIMO_DESTACADOS = 3;
/** A cada quantas posições existe uma vaga rotativa (10ª, 20ª, 30ª...). */
export const INTERVALO_VAGA_ROTATIVA = 10;

/** Um link destacado contratado na categoria da lista. */
export interface Patrocinio {
  /** Destacado Plus: o dobro de chance no sorteio. */
  plus: boolean;
  /** Bairros do pacote (até 3). Vazio = cidade toda. */
  bairroIds?: readonly string[];
}

export interface CandidatoLista {
  id: string;
  /** Nível do plano: quanto maior, mais acima na lista. */
  nivelPlano: number;
  /** Links destacados ativos do anunciante na categoria buscada. */
  patrocinios?: readonly Patrocinio[];
  /** Distância até o visitante, quando ele permite a localização. */
  distanciaKm?: number;
  /** Bairros do anunciante (endereços do comércio); usados com `priorizarBairro`. */
  bairroIds?: readonly string[];
}

export interface OpcoesOrdenacao {
  modo: "padrao" | "distancia";
  /** Uma semente nova a cada busca; fixa nos testes. */
  semente: number;
  /** Bairro escolhido pelo visitante; sem bairro, só os destacados da cidade toda disputam o topo. */
  bairro?: string;
  /**
   * Comércios com bairro escolhido (decisão de 20/10/2026): ninguém sai da
   * lista. Primeiro os do bairro, pela regra dos planos; depois os de outros
   * bairros. Os profissionais continuam filtrados pelos bairros que atendem.
   */
  priorizarBairro?: boolean;
  /** Com a localização do visitante, os de outros bairros vão do mais perto ao mais longe; sem ela, pela regra dos planos. */
  outrosBairrosPorDistancia?: boolean;
  /**
   * Níveis dos dois planos de entrada do tipo da lista, vindos da tabela de
   * planos. O mais caro dos dois tem o dobro de chance na vaga rotativa.
   */
  niveisEntrada: { maisCaro: number; maisBarato: number };
}

export interface ListaOrdenada<T> {
  /** As até 3 primeiras posições, marcadas como "Destacado". */
  destacados: T[];
  /**
   * Todos os candidatos, na ordem dos planos. Os destacados também estão
   * aqui, na posição do seu plano: o patrocínio é um lugar a mais no topo.
   */
  lista: T[];
  /** Com `priorizarBairro`: quantos itens do início da lista são do bairro escolhido. */
  noBairro?: number;
}

export function ordenarResultados<T extends CandidatoLista>(
  candidatos: readonly T[],
  opcoes: OpcoesOrdenacao,
): ListaOrdenada<T> {
  const aleatorio = criarAleatorio(opcoes.semente);
  const destacados = sortearDestacados(candidatos, opcoes.bairro, aleatorio);

  if (opcoes.modo === "distancia") {
    return { destacados, lista: ordenarPorDistancia(candidatos) };
  }

  const inicio = destacados.length;
  const bairro = opcoes.priorizarBairro ? opcoes.bairro : undefined;
  if (bairro === undefined) {
    const exibicao = [...destacados, ...agruparPorPlano(candidatos, aleatorio)];
    aplicarVagas(exibicao, candidatos.length, [{ inicio, fim: exibicao.length }], opcoes, aleatorio);
    return { destacados, lista: exibicao.slice(inicio) };
  }

  const doBairro = agruparPorPlano(
    candidatos.filter((c) => c.bairroIds?.includes(bairro)),
    aleatorio,
  );
  const outros = candidatos.filter((c) => !c.bairroIds?.includes(bairro));
  const exibicao = [
    ...destacados,
    ...doBairro,
    ...(opcoes.outrosBairrosPorDistancia ? ordenarPorDistancia(outros) : agruparPorPlano(outros, aleatorio)),
  ];
  // A vaga rotativa só mexe nos trechos ordenados pelos planos, sem desmanchar a ordem por distância.
  const trechos = [{ inicio, fim: inicio + doBairro.length }];
  if (!opcoes.outrosBairrosPorDistancia) trechos.push({ inicio: inicio + doBairro.length, fim: exibicao.length });
  aplicarVagas(exibicao, candidatos.length, trechos, opcoes, aleatorio);
  return { destacados, lista: exibicao.slice(inicio), noBairro: doBairro.length };
}

/** A vaga rotativa existe só em categorias com mais de 10 anunciantes. */
function aplicarVagas<T extends CandidatoLista>(
  exibicao: T[],
  totalCandidatos: number,
  trechos: Trecho[],
  opcoes: OpcoesOrdenacao,
  aleatorio: Aleatorio,
): void {
  if (totalCandidatos > INTERVALO_VAGA_ROTATIVA) aplicarVagaRotativa(exibicao, trechos, opcoes.niveisEntrada, aleatorio);
}

/** Pedaço da página ordenado pelos planos: de `inicio` (incluído) a `fim` (excluído). */
interface Trecho {
  inicio: number;
  fim: number;
}

/** Peso no sorteio do topo nesta busca; 0 quando nenhum patrocínio vale para o bairro. */
export function pesoPatrocinio(patrocinios: readonly Patrocinio[] | undefined, bairro: string | undefined): number {
  const validos = (patrocinios ?? []).filter((p) =>
    p.bairroIds && p.bairroIds.length > 0 ? bairro !== undefined && p.bairroIds.includes(bairro) : true,
  );
  if (validos.length === 0) return 0;
  return validos.some((p) => p.plus) ? 2 : 1;
}

/** Até 3 destacados, sorteados com peso 2 para o Destacado Plus. */
function sortearDestacados<T extends CandidatoLista>(
  candidatos: readonly T[],
  bairro: string | undefined,
  aleatorio: Aleatorio,
): T[] {
  const comPatrocinio = candidatos
    .map((c) => ({ item: c, peso: pesoPatrocinio(c.patrocinios, bairro) }))
    .filter((c) => c.peso > 0);
  return sortearComPeso(comPatrocinio, MAXIMO_DESTACADOS, aleatorio);
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
 * Nas posições 10, 20, 30... da página entra um anunciante dos dois planos de
 * entrada, sorteado entre os que estão daquela posição para baixo no mesmo
 * trecho (subir, nunca descer). Ele sai da posição original, então ninguém
 * aparece duas vezes na lista. Sem candidatos dos planos de entrada, ou com a
 * posição fora de um trecho ordenado pelos planos, a vaga não é aplicada.
 */
function aplicarVagaRotativa<T extends CandidatoLista>(
  exibicao: T[],
  trechos: readonly Trecho[],
  niveis: OpcoesOrdenacao["niveisEntrada"],
  aleatorio: Aleatorio,
): void {
  for (let posicao = INTERVALO_VAGA_ROTATIVA; posicao <= exibicao.length; posicao += INTERVALO_VAGA_ROTATIVA) {
    const indiceVaga = posicao - 1;
    const trecho = trechos.find((t) => indiceVaga >= t.inicio && indiceVaga < t.fim);
    if (!trecho) continue;
    const elegiveis = exibicao
      .map((candidato, indice) => ({ candidato, indice }))
      .filter(
        ({ candidato, indice }) =>
          indice >= indiceVaga &&
          indice < trecho.fim &&
          (candidato.nivelPlano === niveis.maisCaro || candidato.nivelPlano === niveis.maisBarato),
      );
    if (elegiveis.length === 0) continue;

    const [sorteado] = sortearComPeso(
      elegiveis.map((e) => ({ item: e, peso: e.candidato.nivelPlano === niveis.maisCaro ? 2 : 1 })),
      1,
      aleatorio,
    );
    exibicao.splice(sorteado!.indice, 1);
    exibicao.splice(indiceVaga, 0, sorteado!.candidato);
  }
}
