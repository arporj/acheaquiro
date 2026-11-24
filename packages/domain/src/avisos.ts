// Previsão do aviso em massa (decisão de 24/11/2026): antes de pôr muitos
// e-mails na fila (aumento de preço para os assinantes, por exemplo), a tela
// mostra ao administrador quantos e-mails serão enviados e em quantos dias a
// fila sai, porque o plano gratuito do Brevo tem 300 por dia, divididos entre
// os avisos e os e-mails do login (confirmação de cadastro, recuperação de
// senha, convites).

/** Teto diário da função enviar-avisos (repetido em supabase/functions/enviar-avisos: mudou um, muda o outro). */
export const TETO_AVISOS_POR_DIA = 280;
/** E-mails por dia no plano gratuito do Brevo, somando os avisos e os do login. */
export const LIMITE_DIARIO_DE_EMAILS = 300;

export interface PrevisaoDoAviso {
  /** E-mails na fila depois deste envio (os novos e os que já esperavam). */
  total: number;
  /** Dias para a fila inteira sair, contando hoje (0 quando não há nada para enviar). */
  dias: number;
  /** E-mails do login que ainda cabem no primeiro dia, depois dos avisos. */
  sobraParaOLogin: number;
}

function inteiroNaoNegativo(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0;
}

/** Quantos e-mails, em quantos dias e quanto sobra para o login no primeiro dia. */
export function previsaoDoAvisoEmMassa(novos: number, jaNaFila = 0): PrevisaoDoAviso {
  const total = inteiroNaoNegativo(novos) + inteiroNaoNegativo(jaNaFila);
  const noPrimeiroDia = Math.min(total, TETO_AVISOS_POR_DIA);
  return {
    total,
    dias: Math.ceil(total / TETO_AVISOS_POR_DIA),
    sobraParaOLogin: LIMITE_DIARIO_DE_EMAILS - noPrimeiroDia,
  };
}
