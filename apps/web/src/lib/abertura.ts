// Data de abertura em todo lugar (decisão de 29/10/2026): toda página de venda e
// toda peça de divulgação mostra a data de abertura ao público. A partir do dia
// da abertura, a data some (decisão E2, 29/10/2026). A data vem de
// obterAberturaAoPublico(): configuracoes na produção, ABERTURA nos outros sites.
import { diaDaSemana, formatarData } from "./texto";

const NO_DIA = ["no domingo", "na segunda-feira", "na terça-feira", "na quarta-feira", "na quinta-feira", "na sexta-feira", "no sábado"];

/** "Abre ao público na sexta-feira, 27/11/2026"; null a partir do dia da abertura. */
export function textoAbertura(abertura: string, hoje: string): string | null {
  if (hoje >= abertura) return null;
  return `Abre ao público ${NO_DIA[diaDaSemana(abertura)]}, ${formatarData(abertura)}`;
}
