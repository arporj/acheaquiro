// Quais páginas dependem de login, para o middleware (sessão e acesso) e para o
// layout (o que só aparece nas páginas públicas).

/** Páginas que dependem de login. O site de apresentação não as tem, porque não acessa o banco real. */
const PAGINAS_COM_LOGIN = ["/entrar", "/recuperar-senha", "/nova-senha", "/auth", "/sair", "/conta", "/anunciante", "/admin", "/api/fotos"];

export function comecaCom(caminho: string, pagina: string): boolean {
  return caminho === pagina || caminho.startsWith(`${pagina}/`);
}

export function exigeLogin(caminho: string): boolean {
  // "/representante" é a página pública; a área do representante fica nas subpáginas.
  return PAGINAS_COM_LOGIN.some((pagina) => comecaCom(caminho, pagina)) || caminho.startsWith("/representante/");
}
