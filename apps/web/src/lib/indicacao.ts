// Indicação do representante pelo link acheaquiro.com.br/r/codigo (item 4.12):
// o servidor grava o código num cookie do próprio site por 30 dias, e o último
// link aberto substitui o anterior. O cookie vale para acheaquiro.com.br e os
// subdomínios, para a indicação feita no aviso "em breve" continuar no site
// real. Não é httpOnly: as páginas ficam no cache, então quem acrescenta a
// indicação nas mensagens de WhatsApp é o script do navegador. O código não é
// dado sensível (ele está no próprio link).

export const COOKIE_INDICACAO = "indicacao";
export const DIAS_INDICACAO = 30;
export const FORMATO_CODIGO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DOMINIO = "acheaquiro.com.br";

export function codigoValido(codigo: string): boolean {
  return codigo.length >= 3 && codigo.length <= 30 && FORMATO_CODIGO.test(codigo);
}

/** Domínio do cookie: o site inteiro na produção; o próprio endereço no desenvolvimento. */
export function dominioDoCookie(hostname: string): string | undefined {
  return hostname === DOMINIO || hostname.endsWith(`.${DOMINIO}`) ? DOMINIO : undefined;
}

/** Código guardado no navegador, ou vazio. */
export function lerIndicacao(cookies: string): string {
  const valor = cookies
    .split(";")
    .map((parte) => parte.trim())
    .find((parte) => parte.startsWith(`${COOKIE_INDICACAO}=`))
    ?.slice(COOKIE_INDICACAO.length + 1);
  return valor && codigoValido(valor) ? valor : "";
}

/** Linha que vai no fim da mensagem de WhatsApp para a equipe. */
export function linhaIndicacao(codigo: string): string {
  return `\nIndicação: ${codigo}`;
}
