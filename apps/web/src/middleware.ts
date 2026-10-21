// Separa o que cada um dos três sites mostra (src/lib/ambiente.ts) e, na
// produção, cria a sessão das páginas com login e confere quem pode entrar em
// cada área. As políticas de RLS do banco conferem de novo em cada consulta.
import { defineMiddleware } from "astro:middleware";
import { ambiente } from "@/lib/ambiente";
import { clienteDaRequisicao, destinoDepoisDeEntrar, lerUsuario, type UsuarioLogado } from "@/lib/sessao";

const DOMINIO_PRINCIPAL = "acheaquiro.com.br";

/** Páginas que dependem de login. O site de apresentação não as tem, porque não acessa o banco real. */
const PAGINAS_COM_LOGIN = ["/entrar", "/recuperar-senha", "/nova-senha", "/auth", "/sair", "/conta", "/anunciante", "/admin"];

function comecaCom(caminho: string, pagina: string): boolean {
  return caminho === pagina || caminho.startsWith(`${pagina}/`);
}

function exigeLogin(caminho: string): boolean {
  // "/representante" é a página pública; a área do representante fica nas subpáginas.
  return PAGINAS_COM_LOGIN.some((pagina) => comecaCom(caminho, pagina)) || caminho.startsWith("/representante/");
}

/**
 * Quem pode abrir cada página. Vazio: a página está liberada (entrar,
 * recuperar senha, confirmar e-mail, sair). A segunda etapa do administrador
 * é conferida à parte.
 */
function regraDeAcesso(caminho: string): ((usuario: UsuarioLogado) => boolean) | undefined {
  if (comecaCom(caminho, "/admin")) return (u) => u.papel === "administrador";
  if (comecaCom(caminho, "/anunciante")) return (u) => u.papel === "anunciante";
  if (caminho.startsWith("/representante/")) return (u) => u.papel === "representante";
  if (comecaCom(caminho, "/conta") || caminho === "/nova-senha" || caminho === "/entrar/codigo") return () => true;
  return undefined;
}

export const onRequest = defineMiddleware(async (context, next) => {
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
  if (!exigeLogin(pathname)) return next();
  if (ambiente === "apresentacao") return context.rewrite("/404");

  const supabase = clienteDaRequisicao(context.request, context.cookies);
  const usuario = await lerUsuario(supabase);
  context.locals.supabase = supabase;
  context.locals.usuario = usuario;

  const regra = regraDeAcesso(pathname);
  if (regra) {
    if (!usuario) return context.redirect(`/entrar?voltar=${encodeURIComponent(pathname)}`, 303);
    if (!regra(usuario)) return context.redirect(await destinoDepoisDeEntrar(supabase, usuario), 303);
    // Administrador só passa da segunda etapa em diante (o RLS também exige aal2).
    if (comecaCom(pathname, "/admin") && usuario.nivel !== "aal2") {
      return context.redirect(await destinoDepoisDeEntrar(supabase, usuario), 303);
    }
  }

  const resposta = await next();
  // Páginas com dados da conta nunca vão para cache nenhum.
  resposta.headers.set("Cache-Control", "private, no-store");
  return resposta;
});
