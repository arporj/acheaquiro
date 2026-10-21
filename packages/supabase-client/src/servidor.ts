// Cliente da pessoa logada, no servidor do site: a sessão fica em cookies
// httpOnly, Secure e SameSite=Lax (Especificação Técnica, seção 6.2), que o
// JavaScript da página não consegue ler. Respeita o RLS de cada papel.
import { createServerClient, parseCookieHeader, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfiguracaoSupabase } from "./publico";

export interface CookieParaGravar {
  nome: string;
  valor: string;
  opcoes: CookieOptions;
}

export interface CookiesDaRequisicao {
  /** Cabeçalho Cookie da requisição. */
  cabecalho: string | null;
  /** Grava os cookies da sessão e os cabeçalhos que o Supabase pede (por exemplo, Cache-Control). */
  gravar: (cookies: CookieParaGravar[], cabecalhos: Record<string, string>) => void;
}

export function criarClienteServidor(
  { url, chavePublica }: ConfiguracaoSupabase,
  cookies: CookiesDaRequisicao,
  { seguro }: { seguro: boolean },
): SupabaseClient {
  if (!url || !chavePublica) {
    throw new Error("PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY são obrigatórias para acessar o banco.");
  }
  return createServerClient(url, chavePublica, {
    // seguro=false só no desenvolvimento local (http://localhost).
    cookieOptions: { httpOnly: true, secure: seguro, sameSite: "lax", path: "/" },
    cookies: {
      getAll: () =>
        parseCookieHeader(cookies.cabecalho ?? "").map(({ name, value }) => ({ name, value: value ?? "" })),
      setAll: (lista, cabecalhos) =>
        cookies.gravar(
          lista.map(({ name, value, options }) => ({ nome: name, valor: value, opcoes: options })),
          cabecalhos,
        ),
    },
  });
}
