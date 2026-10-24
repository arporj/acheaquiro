// Separa o que cada um dos três sites mostra (src/lib/ambiente.ts) e, na
// produção, cria a sessão das páginas com login e confere quem pode entrar em
// cada área. As políticas de RLS do banco conferem de novo em cada consulta.
import { defineMiddleware } from "astro:middleware";
import { ambiente } from "@/lib/ambiente";
import { termoAceito } from "@/lib/representante";
import { clienteDaRequisicao, destinoDepoisDeEntrar, lerUsuario, type UsuarioLogado } from "@/lib/sessao";

const DOMINIO_PRINCIPAL = "acheaquiro.com.br";

/** Páginas que dependem de login. O site de apresentação não as tem, porque não acessa o banco real. */
const PAGINAS_COM_LOGIN = ["/entrar", "/recuperar-senha", "/nova-senha", "/auth", "/sair", "/conta", "/anunciante", "/admin", "/api/fotos"];

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
  if (comecaCom(caminho, "/conta") || caminho === "/nova-senha" || caminho === "/entrar/codigo" || comecaCom(caminho, "/api/fotos")) {
    return () => true;
  }
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
    // Link do representante: a indicação já fica guardada para depois da abertura.
    if (pathname.startsWith("/r/")) return next();
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
    if (!usuario) {
      // Rotas de API respondem em JSON; páginas levam à tela de entrar.
      if (pathname.startsWith("/api/")) {
        return Response.json(
          { ok: false, erro: { codigo: "NAO_AUTENTICADO", mensagem: "Entre na sua conta para continuar." } },
          { status: 401, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      return context.redirect(`/entrar?voltar=${encodeURIComponent(pathname)}`, 303);
    }
    if (!regra(usuario)) return context.redirect(await destinoDepoisDeEntrar(supabase, usuario), 303);
    // Administrador e representante só passam da segunda etapa em diante (o RLS também exige aal2).
    if ((comecaCom(pathname, "/admin") || pathname.startsWith("/representante/")) && usuario.nivel !== "aal2") {
      return context.redirect(await destinoDepoisDeEntrar(supabase, usuario), 303);
    }
    // O representante aceita o termo de confidencialidade antes de ver qualquer dado (o RLS também exige).
    if (pathname.startsWith("/representante/") && pathname !== "/representante/termo") {
      const aceito = await termoAceito(supabase, usuario.id);
      if (!aceito.ok) {
        return new Response(aceito.erro.mensagem, {
          status: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
        });
      }
      if (!aceito.dados) return context.redirect("/representante/termo", 303);
    }
  }

  const resposta = await next();
  // Páginas com dados da conta nunca vão para cache nenhum.
  resposta.headers.set("Cache-Control", "private, no-store");
  return resposta;
});
