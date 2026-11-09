// Contador de visitas (decisão de 07/11/2026): o total dos sites, arredondado
// para baixo em centenas, para o "mais de" ser sempre verdadeiro. O número vem de
// uma estimativa da Cloudflare, por isso a tela nunca mostra o valor exato.

/** A partir de quantas visitas o contador aparece: "Mais de 0 visitas" não ajuda ninguém. */
export const MINIMO_VISITAS_NO_CONTADOR = 101;

/**
 * O número do selo (decisão de 09/11/2026), já escrito em português: "500" para
 * 501 a 600; com exatamente 500, ainda "400". Abaixo do mínimo, nada.
 */
export function numeroDoContadorDeVisitas(total: number): string | null {
  if (!Number.isFinite(total) || total < MINIMO_VISITAS_NO_CONTADOR) return null;
  const centenas = Math.floor((Math.floor(total) - 1) / 100) * 100;
  return centenas.toLocaleString("pt-BR");
}

/** "Mais de 500 visitas", lido pelos leitores de tela no selo. Abaixo do mínimo, nada. */
export function textoDoContadorDeVisitas(total: number): string | null {
  const numero = numeroDoContadorDeVisitas(total);
  return numero === null ? null : `Mais de ${numero} visitas`;
}
