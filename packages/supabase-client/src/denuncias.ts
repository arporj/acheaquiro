// Denúncia de perfil (item 4.9), gravada pela função registrar_denuncia com a
// chave service_role: o visitante não grava direto (RLS). Limites da
// especificação técnica (seção 10.3): 5 denúncias por visitante por dia e 1 por
// perfil por dia. O visitante é o resumo do dia (hash do IP com o navegador),
// nunca o IP.
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Denúncia já validada (esquemaDenuncia, em packages/validation). */
export interface DenunciaValidada {
  anuncianteId: string;
  motivo: string;
  descricao: string;
}

const DENUNCIAS_POR_VISITANTE = 5;
const JANELA_DIA_SEGUNDOS = 24 * 60 * 60;

const ERRO_INTERNO = {
  ok: false,
  erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível enviar agora. Tente de novo em instantes." },
} as const;

async function consumir(servico: SupabaseClient, chave: string, limite: number): Promise<boolean | null> {
  const { data, error } = await servico.rpc("consumir_limite", { p_chave: chave, p_limite: limite, p_janela_segundos: JANELA_DIA_SEGUNDOS });
  if (error) {
    console.error("registrarDenuncia: consumir_limite falhou", { codigo: error.code, mensagem: error.message });
    return null;
  }
  return data === true;
}

/**
 * @param rotuloMotivo texto do motivo para o e-mail dos administradores (ROTULOS_MOTIVO_DENUNCIA).
 * @param visitante resumo do visitante, nunca o IP.
 */
export async function registrarDenuncia(
  servico: SupabaseClient,
  denuncia: DenunciaValidada,
  rotuloMotivo: string,
  visitante: string,
): Promise<Resultado<null>> {
  const porVisitante = await consumir(servico, `denuncia:${visitante}`, DENUNCIAS_POR_VISITANTE);
  if (porVisitante === null) return ERRO_INTERNO;
  if (!porVisitante) {
    return { ok: false, erro: { codigo: "LIMITE_DE_REQUISICOES", mensagem: "Você já enviou várias denúncias hoje. Tente de novo amanhã." } };
  }

  // Repetida no mesmo perfil: responde como enviada, sem gravar de novo.
  const primeira = await consumir(servico, `denuncia:${denuncia.anuncianteId}:${visitante}`, 1);
  if (primeira === null) return ERRO_INTERNO;
  if (!primeira) return { ok: true, dados: null };

  const { data, error } = await servico.rpc("registrar_denuncia", {
    p_anunciante: denuncia.anuncianteId,
    p_motivo: denuncia.motivo,
    p_descricao: denuncia.descricao,
    p_rotulo_motivo: rotuloMotivo,
  });
  if (error) {
    console.error("registrarDenuncia: gravação falhou", { codigo: error.code, mensagem: error.message });
    return ERRO_INTERNO;
  }
  if (data !== true) return { ok: false, erro: { codigo: "NAO_ENCONTRADO", mensagem: "Este perfil não está mais no ar." } };
  return { ok: true, dados: null };
}
