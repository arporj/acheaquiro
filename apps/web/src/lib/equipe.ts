// Equipe (administração, fase 1): convidar, mudar papel, desativar e
// reativar administradores e representantes, e transferir o SupraAdmin.
// As alterações de tabela usam a sessão do administrador, para a auditoria
// registrar quem fez; a chave de serviço entra só no que o Supabase exige
// (enviar o convite e bloquear a entrada no Auth). As travas do SupraAdmin
// ficam no banco (migration 20261022140000).
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmarCodigoNovo } from "./duasEtapas";
import { clienteServico } from "./sessao";

export type PapelEquipe = "administrador" | "representante";

export interface MembroEquipe {
  usuario_id: string;
  email: string;
  nome: string;
  papel: PapelEquipe | "anunciante";
  ativo: boolean;
  supra_admin: boolean;
  convite_aceito: boolean;
  ultimo_acesso: string | null;
  criado_em: string;
  codigo_representante: string | null;
}

/** "Bloqueio" no Auth para conta desativada: cerca de 100 anos. */
const BLOQUEIO_DESATIVADO = "876000h";
const CODIGO_REPRESENTANTE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Falha = { ok: false; erro: { codigo: "DADOS_INVALIDOS" | "CONFLITO" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "ERRO_INTERNO"; mensagem: string } };
const falha = (codigo: Falha["erro"]["codigo"], mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");

/** Mensagem do banco (travas do SupraAdmin) que pode ir para a tela; o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

export async function listarEquipe(supabase: SupabaseClient): Promise<Resultado<MembroEquipe[]>> {
  const { data, error } = await supabase.rpc("listar_equipe");
  if (error) return mensagemDoBanco(error, "listarEquipe");
  return { ok: true, dados: data as MembroEquipe[] };
}

async function exigirCodigo(supabase: SupabaseClient, usuarioId: string, codigo: string): Promise<Resultado<null>> {
  return confirmarCodigoNovo(supabase, usuarioId, codigo);
}

async function bloquearEntrada(usuarioId: string, bloquear: boolean): Promise<void> {
  const { error } = await clienteServico().auth.admin.updateUserById(usuarioId, { ban_duration: bloquear ? BLOQUEIO_DESATIVADO : "none" });
  // O papel já foi desativado no banco (vale na hora); o bloqueio no Auth só impede novas entradas.
  if (error) console.error("bloquearEntrada falhou", { bloquear, codigo: error.code, mensagem: error.message });
}

async function garantirRepresentante(supabase: SupabaseClient, usuarioId: string, codigo: string): Promise<Resultado<null>> {
  const { data: existente } = await supabase.from("representantes").select("id").eq("usuario_id", usuarioId).maybeSingle();
  if (existente) {
    const { error } = await supabase.from("representantes").update({ ativo: true }).eq("usuario_id", usuarioId);
    return error ? mensagemDoBanco(error, "garantirRepresentante") : { ok: true, dados: null };
  }
  if (!CODIGO_REPRESENTANTE.test(codigo) || codigo.length < 3 || codigo.length > 30) {
    return falha("DADOS_INVALIDOS", "Código do representante: de 3 a 30 letras minúsculas, números e hífens (ele forma o link acheaquiro.com.br/r/codigo).");
  }
  const { data: cidade } = await supabase.from("cidades").select("id").eq("slug", "rio-das-ostras").single();
  const { error } = await supabase.from("representantes").insert({ usuario_id: usuarioId, cidade_id: cidade?.id, codigo });
  if (error?.code === "23505") return falha("CONFLITO", "Este código de representante já está em uso.");
  return error ? mensagemDoBanco(error, "garantirRepresentante") : { ok: true, dados: null };
}

export async function convidar(
  supabase: SupabaseClient,
  autorId: string,
  dados: { nome: string; email: string; papel: PapelEquipe; codigoRepresentante: string; codigoAutenticador: string },
): Promise<Resultado<null>> {
  const nome = dados.nome.trim();
  const email = dados.email.trim().toLowerCase();
  if (nome.length < 2 || nome.length > 120) return falha("DADOS_INVALIDOS", "Informe o nome (de 2 a 120 caracteres).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return falha("DADOS_INVALIDOS", "E-mail inválido.");
  if (dados.papel === "representante" && !CODIGO_REPRESENTANTE.test(dados.codigoRepresentante)) {
    return falha("DADOS_INVALIDOS", "Código do representante: letras minúsculas, números e hífens (ele forma o link acheaquiro.com.br/r/codigo).");
  }
  if (dados.papel === "administrador") {
    const codigo = await exigirCodigo(supabase, autorId, dados.codigoAutenticador);
    if (!codigo.ok) return codigo;
  }

  const { data: convite, error } = await clienteServico().auth.admin.inviteUserByEmail(email, { data: { nome } });
  if (error) {
    if (error.code === "email_exists" || error.status === 422) return falha("CONFLITO", "Já existe uma conta com este e-mail.");
    console.error("convidar: inviteUserByEmail falhou", { codigo: error.code, status: error.status, mensagem: error.message });
    return ERRO_INTERNO;
  }
  const usuarioId = convite.user.id;
  // A conta nasce como anunciante (gatilho do banco); o papel muda pela sessão do administrador, que fica na auditoria.
  const { error: erroPapel } = await supabase.from("perfis_usuario").update({ papel: dados.papel, nome }).eq("usuario_id", usuarioId);
  if (erroPapel) return mensagemDoBanco(erroPapel, "convidar: papel");
  if (dados.papel === "representante") return garantirRepresentante(supabase, usuarioId, dados.codigoRepresentante);
  return { ok: true, dados: null };
}

/** Convites valem 1 hora: o reenvio manda outro link para quem ainda não criou a senha. */
export async function reenviarConvite(email: string): Promise<Resultado<null>> {
  const { error } = await clienteServico().auth.admin.inviteUserByEmail(email);
  if (!error) return { ok: true, dados: null };
  if (error.code === "email_exists" || error.status === 422) return falha("CONFLITO", "Esta pessoa já aceitou o convite e criou a senha.");
  console.error("reenviarConvite falhou", { codigo: error.code, status: error.status, mensagem: error.message });
  return ERRO_INTERNO;
}

async function lerMembro(supabase: SupabaseClient, usuarioId: string): Promise<MembroEquipe | null> {
  const lista = await listarEquipe(supabase);
  return lista.ok ? (lista.dados.find((m) => m.usuario_id === usuarioId) ?? null) : null;
}

export async function mudarSituacao(
  supabase: SupabaseClient,
  autorId: string,
  alvoId: string,
  ativo: boolean,
  codigoAutenticador: string,
): Promise<Resultado<null>> {
  const alvo = await lerMembro(supabase, alvoId);
  if (!alvo) return falha("NAO_ENCONTRADO", "Pessoa não encontrada na equipe.");
  if (alvo.papel === "administrador") {
    const codigo = await exigirCodigo(supabase, autorId, codigoAutenticador);
    if (!codigo.ok) return codigo;
  }
  const { error } = await supabase.from("perfis_usuario").update({ ativo }).eq("usuario_id", alvoId);
  if (error) return mensagemDoBanco(error, "mudarSituacao");
  if (alvo.papel === "representante") {
    const { error: erroRep } = await supabase.from("representantes").update({ ativo }).eq("usuario_id", alvoId);
    if (erroRep) return mensagemDoBanco(erroRep, "mudarSituacao: representante");
  }
  await bloquearEntrada(alvoId, !ativo);
  return { ok: true, dados: null };
}

export async function mudarPapel(
  supabase: SupabaseClient,
  autorId: string,
  alvoId: string,
  papel: PapelEquipe,
  dados: { codigoRepresentante: string; codigoAutenticador: string },
): Promise<Resultado<null>> {
  const alvo = await lerMembro(supabase, alvoId);
  if (!alvo) return falha("NAO_ENCONTRADO", "Pessoa não encontrada na equipe.");
  if (alvo.papel === papel) return { ok: true, dados: null };
  // Tornar ou deixar de ser administrador é sensível.
  if (papel === "administrador" || alvo.papel === "administrador") {
    const codigo = await exigirCodigo(supabase, autorId, dados.codigoAutenticador);
    if (!codigo.ok) return codigo;
  }
  if (papel === "representante") {
    const rep = await garantirRepresentante(supabase, alvoId, dados.codigoRepresentante);
    if (!rep.ok) return rep;
  }
  const { error } = await supabase.from("perfis_usuario").update({ papel }).eq("usuario_id", alvoId);
  if (error) return mensagemDoBanco(error, "mudarPapel");
  if (alvo.papel === "representante") {
    const { error: erroRep } = await supabase.from("representantes").update({ ativo: false }).eq("usuario_id", alvoId);
    if (erroRep) return mensagemDoBanco(erroRep, "mudarPapel: representante");
  }
  return { ok: true, dados: null };
}

export async function transferirSupraAdmin(
  supabase: SupabaseClient,
  autorId: string,
  novoId: string,
  codigoAutenticador: string,
): Promise<Resultado<null>> {
  const codigo = await exigirCodigo(supabase, autorId, codigoAutenticador);
  if (!codigo.ok) return codigo;
  const { error } = await supabase.rpc("transferir_supra_admin", { p_novo: novoId });
  return error ? mensagemDoBanco(error, "transferirSupraAdmin") : { ok: true, dados: null };
}
