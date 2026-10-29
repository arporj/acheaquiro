// Carregamento ao clicar (decisão de 29/10/2026): a página muda na hora para um
// esqueleto da página seguinte enquanto ela não chega, para o clique nunca
// parecer ignorado. Aqui ficam as regras; a tela fica em CarregandoPagina.astro.

export type TipoEsqueleto = "lista" | "perfil" | "painel" | "pagina";

/** Páginas de um nível que não são lista de categoria. */
const PAGINAS_SIMPLES = new Set([
  "",
  "anuncie",
  "sobre",
  "fundadores",
  "patrocine",
  "representante",
  "seu-anuncio",
  "entrar",
  "recuperar-senha",
  "nova-senha",
  "sair",
  "em-breve",
  "termos",
  "privacidade",
  "r",
  "p",
]);
const LISTAS = new Set(["busca", "artistas", "agenda", "patrocinadores"]);
const PAINEIS = new Set(["admin", "anunciante", "conta"]);

/** Formato do esqueleto pelo endereço de destino. */
export function tipoDeEsqueleto(destino: URL): TipoEsqueleto {
  const [primeiro = "", segundo] = destino.pathname.split("/").filter(Boolean);
  if (PAINEIS.has(primeiro) || (primeiro === "representante" && segundo !== undefined)) return "painel";
  if (primeiro === "perfil" || primeiro === "artista" || (primeiro === "agenda" && segundo !== undefined)) return "perfil";
  if (LISTAS.has(primeiro)) return "lista";
  if (PAGINAS_SIMPLES.has(primeiro)) return "pagina";
  // Um nível só e fora da lista acima: link curto de categoria (/eletricistas).
  return segundo === undefined ? "lista" : "pagina";
}

/**
 * O clique num link leva a outra página deste site, na mesma aba? Ficam de
 * fora: WhatsApp, telefone e sites de fora; nova aba (target ou tecla); download;
 * âncora na mesma página (inclusive href="#"); links marcados com data-sem-carregamento.
 */
export function cliqueTrocaDePagina(evento: MouseEvent, link: HTMLAnchorElement, atual: URL): URL | null {
  if (evento.defaultPrevented || evento.button !== 0) return null;
  if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return null;
  if (link.hasAttribute("download") || link.hasAttribute("data-sem-carregamento")) return null;
  if (link.target && link.target !== "_self") return null;
  if (link.getAttribute("href")?.startsWith("#")) return null;
  const destino = new URL(link.href, atual);
  if (destino.origin !== atual.origin) return null;
  const mesmaPagina = destino.pathname === atual.pathname && destino.search === atual.search;
  if (mesmaPagina && destino.hash !== "") return null;
  return destino;
}
