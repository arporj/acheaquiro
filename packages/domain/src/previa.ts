// Prévia de um link compartilhado no WhatsApp e nas redes (decisão de
// 28/10/2026): o perfil compartilhado é propaganda do anunciante, com a foto e
// o texto dele, e não do site. O evento da Agenda segue a mesma ideia.

/** Tamanho do texto da prévia e da descrição para o Google. */
export const LIMITE_TEXTO_PREVIA = 155;

const RETICENCIAS = "…";

/**
 * Junta os espaços e as quebras de linha e, se o texto passar do limite,
 * corta na última palavra inteira e termina com reticências (o resultado,
 * com as reticências, cabe no limite). Pontuação solta antes das reticências
 * sai ("praia, …" vira "praia…").
 */
export function resumirTexto(texto: string, limite = LIMITE_TEXTO_PREVIA): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;
  const inicio = limpo.slice(0, limite - RETICENCIAS.length);
  // Se o corte caiu no meio de uma palavra, volta até o espaço anterior;
  // uma palavra só, maior que o limite, é cortada no meio mesmo.
  const terminaEmPalavraInteira = limpo[inicio.length] === " ";
  const espaco = inicio.lastIndexOf(" ");
  const base = terminaEmPalavraInteira || espaco <= 0 ? inicio : inicio.slice(0, espaco);
  return base.replace(/[\s.,;:!?…–—-]+$/u, "") + RETICENCIAS;
}

/**
 * A foto que pode ir para a prévia. O WhatsApp só garante a prévia com JPEG,
 * por isso a foto de perfil é gravada em JPEG (FORMATO_FOTO_PERFIL, em
 * packages/validation); sem foto em JPEG, a página fica com a imagem do site.
 */
export function fotoParaPrevia(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const caminho = url.split(/[?#]/)[0]!.toLowerCase();
  return caminho.endsWith(".jpg") || caminho.endsWith(".jpeg") ? url : undefined;
}
