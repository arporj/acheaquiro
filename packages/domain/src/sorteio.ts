// Sorteios reproduzíveis: a mesma semente produz sempre o mesmo resultado.
// A semente vem do servidor (uma nova a cada busca); nos testes, é fixa.

/** Devolve um número em [0, 1). */
export type Aleatorio = () => number;

/** Gerador mulberry32: rápido, com boa distribuição para sorteios de lista. */
export function criarAleatorio(semente: number): Aleatorio {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Embaralha sem alterar a lista original (Fisher-Yates). */
export function embaralhar<T>(itens: readonly T[], aleatorio: Aleatorio): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia;
}

export interface ItemComPeso<T> {
  item: T;
  peso: number;
}

/**
 * Sorteia até `quantidade` itens, sem repetição. Um item de peso 2 tem o dobro
 * de chance de sair, a cada retirada, de um item de peso 1. A ordem do retorno
 * é a ordem do sorteio.
 */
export function sortearComPeso<T>(itens: readonly ItemComPeso<T>[], quantidade: number, aleatorio: Aleatorio): T[] {
  if (itens.some((i) => !(i.peso > 0))) {
    throw new RangeError("Todo item do sorteio precisa ter peso maior que zero.");
  }
  const restantes = [...itens];
  const sorteados: T[] = [];
  while (sorteados.length < quantidade && restantes.length > 0) {
    const total = restantes.reduce((soma, i) => soma + i.peso, 0);
    let alvo = aleatorio() * total;
    let indice = restantes.findIndex((i) => (alvo -= i.peso) < 0);
    if (indice === -1) indice = restantes.length - 1; // arredondamento de ponto flutuante
    sorteados.push(restantes[indice]!.item);
    restantes.splice(indice, 1);
  }
  return sorteados;
}
