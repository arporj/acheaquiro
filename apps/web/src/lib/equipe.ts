// Equipe (administração, fase 1): convidar, mudar papel, desativar e
// reativar administradores e representantes, e transferir o SupraAdmin.
// As alterações de tabela usam a sessão do administrador, para a auditoria
// registrar quem fez; a chave de serviço entra só no que o Supabase exige
// (enviar o convite e bloquear a entrada no Auth). As travas do SupraAdmin
// ficam no banco (migration 20261022140000).
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmarCodigoNovo } from "./duasEtapas";
import { codigoValido } from "./indicacao";
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

/**
 * Situação de um e-mail no convite (função situacao_email_equipe, migration
 * 20261102120000): "livre" quando não há conta nem cadastro com ele.
 */
export type SituacaoEmail =
  | { situacao: "livre" }
  | {
      situacao: "equipe_ativo" | "equipe_desativado" | "anunciante" | "outra_conta" | "cadastro_anunciante";
      usuario_id: string | null;
      nome: string | null;
      papel: PapelEquipe | "anunciante" | null;
      codigo_representante: string | null;
      convite_aceito: boolean;
    };

/** "Bloqueio" no Auth para conta desativada: cerca de 100 anos. */
const BLOQUEIO_DESATIVADO = "876000h";
const MENSAGEM_CODIGO = "Código do representante: de 3 a 30 letras minúsculas, números e hífens (ele forma o link acheaquiro.com.br/r/codigo).";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

async function bloquearEntrada(usuarioId: string): Promise<void> {
  const { error } = await clienteServico().auth.admin.updateUserById(usuarioId, { ban_duration: BLOQUEIO_DESATIVADO });
  // O papel já foi desativado no banco (vale na hora); o bloqueio no Auth só impede novas entradas.
  if (error) console.error("bloquearEntrada falhou", { codigo: error.code, mensagem: error.message });
}

/**
 * Devolve a entrada a quem estava desativado (decisão de 02/11/2026):
 * desbloqueia no Auth, apaga o aplicativo autenticador antigo (a pessoa
 * cadastra de novo antes de entrar, porque o middleware exige as duas etapas)
 * e manda um link de acesso: o convite, para quem não criou a senha, ou o de
 * nova senha, para quem já tinha.
 */
async function reativarAcesso(alvo: Pick<MembroEquipe, "usuario_id" | "email" | "convite_aceito">): Promise<Resultado<null>> {
  const servico = clienteServico();
  const { error: erroBloqueio } = await servico.auth.admin.updateUserById(alvo.usuario_id, { ban_duration: "none" });
  if (erroBloqueio) {
    console.error("reativarAcesso: desbloqueio falhou", { codigo: erroBloqueio.code, mensagem: erroBloqueio.message });
    return falha("ERRO_INTERNO", "A pessoa foi reativada no sistema, mas a entrada continua bloqueada. Tente reativar de novo em instantes.");
  }
  const { data: fatores, error: erroFatores } = await servico.auth.admin.mfa.listFactors({ userId: alvo.usuario_id });
  if (erroFatores) {
    console.error("reativarAcesso: leitura das duas etapas falhou", { codigo: erroFatores.code, mensagem: erroFatores.message });
    return ERRO_INTERNO;
  }
  for (const fator of fatores.factors) {
    const { error } = await servico.auth.admin.mfa.deleteFactor({ id: fator.id, userId: alvo.usuario_id });
    if (error) {
      console.error("reativarAcesso: remoção das duas etapas falhou", { codigo: error.code, mensagem: error.message });
      return ERRO_INTERNO;
    }
  }
  const { error: erroLink } = alvo.convite_aceito
    ? await servico.auth.resetPasswordForEmail(alvo.email)
    : await servico.auth.admin.inviteUserByEmail(alvo.email);
  if (erroLink) {
    console.error("reativarAcesso: envio do link falhou", { codigo: erroLink.code, status: erroLink.status, mensagem: erroLink.message });
    return falha(
      "ERRO_INTERNO",
      alvo.convite_aceito
        ? 'A pessoa foi reativada, mas o e-mail com o link não saiu. Peça que ela use "Esqueci a senha" na tela de entrar.'
        : 'A pessoa foi reativada, mas o e-mail com o link não saiu. Use "Reenviar convite" em "Gerenciar".',
    );
  }
  return { ok: true, dados: null };
}

