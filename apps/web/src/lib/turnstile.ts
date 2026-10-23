// Conferência do Turnstile ("não sou um robô") pelo próprio site, nos
// formulários que não passam pelo Supabase Auth (pedidos sobre o perfil). A
// chave secreta é segredo do Worker (wrangler secret put TURNSTILE_SECRET_KEY).
import { env } from "cloudflare:workers";

const ENDERECO_CONFERENCIA = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** true = humano; false = recusado; null = não deu para conferir (erro já registrado). */
export async function conferirTurnstile(token: string, ip: string | null): Promise<boolean | null> {
  const segredo = env.TURNSTILE_SECRET_KEY;
  if (!segredo) {
    console.error("conferirTurnstile: TURNSTILE_SECRET_KEY não definida neste Worker.");
    return null;
  }
  const corpo = new FormData();
  corpo.append("secret", segredo);
  corpo.append("response", token);
  if (ip) corpo.append("remoteip", ip);
  try {
    const resposta = await fetch(ENDERECO_CONFERENCIA, { method: "POST", body: corpo });
    if (!resposta.ok) {
      console.error("conferirTurnstile: resposta inesperada", { status: resposta.status });
      return null;
    }
    const resultado = (await resposta.json()) as { success: boolean; "error-codes"?: string[] };
    if (!resultado.success) console.warn("conferirTurnstile: token recusado", { codigos: resultado["error-codes"] });
    return resultado.success;
  } catch (erro) {
    console.error("conferirTurnstile: falha ao conferir", { erro: String(erro) });
    return null;
  }
}
