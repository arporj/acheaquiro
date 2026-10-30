// Ordem das categorias (decisão de 29/10/2026): dentro de cada grupo, em ordem
// alfabética do português, em todas as telas que as listam agrupadas (página
// inicial, busca, cadastro, administração, área do representante). A ordem dos
// grupos não muda: é a do catálogo, que vem do banco.

const COMPARADOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Compara dois nomes na ordem alfabética do português, sem diferenciar acento nem maiúscula. */
export function compararNomes(a: string, b: string): number {
  return COMPARADOR.compare(a, b);
}

/**
 * Agrupa as categorias na ordem em que os grupos aparecem na lista recebida e
 * põe as de cada grupo em ordem alfabética pelo nome mostrado na tela.
 */
export function agruparCategorias<T extends { grupo: string }>(
  categorias: readonly T[],
  nome: (categoria: T) => string,
): { grupo: string; categorias: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const categoria of categorias) {
    const lista = grupos.get(categoria.grupo);
    if (lista) lista.push(categoria);
    else grupos.set(categoria.grupo, [categoria]);
  }
  return [...grupos].map(([grupo, lista]) => ({
    grupo,
    categorias: [...lista].sort((a, b) => compararNomes(nome(a), nome(b))),
  }));
}
