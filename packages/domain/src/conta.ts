// Exclusão da conta pelo anunciante ou cliente (LGPD; decisões X1 a X6 de
// 24/11/2026). O banco calcula até quando há período pago (interno.pago_ate) e
// repete a regra do agendamento (public.excluir_minha_conta); mudou uma, mude a outra.
import { prazoParaDesistir } from "./assinatura";
import { diasEntre, type DataISO } from "./datas";

export interface SituacaoParaExcluir {
  hoje: DataISO;
  /** Dia em que termina o período pago em vigor (plano, extra ou evento avulso); null se nada pago em vigor. */
  pagoAte: DataISO | null;
  /** Último pagamento não devolvido; null se nunca pagou. */
  ultimoPagamento: DataISO | null;
  /** Exclusão já agendada; null se não há. */
  exclusaoEm: DataISO | null;
}

export interface OpcoesDeExclusao {
  /** Pode manter o cadastro até o fim do período pago, com a exclusão automática nesse dia (X2). */
  podeManter: boolean;
  /** Dia da exclusão automática, se escolher manter. */
  excluirEm: DataISO | null;
  /** Ainda dá para pedir a devolução do último pagamento à equipe antes de excluir (X3: 7 dias). */
  devolucaoAte: DataISO | null;
  /** Já há exclusão agendada: a tela mostra a data e a opção de desistir. */
  agendada: boolean;
}

/** O que a tela de exclusão oferece, a partir do período pago e do último pagamento. */
export function opcoesDeExclusao(s: SituacaoParaExcluir): OpcoesDeExclusao {
  const podeManter = s.pagoAte !== null && diasEntre(s.hoje, s.pagoAte) >= 0;
  const prazo = s.ultimoPagamento ? prazoParaDesistir(s.ultimoPagamento) : null;
  return {
    podeManter,
    excluirEm: podeManter ? s.pagoAte : null,
    devolucaoAte: prazo && diasEntre(s.hoje, prazo) >= 0 ? prazo : null,
    agendada: s.exclusaoEm !== null,
  };
}
