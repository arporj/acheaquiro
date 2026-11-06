// Área do representante (item 4.12; decisões de 23 e 24/10/2026): termo de
// confidencialidade, cadastro próprio (link, código e chave Pix) e histórico
// de atendimento. Tudo usa a sessão do representante: o RLS do banco só o
// trata como representante com a segunda etapa feita e o termo aceito
// (interno.meu_representante_id, migration 20261024100100).
import type { Resultado } from "@acheaqui/types";
import { esquemaAtendimento, esquemaChavePix, mensagensPorCampo, type TipoChavePix } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENTOS } from "./documentosLegais";
import { clienteServico } from "./sessao";

type CodigoFalha = "DADOS_INVALIDOS" | "CONFLITO" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string; campos?: Record<string, string> } };
const falha = (codigo: CodigoFalha, mensagem: string, campos?: Record<string, string>): Falha => ({ ok: false, erro: { codigo, mensagem, campos } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");

/** Mensagem das travas do banco (P0001) pode ir para a tela; o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

// ---------------------------------------------------------------------------
// Termo de confidencialidade
// ---------------------------------------------------------------------------

export async function termoAceito(supabase: SupabaseClient, usuarioId: string): Promise<Resultado<boolean>> {
  const { data, error } = await supabase
    .from("aceites_documentos")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("documento", "confidencialidade")
    .eq("versao", DOCUMENTOS.confidencialidade.vigente)
    .limit(1);
  if (error) return mensagemDoBanco(error, "termoAceito");
  return { ok: true, dados: data.length > 0 };
}

/** Grava o aceite da versão em vigor, com a data (sem o IP: a especificação pede só data e versão). */
export async function aceitarTermo(supabase: SupabaseClient, usuarioId: string): Promise<Resultado<null>> {
  const ja = await termoAceito(supabase, usuarioId);
  if (!ja.ok) return ja;
  if (ja.dados) return { ok: true, dados: null };
  const { error } = await supabase
    .from("aceites_documentos")
    .insert({ usuario_id: usuarioId, documento: "confidencialidade", versao: DOCUMENTOS.confidencialidade.vigente });
  return error ? mensagemDoBanco(error, "aceitarTermo") : { ok: true, dados: null };
}

// ---------------------------------------------------------------------------
// Cadastro do representante
// ---------------------------------------------------------------------------

export interface MeuCadastro {
  id: string;
  nome: string;
  codigo: string;
  chavePix: string | null;
  recebeComissao: boolean;
}

export async function lerMeuCadastro(supabase: SupabaseClient, usuarioId: string): Promise<Resultado<MeuCadastro>> {
  const [rep, perfil] = await Promise.all([
    supabase.from("representantes").select("id, codigo, chave_pix, recebe_comissao, ativo").eq("usuario_id", usuarioId).maybeSingle(),
    supabase.from("perfis_usuario").select("nome").eq("usuario_id", usuarioId).maybeSingle(),
  ]);
  if (rep.error) return mensagemDoBanco(rep.error, "lerMeuCadastro");
  if (perfil.error) return mensagemDoBanco(perfil.error, "lerMeuCadastro: perfil");
  if (!rep.data || !rep.data.ativo) return falha("NAO_ENCONTRADO", "Seu cadastro de representante não está ativo. Fale com a equipe.");
  return {
    ok: true,
    dados: {
      id: rep.data.id,
      nome: perfil.data?.nome ?? "",
      codigo: rep.data.codigo,
      chavePix: rep.data.chave_pix,
      recebeComissao: rep.data.recebe_comissao,
    },
  };
}

export const ROTULO_TIPO_PIX: Record<TipoChavePix, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Celular",
  aleatoria: "Chave aleatória",
};

export async function salvarChavePix(supabase: SupabaseClient, valor: string): Promise<Resultado<null>> {
  const dados = esquemaChavePix.safeParse(valor);
  if (!dados.success) {
    const campos = mensagensPorCampo(dados.error);
    return falha("DADOS_INVALIDOS", Object.values(campos)[0] ?? "Chave Pix inválida.", { chave: Object.values(campos)[0] ?? "" });
  }
  const { error } = await supabase.rpc("salvar_minha_chave_pix", { p_chave: dados.data.chave });
  return error ? mensagemDoBanco(error, "salvarChavePix") : { ok: true, dados: null };
}

// ---------------------------------------------------------------------------
// Histórico de atendimento
// ---------------------------------------------------------------------------

export interface RegistroAtendimento {
  id: string;
  dia: string;
  observacao: string;
  autor: string;
}

export async function registrarAtendimento(
  supabase: SupabaseClient,
  entrada: { anuncianteId: string; dia: string; observacao: string },
): Promise<Resultado<null>> {
  const dados = esquemaAtendimento.safeParse(entrada);
  if (!dados.success) {
    const campos = mensagensPorCampo(dados.error);
    return falha("DADOS_INVALIDOS", Object.values(campos)[0] ?? "Confira os dados do contato.", campos);
  }
  const { data: anunciante, error: erroAnunciante } = await supabase
    .from("anunciantes")
    .select("cidade_id")
    .eq("id", dados.data.anuncianteId)
    .maybeSingle();
  if (erroAnunciante) return mensagemDoBanco(erroAnunciante, "registrarAtendimento: anunciante");
  if (!anunciante) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const { error } = await supabase.from("atendimentos").insert({
    anunciante_id: dados.data.anuncianteId,
    cidade_id: anunciante.cidade_id,
    dia: dados.data.dia,
    observacao: dados.data.observacao,
  });
  if (error?.code === "42501") return falha("SEM_PERMISSAO", "Você não pode registrar contato com este anunciante.");
  return error ? mensagemDoBanco(error, "registrarAtendimento") : { ok: true, dados: null };
}

/** Registros de um anunciante que a sessão pode ler (o representante: só os dele; a equipe: todos). */
export async function listarAtendimentos(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<RegistroAtendimento[]>> {
  const { data, error } = await supabase
    .from("atendimentos")
    .select("id, dia, observacao, autor_id, criado_em")
    .eq("anunciante_id", anuncianteId)
    .order("dia", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error) return mensagemDoBanco(error, "listarAtendimentos");
  const autores = [...new Set(data.map((r) => r.autor_id as string))];
  const nomes = new Map<string, string>();
  if (autores.length) {
    const { data: perfis, error: erroPerfis } = await supabase.from("perfis_usuario").select("usuario_id, nome").in("usuario_id", autores);
    // Sem os nomes, a lista sai com "Equipe" no lugar: o registro do contato importa mais.
    if (erroPerfis) console.error("listarAtendimentos: nomes falharam", { codigo: erroPerfis.code, mensagem: erroPerfis.message });
    for (const p of perfis ?? []) nomes.set(p.usuario_id, p.nome);
  }
  return {
    ok: true,
    dados: data.map((r) => ({ id: r.id, dia: r.dia, observacao: r.observacao, autor: nomes.get(r.autor_id) || "Equipe" })),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Quem pediu para não ser mais procurado não é mais procurado por ninguém (só a equipe desfaz). */
export async function marcarNaoProcurar(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<null>> {
  if (!UUID.test(anuncianteId)) return falha("NAO_ENCONTRADO", "Comércio não encontrado.");
  const { data: anunciante, error: erroLeitura } = await supabase.from("anunciantes").select("cidade_id").eq("id", anuncianteId).maybeSingle();
  if (erroLeitura) return mensagemDoBanco(erroLeitura, "marcarNaoProcurar: comércio");
  if (!anunciante) return falha("NAO_ENCONTRADO", "Comércio não encontrado.");
  const { error } = await supabase.from("nao_procurar").insert({ anunciante_id: anuncianteId, cidade_id: anunciante.cidade_id });
  // Já marcado por outra pessoa: o resultado é o mesmo.
  if (error?.code === "23505") return { ok: true, dados: null };
  return error ? mensagemDoBanco(error, "marcarNaoProcurar") : { ok: true, dados: null };
}

/**
 * "Fechei com este comércio" (decisões Z1, Z3 e Z4, de 24/10/2026): cria o
 * rascunho do cadastro completo, copiado do importado, ou devolve o que o
 * representante já tem. O site continua mostrando o importado até o
 * comerciante aceitar o convite; aí o banco troca um pelo outro.
 */
export async function fecharComImportado(supabase: SupabaseClient, importadoId: string): Promise<Resultado<{ id: string }>> {
  if (!UUID.test(importadoId)) return falha("NAO_ENCONTRADO", "Comércio não encontrado.");
  const { data, error } = await supabase.rpc("assumir_importado", { p_importado: importadoId });
  if (error) return mensagemDoBanco(error, "fecharComImportado");
  return { ok: true, dados: { id: data as string } };
}

/** Cada convite manda um e-mail: no máximo 20 por representante a cada hora. */
export async function limiteDeConvites(usuarioId: string): Promise<Resultado<null>> {
  const limite = await clienteServico().rpc("consumir_limite", { p_chave: `convite:${usuarioId}`, p_limite: 20, p_janela_segundos: 3600 });
  if (limite.error) return mensagemDoBanco(limite.error, "limiteDeConvites");
  if (limite.data === false) return falha("SEM_PERMISSAO", "Muitos convites seguidos. Espere uma hora e tente de novo.");
  return { ok: true, dados: null };
}

/** Envio do modal "Registrei um contato" (ModalAtendimento.astro), na área do representante e na administração. */
export async function registrarDoFormulario(supabase: SupabaseClient, form: FormData): Promise<Resultado<{ naoProcurar: boolean }>> {
  const anuncianteId = String(form.get("anuncianteId") ?? "").slice(0, 40);
  const registro = await registrarAtendimento(supabase, {
    anuncianteId,
    dia: String(form.get("dia") ?? "").slice(0, 10),
    observacao: String(form.get("observacao") ?? "").slice(0, 600),
  });
  if (!registro.ok) return registro;
  const naoProcurar = form.get("naoProcurar") === "sim";
  if (naoProcurar) {
    const marcado = await marcarNaoProcurar(supabase, anuncianteId);
    if (!marcado.ok) return marcado;
  }
  return { ok: true, dados: { naoProcurar } };
}