/**
 * Cadastro de representante com o código pedido: cria ou reativa o existente.
 * Código vazio mantém o atual; código diferente troca o link (o antigo deixa de valer).
 */
async function garantirRepresentante(supabase: SupabaseClient, usuarioId: string, codigo: string): Promise<Resultado<null>> {
  const { data: existente, error: erroLeitura } = await supabase.from("representantes").select("codigo").eq("usuario_id", usuarioId).maybeSingle();
  if (erroLeitura) return mensagemDoBanco(erroLeitura, "garantirRepresentante: leitura");
  if (existente && (!codigo || codigo === existente.codigo)) {
    const { error } = await supabase.from("representantes").update({ ativo: true }).eq("usuario_id", usuarioId);
    return error ? mensagemDoBanco(error, "garantirRepresentante") : { ok: true, dados: null };
  }
  if (!codigoValido(codigo)) return falha("DADOS_INVALIDOS", MENSAGEM_CODIGO);
  let error;
  if (existente) {
    ({ error } = await supabase.from("representantes").update({ ativo: true, codigo }).eq("usuario_id", usuarioId));
  } else {
    const { data: cidade } = await supabase.from("cidades").select("id").eq("slug", "rio-das-ostras").single();
    ({ error } = await supabase.from("representantes").insert({ usuario_id: usuarioId, cidade_id: cidade?.id, codigo }));
  }
  if (error?.code === "23505") return falha("CONFLITO", "Este código de representante já está em uso.");
  return error ? mensagemDoBanco(error, "garantirRepresentante") : { ok: true, dados: null };
}

/** Situação do e-mail para o aviso do convite e para decidir entre convidar e reativar. */
export async function situacaoDoEmail(supabase: SupabaseClient, email: string): Promise<Resultado<SituacaoEmail>> {
  const normalizado = email.trim().toLowerCase();
  if (!EMAIL.test(normalizado) || normalizado.length > 254) return falha("DADOS_INVALIDOS", "E-mail inválido.");
  const { data, error } = await supabase.rpc("situacao_email_equipe", { p_email: normalizado });
  if (error) return mensagemDoBanco(error, "situacaoDoEmail");
  const linha = (data as Exclude<SituacaoEmail, { situacao: "livre" }>[])[0];
  return { ok: true, dados: linha ?? { situacao: "livre" } };
}

/** Código do representante livre? O código atual da própria pessoa (donoId) conta como livre. */
export async function verificarCodigo(
  supabase: SupabaseClient,
  codigo: string,
  donoId: string | null,
): Promise<Resultado<{ disponivel: boolean; mensagem: string }>> {
  if (!codigoValido(codigo)) return { ok: true, dados: { disponivel: false, mensagem: MENSAGEM_CODIGO } };
  const { data, error } = await supabase.from("representantes").select("usuario_id").eq("codigo", codigo).maybeSingle();
  if (error) return mensagemDoBanco(error, "verificarCodigo");
  if (!data) return { ok: true, dados: { disponivel: true, mensagem: "Código disponível." } };
  if (data.usuario_id === donoId) return { ok: true, dados: { disponivel: true, mensagem: "É o código atual desta pessoa." } };
  const dono = await lerMembro(supabase, data.usuario_id);
  const quem = dono ? `${dono.nome || dono.email}${dono.ativo ? "" : " (desativado)"}` : "outra pessoa";
  return { ok: true, dados: { disponivel: false, mensagem: `Código já usado por ${quem}.` } };
}

