// Verificação em duas etapas por aplicativo autenticador (TOTP, item 4.14):
// obrigatória para administradores e opcional para os outros papéis.
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteServico } from "./sessao";

/** Códigos digitados por pessoa a cada 15 minutos, contra quem tenta adivinhar. */
const CODIGOS_POR_JANELA = 10;
const JANELA_SEGUNDOS = 15 * 60;

/** Confere o código e, se estiver certo, eleva a sessão para aal2. */
export async function verificarCodigo(
  supabase: SupabaseClient,
  usuarioId: string,
  fatorId: string,
  codigo: string,
): Promise<Resultado<null>> {
  const limite = await clienteServico().rpc("consumir_limite", {
    p_chave: `totp:${usuarioId}`,
    p_limite: CODIGOS_POR_JANELA,
    p_janela_segundos: JANELA_SEGUNDOS,
  });
  if (limite.error) {
    console.error("verificarCodigo: consumir_limite falhou", { codigo: limite.error.code, mensagem: limite.error.message });
    return { ok: false, erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível conferir o código agora. Tente de novo." } };
  }
  if (limite.data === false) {
    return {
      ok: false,
      erro: { codigo: "LIMITE_DE_REQUISICOES", mensagem: "Muitos códigos digitados. Espere 15 minutos e tente de novo." },
    };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigo });
  if (!error) return { ok: true, dados: null };
  if (error.code === "mfa_verification_failed" || error.code === "mfa_challenge_expired") {
    return {
      ok: false,
      erro: { codigo: "DADOS_INVALIDOS", mensagem: "Código incorreto ou vencido. Confira o relógio do celular e digite o código atual." },
    };
  }
  console.error("verificarCodigo: challengeAndVerify falhou", { codigo: error.code, status: error.status, mensagem: error.message });
  return { ok: false, erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível conferir o código agora. Tente de novo." } };
}
