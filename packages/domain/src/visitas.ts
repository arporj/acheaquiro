// Contador de visitas (decisão de 07/11/2026): o total dos sites, arredondado
// para baixo em centenas, para o "mais de" ser sempre verdadeiro. O número vem de
// uma estimativa da Cloudflare, por isso a tela nunca mostra o valor exato.

/** A partir de quantas visitas o contador aparece: "Mais de 0 visitas" não ajuda ninguém. */
export const MINIMO_VISITAS_NO_CONTADOR = 101;

/** "Mais de 500 visitas" para 501 a 600; com exatamente 500, ainda "Mais de 400 visitas". Abaixo do mínimo, nada. */
export function textoDoContadorDeVisitas(total: number): string | null {
  if (!Number.isFinite(total) || total < MINIMO_VISITAS_NO_CONTADOR) return null;
  const centenas = Math.floor((Math.floor(total) - 1) / 100) * 100;
  return `Mais de ${centenas.toLocaleString("pt-BR")} visitas`;
}
