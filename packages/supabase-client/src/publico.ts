// Cliente do visitante (chave pública): só lê o que as políticas de RLS do
// visitante liberam. Sem sessão: roda no servidor, a cada página refeita.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ConfiguracaoSupabase {
  url: string;
  chavePublica: string;
}

export function criarClientePublico({ url, chavePublica }: ConfiguracaoSupabase): SupabaseClient {
  if (!url || !chavePublica) {
    throw new Error("PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY são obrigatórias para acessar o banco.");
  }
  return createClient(url, chavePublica, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
