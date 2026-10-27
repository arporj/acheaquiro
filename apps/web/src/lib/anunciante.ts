// Área do anunciante (item 4.7). Por enquanto, o aceite do cadastro assistido
// (27/10/2026): o anunciante convidado confere o que a equipe ou o
// representante cadastrou, aceita os Termos de Uso e a Política de Privacidade
// e envia para análise. Tudo usa a sessão do anunciante; o banco confere de
// novo o dono do cadastro e o aceite das versões em vigor (interno.exigir_aceite,
// migration 20261027100000).
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerAnunciante, type AnuncianteAdmin } from "./anunciantesAdmin";
import { DOCUMENTOS } from "./documentosLegais";

type CodigoFalha = "CONFLITO" | "SEM_PERMISSAO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string } };
const falha = (codigo: CodigoFalha, mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");

/** Mensagem das travas do banco (P0001) pode ir para a tela; o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

/** Documentos aceitos no envio do cadastro. */
const DOCUMENTOS_DO_CADASTRO = ["termos", "privacidade"] as const;

/** O cadastro ligado à conta; null se a conta ainda não tem cadastro. */
export async function lerMeuCadastro(supabase: SupabaseClient, usuarioId: string): Promise<Resultado<AnuncianteAdmin | null>> {
  const { data, error } = await supabase.from("anunciantes").select("id").eq("usuario_id", usuarioId).maybeSingle();
  if (error) return mensagemDoBanco(error, "lerMeuCadastro");
  if (!data) return { ok: true, dados: null };
  return lerAnunciante(supabase, data.id as string);
}

/** Nome do representante que fez o cadastro; null se foi a equipe. */
export async function representanteDoCadastro(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<string | null>> {
  const { data, error } = await supabase.rpc("representante_do_meu_cadastro", { p_anunciante: anuncianteId });
  if (error) return mensagemDoBanco(error, "representanteDoCadastro");
  return { ok: true, dados: (data as string | null) ?? null };
}

/**
 * Grava o aceite das versões em vigor dos Termos e da Política (os que faltam)
 * e envia o cadastro para análise. Se o envio falhar, o aceite fica gravado:
 * a pessoa aceitou, e o próximo envio não grava de novo.
 */
export async function enviarParaAnalise(supabase: SupabaseClient, usuarioId: string, cadastro: AnuncianteAdmin): Promise<Resultado<null>> {
  if (cadastro.status !== "aguardando_anunciante") return falha("CONFLITO", "Este cadastro já foi enviado.");

  const { data: aceitos, error: erroLeitura } = await supabase
    .from("aceites_documentos")
    .select("documento, versao")
    .eq("usuario_id", usuarioId)
    .in("documento", [...DOCUMENTOS_DO_CADASTRO]);
  if (erroLeitura) return mensagemDoBanco(erroLeitura, "enviarParaAnalise: aceites");
  const faltam = DOCUMENTOS_DO_CADASTRO.filter(
    (documento) => !aceitos.some((a) => a.documento === documento && a.versao === DOCUMENTOS[documento].vigente),
  ).map((documento) => ({ usuario_id: usuarioId, documento, versao: DOCUMENTOS[documento].vigente }));
  if (faltam.length > 0) {
    const { error } = await supabase.from("aceites_documentos").insert(faltam);
    if (error) return mensagemDoBanco(error, "enviarParaAnalise: aceite");
  }

  const { data, error } = await supabase
    .from("anunciantes")
    .update({ status: "em_analise" })
    .eq("id", cadastro.id)
    .eq("usuario_id", usuarioId)
    .select("id");
  if (error) return mensagemDoBanco(error, "enviarParaAnalise: situação");
  if (data.length === 0) {
    console.error("enviarParaAnalise: nenhum cadastro alterado", { anunciante: cadastro.id });
    return ERRO_INTERNO;
  }
  return { ok: true, dados: null };
}
