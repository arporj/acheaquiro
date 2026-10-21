// Separa o que cada um dos três sites mostra (src/lib/ambiente.ts).
import { defineMiddleware } from "astro:middleware";
import { ambiente } from "@/lib/ambiente";

const DOMINIO_PRINCIPAL = "acheaquiro.com.br";

/** Páginas que dependem de login. O site de apresentação não as tem, porque não acessa o banco real. */
const PAGINAS_COM_LOGIN = ["/entrar", "/recuperar-senha", "/nova-senha", "/auth", "/sair", "/conta", "/anunciante", "/admin"];

function exigeLogin(caminho: string): boolean {
  // "/representante" é a página pública; a área do representante fica nas subpáginas.
  return (
    PAGINAS_COM_LOGIN.some((pagina) => caminho === pagina || caminho.startsWith(`${pagina}/`)) ||
    caminho.startsWith("/representante/")
  );
}

export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search, hostname } = context.url;

  if (ambiente === "em-breve") {
    // Mesmo caminho, para o redirecionamento guardado pelo navegador continuar certo depois da abertura.
    if (hostname.startsWith("www.")) return context.redirect(`https://${DOMINIO_PRINCIPAL}${pathname}${search}`, 301);
    // O rewrite passa de novo por aqui, já com o caminho "/em-breve".
    if (pathname === "/em-breve") return next();
    if (pathname === "/") return context.rewrite("/em-breve");
    // Temporário (302): depois da abertura, esses endereços passam a existir.
    return context.redirect("/", 302);
  }

  if (pathname === "/em-breve") return context.rewrite("/404");
  if (ambiente === "apresentacao" && exigeLogin(pathname)) return context.rewrite("/404");

  return next();
});
