// Convite "Quer seu nome aqui? Seja um patrocinador" nos espaços de patrocínio
// sem patrocinador (decisão de 29/10/2026). Quando aparece fica em
// mostraConvitePatrocinio (packages/domain); aqui ficam o texto, o link para
// /patrocine com a cota indicada e a leitura desse link na página.
import type { Categoria, CotaPatrocinio } from "@acheaqui/types";
import { paraSlug } from "./texto";

export const TEXTO_CONVITE = "Quer seu nome aqui? Seja um patrocinador";

/** /patrocine?cota=categoria&categoria=pizzarias#cota-categoria (a âncora rola até o card). */
export function linkConvitePatrocinio(cota: CotaPatrocinio, onde: { categoria?: Categoria; grupo?: string } = {}): string {
  const parametros = new URLSearchParams({ cota });
  if (cota === "categoria" && onde.categoria) parametros.set("categoria", onde.categoria.slugLista);
  if (cota === "grupo" && onde.grupo) parametros.set("grupo", paraSlug(onde.grupo));
  return `/patrocine?${parametros}#cota-${cota}`;
}

export interface CotaPedida {
  cota: CotaPatrocinio;
  /** Nome do grupo ou da categoria pedidos, quando existem no catálogo. */
  alvo?: string;
}

/** Cota indicada no endereço. O que não existe no catálogo é ignorado. */
export function lerCotaPedida(url: URL, cotas: readonly CotaPatrocinio[], categorias: readonly Categoria[]): CotaPedida | undefined {
  const cota = cotas.find((c) => c === url.searchParams.get("cota"));
  if (!cota) return undefined;
  if (cota === "categoria") {
    const slug = url.searchParams.get("categoria");
    return { cota, alvo: categorias.find((c) => c.slugLista === slug)?.nomePlural };
  }
  if (cota === "grupo") {
    const slug = url.searchParams.get("grupo");
    return { cota, alvo: categorias.find((c) => paraSlug(c.grupo) === slug)?.grupo };
  }
  return { cota };
}
