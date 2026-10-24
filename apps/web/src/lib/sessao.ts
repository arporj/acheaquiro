// Sessão da pessoa logada no servidor (só no ambiente de produção). O
// middleware cria o cliente de cada requisição e guarda em Astro.locals.
import { criarClienteServico, criarClienteServidor } from "@acheaqui/supabase-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { env } from "cloudflare:workers";

export type Papel = "anunciante" | "representante" | "administrador";

export interface UsuarioLogado {
  id: string;
  email: string;
  papel: Papel | null;
  /** aal2 = passou pela verificação em duas etapas nesta sessão. */
  nivel: "aal1" | "aal2";
}

const configuracao = () => ({
  url: import.meta.env.PUBLIC_SUPABASE_URL ?? "",
  chavePublica: import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? "",
});

export function clienteDaRequisicao(requisicao: Request, cookies: AstroCookies): SupabaseClient {
  return criarClienteServidor(
    configuracao(),
    {
      cabecalho: requisicao.headers.get("cookie"),
      gravar: (lista) => {
        for (const { nome, valor, opcoes } of lista) {
          cookies.set(nome, valor, {
            domain: opcoes.domain,
            expires: opcoes.expires,
            httpOnly: opcoes.httpOnly,
            maxAge: opcoes.maxAge,
            path: opcoes.path,
            sameSite: opcoes.sameSite,
            secure: opcoes.secure,
          });
        }
      },
    },
    // http://localhost no desenvolvimento não aceita cookie Secure.
    { seguro: new URL(requisicao.url).protocol === "https:" },
  );
}

/** Cliente com a chave service_role (segredo do Worker). Só no servidor. */
export function clienteServico(): SupabaseClient {
  return criarClienteServico({ url: configuracao().url, chaveServico: env.SUPABASE_SERVICE_ROLE_KEY ?? "" });
}

/** Lê e confere o token da sessão; vazio quando ninguém está logado. */
export async function lerUsuario(supabase: SupabaseClient): Promise<UsuarioLogado | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    // Token vencido ou adulterado: segue como visitante, e o aviso vai para o registro.
    console.error("lerUsuario: getClaims falhou", { codigo: error.code, mensagem: error.message });
    return null;
  }
  if (!data) return null;
  const { claims } = data;
  const papel = claims.papel;
  return {
    id: claims.sub,
    email: claims.email ?? "",
    papel: papel === "anunciante" || papel === "representante" || papel === "administrador" ? papel : null,
    nivel: claims.aal === "aal2" ? "aal2" : "aal1",
  };
}

/** Página inicial de cada papel depois de entrar. */
export function areaDoPapel(papel: Papel | null): string {
  switch (papel) {
    case "administrador":
      return "/admin";
    case "representante":
      return "/representante/inicio";
    case "anunciante":
      return "/anunciante";
    default:
      return "/conta";
  }
}

/**
 * Para onde vai quem acabou de entrar: o administrador e o representante sem
 * a segunda etapa cadastram o aplicativo autenticador; quem já tem a segunda etapa digita o
 * código; os outros seguem para a sua área.
 */
export async function destinoDepoisDeEntrar(supabase: SupabaseClient, usuario: UsuarioLogado): Promise<string> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    console.error("destinoDepoisDeEntrar: nível de verificação falhou", { codigo: error.code, mensagem: error.message });
    return "/entrar?erro=interno";
  }
  if (data.currentLevel === "aal1" && data.nextLevel === "aal2") return "/entrar/codigo";
  if ((usuario.papel === "administrador" || usuario.papel === "representante") && data.nextLevel !== "aal2") return "/conta/duas-etapas";
  return areaDoPapel(usuario.papel);
}

/** IP de quem fez a requisição, para os limites e o registro de acesso. */
export function ipDaRequisicao(endereco: string | undefined): string {
  return endereco && endereco.length <= 45 ? endereco : "desconhecido";
}