type DadosConvite = { nome: string; email: string; papel: PapelEquipe; codigoRepresentante: string; codigoAutenticador: string };

/** Convida, ou reativa quem estava desativado na equipe com o mesmo e-mail. */
export async function convidar(supabase: SupabaseClient, autorId: string, dados: DadosConvite): Promise<Resultado<"convidado" | "reativado">> {
  const nome = dados.nome.trim();
  const email = dados.email.trim().toLowerCase();
  if (nome.length < 2 || nome.length > 120) return falha("DADOS_INVALIDOS", "Informe o nome (de 2 a 120 caracteres).");
  if (!EMAIL.test(email) || email.length > 254) return falha("DADOS_INVALIDOS", "E-mail inválido.");
  if (dados.papel === "representante" && !codigoValido(dados.codigoRepresentante)) return falha("DADOS_INVALIDOS", MENSAGEM_CODIGO);
  if (dados.papel === "administrador") {
    const codigo = await exigirCodigo(supabase, autorId, dados.codigoAutenticador);
    if (!codigo.ok) return codigo;
  }

  const situacao = await situacaoDoEmail(supabase, email);
  if (!situacao.ok) return situacao;
  switch (situacao.dados.situacao) {
    case "equipe_ativo":
      return falha("CONFLITO", 'Esta pessoa já está na equipe. Para mudar o papel, use "Gerenciar" na lista.');
    case "anunciante":
      return falha("CONFLITO", "Este e-mail é de um anunciante. Cada e-mail tem uma conta só: convide a pessoa com outro e-mail.");
    case "cadastro_anunciante":
      return falha("CONFLITO", "Este e-mail está num cadastro de anunciante em andamento. Convide a pessoa com outro e-mail.");
    case "outra_conta":
      return falha("CONFLITO", "Já existe uma conta com este e-mail.");
    case "equipe_desativado": {
      const alvo = situacao.dados.usuario_id ? await lerMembro(supabase, situacao.dados.usuario_id) : null;
      if (!alvo) return falha("NAO_ENCONTRADO", "Pessoa não encontrada na equipe.");
      const reativado = await reativarPeloConvite(supabase, autorId, alvo, { ...dados, nome });
      return reativado.ok ? { ok: true, dados: "reativado" } : reativado;
    }
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
  if (dados.papel === "representante") {
    const rep = await garantirRepresentante(supabase, usuarioId, dados.codigoRepresentante);
    if (!rep.ok) return rep;
  }
  return { ok: true, dados: "convidado" };
}

/** Reativação pelo convite: papel, nome e código passam a ser os do formulário. */
async function reativarPeloConvite(supabase: SupabaseClient, autorId: string, alvo: MembroEquipe, dados: DadosConvite): Promise<Resultado<null>> {
  // Virar administrador já foi confirmado em convidar; deixar de ser também é sensível.
  if (alvo.papel === "administrador" && dados.papel !== "administrador") {
    const codigo = await exigirCodigo(supabase, autorId, dados.codigoAutenticador);
    if (!codigo.ok) return codigo;
  }
  if (dados.papel === "representante") {
    const rep = await garantirRepresentante(supabase, alvo.usuario_id, dados.codigoRepresentante);
    if (!rep.ok) return rep;
  }
  const { error } = await supabase.from("perfis_usuario").update({ papel: dados.papel, nome: dados.nome, ativo: true }).eq("usuario_id", alvo.usuario_id);
  if (error) return mensagemDoBanco(error, "reativarPeloConvite");
  if (alvo.papel === "representante" && dados.papel !== "representante") {
    const { error: erroRep } = await supabase.from("representantes").update({ ativo: false }).eq("usuario_id", alvo.usuario_id);
    if (erroRep) return mensagemDoBanco(erroRep, "reativarPeloConvite: representante");
  }
  return reativarAcesso(alvo);
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
  if (ativo) return reativarAcesso(alvo);
  await bloquearEntrada(alvoId);
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
