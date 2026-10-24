// Área do representante (item 4.12; decisões de 23 e 24/10/2026): termo de
// confidencialidade, cadastro próprio (link, código e chave Pix) e histórico
// de atendimento. Tudo usa a sessão do representante: o RLS do banco só o
// trata como representante com a segunda etapa feita e o termo aceito
// (interno.meu_representante_id, migration 20261024100100).
import type { Resultado } from "@acheaqui/types";
import { esquemaAtendimento, esquemaChavePix, mensagensPorCampo, type TipoChavePix } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENTOS } from "./documentosLegais";

type CodigoFalha = "DADOS_INVALIDOS" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "ERRO_INTERNO";
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

export interface UltimoContato {
  autor: string;
  dia: string;
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

/** Último contato de cada anunciante da lista: só o nome de quem fez e o dia (decisão Y1, 24/10/2026). */
export async function ultimosContatos(supabase: SupabaseClient, anuncianteIds: string[]): Promise<Resultado<Map<string, UltimoContato>>> {
  const mapa = new Map<string, UltimoContato>();
  if (!anuncianteIds.length) return { ok: true, dados: mapa };
  const { data, error } = await supabase.rpc("ultimos_contatos", { p_anunciantes: anuncianteIds });
  if (error) return mensagemDoBanco(error, "ultimosContatos");
  for (const linha of data as { anunciante_id: string; autor_nome: string; dia: string }[]) {
    mapa.set(linha.anunciante_id, { autor: linha.autor_nome, dia: linha.dia });
  }
  return { ok: true, dados: mapa };
}
