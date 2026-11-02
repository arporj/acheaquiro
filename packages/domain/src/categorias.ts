// Ordem das categorias (decisão de 29/10/2026): dentro de cada grupo, em ordem
// alfabética do português, em todas as telas que as listam agrupadas (página
// inicial, busca, cadastro, administração, área do representante). Os grupos
// seguem a ordem do catálogo, que vem do banco, na página inicial, no menu e na
// busca; nos formulários e nas listas da administração e do representante,
// ficam também em ordem alfabética (decisão de 02/11/2026).

const COMPARADOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Compara dois nomes na ordem alfabética do português, sem diferenciar acento nem maiúscula. */
export function compararNomes(a: string, b: string): number {
  return COMPARADOR.compare(a, b);
}

/**
 * Agrupa as categorias e põe as de cada grupo em ordem alfabética pelo nome
 * mostrado na tela. Os grupos ficam na ordem em que aparecem na lista recebida
 * ou, com gruposEmOrdemAlfabetica, também em ordem alfabética.
 */
export function agruparCategorias<T extends { grupo: string }>(
  categorias: readonly T[],
  nome: (categoria: T) => string,
  opcoes: { gruposEmOrdemAlfabetica?: boolean } = {},
): { grupo: string; categorias: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const categoria of categorias) {
    const lista = grupos.get(categoria.grupo);
    if (lista) lista.push(categoria);
    else grupos.set(categoria.grupo, [categoria]);
  }
  const resultado = [...grupos].map(([grupo, lista]) => ({
    grupo,
    categorias: [...lista].sort((a, b) => compararNomes(nome(a), nome(b))),
  }));
  return opcoes.gruposEmOrdemAlfabetica ? resultado.sort((a, b) => compararNomes(a.grupo, b.grupo)) : resultado;
}
