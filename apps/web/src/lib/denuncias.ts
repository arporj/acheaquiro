// Denúncias na administração (item 4.9): lista e tratamento. Usa a sessão do
// administrador, para o RLS e a auditoria registrarem quem tratou; quem tratou
// e quando são gravados pelo banco (gatilho interno.tratar_denuncia).
import type { Resultado } from "@acheaqui/types";
import type { MotivoDenuncia } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SituacaoDenuncia = "aberta" | "procedente" | "improcedente";

export interface DenunciaAdmin {
  id: string;
  motivo: MotivoDenuncia;
  descricao: string;
  situacao: SituacaoDenuncia;
  observacao_equipe: string | null;
  criado_em: string;
  tratada_em: string | null;
  tratada_por: string | null;
  anunciante: { id: string; nome: string; slug: string; status: string } | null;
  /** Nome de quem tratou, lido de perfis_usuario. */
  nome_quem_tratou: string | null;
}

type Falha = { ok: false; erro: { codigo: "DADOS_INVALIDOS" | "NAO_ENCONTRADO" | "SEM_PERMISSAO" | "ERRO_INTERNO"; mensagem: string } };
const falha = (codigo: Falha["erro"]["codigo"], mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  // Travas do banco (P0001) podem ir para a tela; o resto vai só para o registro.
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
}

/** Abertas: as mais antigas primeiro (fila); tratadas: as mais recentes primeiro. */
export async function listarDenuncias(supabase: SupabaseClient, aberta: boolean): Promise<Resultado<DenunciaAdmin[]>> {
  let consulta = supabase
    .from("denuncias")
    .select(
      "id, motivo, descricao, situacao, observacao_equipe, criado_em, tratada_em, tratada_por, anunciante:anunciantes(id, nome, slug, status)",
    )
    .order(aberta ? "criado_em" : "tratada_em", { ascending: aberta })
    .limit(200);
  consulta = aberta ? consulta.eq("situacao", "aberta") : consulta.neq("situacao", "aberta");
  const { data, error } = await consulta;
  if (error) return mensagemDoBanco(error, "listarDenuncias");
  const denuncias = data as unknown as Omit<DenunciaAdmin, "nome_quem_tratou">[];

  // tratada_por aponta para auth.users: o nome vem de perfis_usuario, numa consulta só.
  const usuarios = [...new Set(denuncias.map((d) => d.tratada_por).filter((u): u is string => u !== null))];
  const nomes = new Map<string, string | null>();
  if (usuarios.length > 0) {
    const { data: perfis, error: erroPerfis } = await supabase.from("perfis_usuario").select("usuario_id, nome").in("usuario_id", usuarios);
    if (erroPerfis) return mensagemDoBanco(erroPerfis, "listarDenuncias: nomes da equipe");
    for (const p of perfis as { usuario_id: string; nome: string | null }[]) nomes.set(p.usuario_id, p.nome);
  }
  return { ok: true, dados: denuncias.map((d) => ({ ...d, nome_quem_tratou: d.tratada_por ? (nomes.get(d.tratada_por) ?? null) : null })) };
}

export async function tratarDenuncia(
  supabase: SupabaseClient,
  id: string,
  situacao: SituacaoDenuncia,
  observacao: string,
): Promise<Resultado<null>> {
  if (!UUID.test(id)) return falha("DADOS_INVALIDOS", "Denúncia inválida.");
  if (situacao === "aberta") return falha("DADOS_INVALIDOS", "Escolha se a denúncia procede ou não.");
  const texto = observacao.trim().slice(0, 1000);
  if (situacao === "improcedente" && !texto) return falha("DADOS_INVALIDOS", "Escreva por que a denúncia não procede (fica no histórico).");
  const { data, error } = await supabase
    .from("denuncias")
    .update({ situacao, observacao_equipe: texto || null })
    .eq("id", id)
    .eq("situacao", "aberta")
    .select("id");
  if (error) return mensagemDoBanco(error, "tratarDenuncia");
  if (!data?.length) return falha("NAO_ENCONTRADO", "Denúncia não encontrada ou já tratada.");
  return { ok: true, dados: null };
}
