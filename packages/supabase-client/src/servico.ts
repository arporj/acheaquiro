// Cliente com a chave service_role: ignora o RLS. Só no servidor, e só nos usos
// listados na Especificação Técnica, seção 10.2 (convite de cadastro assistido,
// limites de acesso do login, e-mails, tarefas agendadas e backup).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function criarClienteServico({ url, chaveServico }: { url: string; chaveServico: string }): SupabaseClient {
  if (!url || !chaveServico) {
    throw new Error("PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias para o cliente de serviço.");
  }
  return createClient(url, chaveServico, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
