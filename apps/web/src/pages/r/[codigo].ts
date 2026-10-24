// Link do representante, acheaquiro.com.br/r/codigo (item 4.12): guarda a
// indicação num cookie por 30 dias (src/lib/indicacao.ts) e leva à página
// inicial. Funciona também no aviso "em breve". Código desconhecido leva à
// página inicial sem guardar nada. Não fica no cache: a resposta grava cookie.
import type { APIRoute } from "astro";
import { indicacaoValida } from "@/dados/consultas";
import { ambiente } from "@/lib/ambiente";
import { COOKIE_INDICACAO, DIAS_INDICACAO, codigoValido, dominioDoCookie } from "@/lib/indicacao";

export const GET: APIRoute = async ({ params, cookies, url, rewrite }) => {
  // O site de apresentação tem dados fictícios: indicação nenhuma nasce dele.
  if (ambiente === "apresentacao") return rewrite("/404");
  const codigo = (params.codigo ?? "").toLowerCase();
  if (codigoValido(codigo) && (await indicacaoValida(codigo))) {
    cookies.set(COOKIE_INDICACAO, codigo, {
      path: "/",
      domain: dominioDoCookie(url.hostname),
      maxAge: DIAS_INDICACAO * 86_400,
      sameSite: "lax",
      secure: url.protocol === "https:",
      httpOnly: false,
    });
  }
  return new Response(null, { status: 302, headers: { Location: "/", "Cache-Control": "private, no-store" } });
};
