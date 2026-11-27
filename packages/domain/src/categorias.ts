// Ordem das categorias (decisão de 29/10/2026): dentro de cada grupo, em ordem
// alfabética do português, em todas as telas que as listam agrupadas (página
// inicial, busca, cadastro, administração, área do representante). Os grupos
// seguem a ordem do catálogo, que vem do banco, na página inicial, no menu e na
// busca; nos formulários e nas listas da administração e do representante,
// ficam também em ordem alfabética (decisão de 02/11/2026).
import type { FormaProfissao } from "@acheaqui/types";

const COMPARADOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Compara dois nomes na ordem alfabética do português, sem diferenciar acento nem maiúscula. */
export function compararNomes(a: string, b: string): number {
  return COMPARADOR.compare(a, b);
}

/** Texto para comparar na busca: sem acento, minúsculo e com espaços simples. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca de categoria (na busca do site e no formulário do anunciante): combina
 * quando algum dos textos (nome, plural, sinônimos e, no formulário, o grupo)
 * contém o que foi digitado, sem diferenciar acento, maiúscula nem espaços
 * repetidos. Busca vazia combina com tudo.
 */
export function categoriaCombinaComBusca(textos: readonly string[], busca: string): boolean {
  const procurado = normalizarBusca(busca);
  return !procurado || textos.some((texto) => normalizarBusca(texto).includes(procurado));
}

// Forma da profissão (decisão Q3 de 26/11/2026): a categoria tem o nome
// principal (menu e listas) e, quando é diferente, a forma do outro gênero; o
// anunciante escolhe como a profissão aparece no anúncio dele.

interface NomesDaCategoria {
  nome: string;
  nomeFeminino?: string;
  nomeMasculino?: string;
}

/**
 * As duas formas da profissão, para o anunciante escolher. `null` quando a
 * categoria tem um nome só para os dois (Dentista, Eletricista).
 */
export function formasDaProfissao(categoria: NomesDaCategoria): Record<FormaProfissao, string> | null {
  if (!categoria.nomeFeminino && !categoria.nomeMasculino) return null;
  return {
    masculino: categoria.nomeMasculino ?? categoria.nome,
    feminino: categoria.nomeFeminino ?? categoria.nome,
  };
}

/** Nome da categoria no anúncio: a forma escolhida, quando existe; senão, o nome principal. */
export function nomeDaCategoriaPara(categoria: NomesDaCategoria, forma?: FormaProfissao | null): string {
  const formas = formasDaProfissao(categoria);
  return formas && forma ? formas[forma] : categoria.nome;
}

/** Todos os nomes da categoria no singular, para a busca achar "advogada" e "costureiro". */
export function nomesDaCategoria(categoria: NomesDaCategoria): string[] {
  return [categoria.nome, categoria.nomeFeminino, categoria.nomeMasculino].filter((n): n is string => Boolean(n));
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
