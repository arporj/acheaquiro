// Administração da importação pela Receita (D5, decisões de 23/10/2026):
// pedidos sobre o perfil (assumir, remover, fechou), sócios pela BrasilAPI,
// tabela CNAE → categoria e bairros da Receita sem correspondência. As
// alterações usam a sessão do administrador, para a auditoria registrar quem
// fez; a chave de serviço entra só no convite, que o Supabase Auth exige.
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paraSlug } from "./texto";
import { clienteServico } from "./sessao";

type Falha = { ok: false; erro: { codigo: "DADOS_INVALIDOS" | "CONFLITO" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "ERRO_INTERNO"; mensagem: string } };
const falha = (codigo: Falha["erro"]["codigo"], mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Mensagem das travas do banco (P0001) pode ir para a tela; o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

const limparObservacao = (texto: string) => texto.trim().slice(0, 1000) || null;

// ---------------------------------------------------------------------------
// Pedidos sobre o perfil
// ---------------------------------------------------------------------------

export type SituacaoPedido = "aberto" | "atendido" | "recusado";

export interface PedidoAdmin {
  id: string;
  tipo: "assumir" | "remover" | "fechou";
  situacao: SituacaoPedido;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  declarou_responsavel: boolean;
  mensagem: string;
  observacao_admin: string | null;
  criado_em: string;
  atendido_em: string | null;
  /** Guardados quando o perfil sai do site. */
  cnpj: string | null;
  nome_comercio: string | null;
  anunciante: {
    id: string;
    nome: string;
    slug: string;
    usuario_id: string | null;
    dados_receita: { cnpj: string; razao_social: string; telefones: string[]; email: string | null } | null;
  } | null;
}

export async function listarPedidos(supabase: SupabaseClient, situacao: SituacaoPedido): Promise<Resultado<PedidoAdmin[]>> {
  const { data, error } = await supabase
    .from("pedidos_perfil")
    .select(
      "id, tipo, situacao, nome, email, telefone, declarou_responsavel, mensagem, observacao_admin, criado_em, atendido_em, cnpj, nome_comercio, " +
        "anunciante:anunciantes(id, nome, slug, usuario_id, dados_receita(cnpj, razao_social, telefones, email))",
    )
    .eq("situacao", situacao)
    .order("criado_em", { ascending: situacao === "aberto" })
    .limit(200);
  if (error) return mensagemDoBanco(error, "listarPedidos");
  return { ok: true, dados: data as unknown as PedidoAdmin[] };
}

async function lerPedidoAberto(supabase: SupabaseClient, id: string): Promise<Resultado<PedidoAdmin>> {
  if (!UUID.test(id)) return falha("DADOS_INVALIDOS", "Pedido inválido.");
  const { data, error } = await supabase
    .from("pedidos_perfil")
    .select("id, tipo, situacao, nome, email, telefone, anunciante:anunciantes(id, nome, usuario_id, dados_receita(cnpj))")
    .eq("id", id)
    .maybeSingle();
  if (error) return mensagemDoBanco(error, "lerPedidoAberto");
  if (!data || data.situacao !== "aberto") return falha("NAO_ENCONTRADO", "Pedido não encontrado ou já atendido.");
  return { ok: true, dados: data as unknown as PedidoAdmin };
}

/**
 * "Assumir" confirmado: manda o convite para o e-mail de quem pediu (o
 * Supabase Auth cria a conta como anunciante) e liga a conta ao perfil, que
 * continua no ar. A pessoa cria a senha pelo link do e-mail.
 */
export async function confirmarAssumir(supabase: SupabaseClient, id: string, observacao: string): Promise<Resultado<null>> {
  const lido = await lerPedidoAberto(supabase, id);
  if (!lido.ok) return lido;
  const pedido = lido.dados;
  if (pedido.tipo !== "assumir" || !pedido.anunciante || !pedido.email) return falha("DADOS_INVALIDOS", "Este pedido não é de assumir um perfil.");
  if (pedido.anunciante.usuario_id) return falha("CONFLITO", "Este perfil já tem dono. Recuse o pedido ou fale com quem pediu.");

  const { data: convite, error } = await clienteServico().auth.admin.inviteUserByEmail(pedido.email, { data: { nome: pedido.nome ?? "" } });
  if (error) {
    if (error.code === "email_exists" || error.status === 422) {
      return falha("CONFLITO", "Já existe uma conta com este e-mail. Peça outro e-mail a quem pediu, ou ligue o perfil pela tela de anunciantes quando ela existir.");
    }
    console.error("confirmarAssumir: inviteUserByEmail falhou", { codigo: error.code, status: error.status, mensagem: error.message });
    return ERRO_INTERNO;
  }

  const { error: erroLigacao } = await supabase
    .from("anunciantes")
    .update({ usuario_id: convite.user.id, email_convite: pedido.email })
    .eq("id", pedido.anunciante.id);
  if (erroLigacao) {
    // O convite já saiu: a conta existe sem perfil ligado. Fica registrado para a equipe ligar à mão.
    console.error("confirmarAssumir: ligação da conta falhou depois do convite", {
      anunciante: pedido.anunciante.id,
      usuario: convite.user.id,
      codigo: erroLigacao.code,
      mensagem: erroLigacao.message,
    });
    return ERRO_INTERNO;
  }

  const { error: erroPedido } = await supabase
    .from("pedidos_perfil")
    .update({ situacao: "atendido", atendido_em: new Date().toISOString(), observacao_admin: limparObservacao(observacao) })
    .eq("id", id);
  return erroPedido ? mensagemDoBanco(erroPedido, "confirmarAssumir: pedido") : { ok: true, dados: null };
}

/** "Remover" ou "fechou" confirmado: bloqueia o CNPJ e apaga o perfil (função do banco, tudo ou nada). */
export async function confirmarRemocao(supabase: SupabaseClient, id: string, observacao: string): Promise<Resultado<null>> {
  if (!UUID.test(id)) return falha("DADOS_INVALIDOS", "Pedido inválido.");
  const { error } = await supabase.rpc("confirmar_remocao_pedido", { p_pedido: id, p_observacao: observacao.slice(0, 1000) });
  return error ? mensagemDoBanco(error, "confirmarRemocao") : { ok: true, dados: null };
}

export async function recusarPedido(supabase: SupabaseClient, id: string, observacao: string): Promise<Resultado<null>> {
  const lido = await lerPedidoAberto(supabase, id);
  if (!lido.ok) return lido;
  if (!observacao.trim()) return falha("DADOS_INVALIDOS", "Escreva o motivo da recusa (fica no histórico).");
  const { error } = await supabase
    .from("pedidos_perfil")
    .update({ situacao: "recusado", atendido_em: new Date().toISOString(), observacao_admin: limparObservacao(observacao) })
    .eq("id", id);
  return error ? mensagemDoBanco(error, "recusarPedido") : { ok: true, dados: null };
}

// ---------------------------------------------------------------------------
// Sócios pela BrasilAPI (consulta na hora, sem gravar nada)
// ---------------------------------------------------------------------------

export interface Socio {
  nome: string;
  qualificacao: string;
  desde: string | null;
}

const TEMPO_MAXIMO_BRASILAPI = 8000;

export async function consultarSocios(cnpj: string): Promise<Resultado<Socio[]>> {
  if (!/^[0-9]{14}$/.test(cnpj)) return falha("DADOS_INVALIDOS", "CNPJ inválido.");
  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(TEMPO_MAXIMO_BRASILAPI) });
    if (resposta.status === 404) return falha("NAO_ENCONTRADO", "A BrasilAPI não encontrou este CNPJ.");
    if (!resposta.ok) {
      console.error("consultarSocios: resposta inesperada da BrasilAPI", { status: resposta.status });
      return falha("ERRO_INTERNO", "A BrasilAPI não respondeu agora. Use a consulta da Receita.");
    }
    const dados = (await resposta.json()) as { qsa?: { nome_socio: string; qualificacao_socio: string; data_entrada_sociedade: string | null }[] };
    return {
      ok: true,
      dados: (dados.qsa ?? []).map((s) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio, desde: s.data_entrada_sociedade })),
    };
  } catch (erro) {
    console.error("consultarSocios: falha ao consultar a BrasilAPI", { erro: String(erro) });
    return falha("ERRO_INTERNO", "A BrasilAPI não respondeu agora. Use a consulta da Receita.");
  }
}

// ---------------------------------------------------------------------------
// CNAE → categoria
// ---------------------------------------------------------------------------

export interface CnaeAdmin {
  cnae: string;
  descricao: string;
  categoria_id: string | null;
}

export async function listarCnaes(supabase: SupabaseClient): Promise<Resultado<CnaeAdmin[]>> {
  const { data, error } = await supabase.from("cnae_categoria").select("cnae, descricao, categoria_id").order("cnae");
  if (error) return mensagemDoBanco(error, "listarCnaes");
  return { ok: true, dados: data as CnaeAdmin[] };
}

export async function listarCategoriasAdmin(supabase: SupabaseClient): Promise<Resultado<{ id: string; nome: string; grupo: string }[]>> {
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, grupos_categoria!inner(nome, ordem)")
    .eq("ativa", true)
    .order("nome");
  if (error) return mensagemDoBanco(error, "listarCategoriasAdmin");
  const linhas = data as unknown as { id: string; nome: string; grupos_categoria: { nome: string; ordem: number } }[];
  return {
    ok: true,
    dados: linhas
      .sort((a, b) => a.grupos_categoria.ordem - b.grupos_categoria.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
      .map((l) => ({ id: l.id, nome: l.nome, grupo: l.grupos_categoria.nome })),
  };
}

/** Vale para a próxima importação; os comércios já importados continuam na categoria em que estão. */
export async function salvarCnae(supabase: SupabaseClient, cnae: string, categoriaId: string): Promise<Resultado<null>> {
  if (!/^[0-9]{7}$/.test(cnae)) return falha("DADOS_INVALIDOS", "CNAE inválido.");
  if (categoriaId && !UUID.test(categoriaId)) return falha("DADOS_INVALIDOS", "Categoria inválida.");
  const { error } = await supabase.from("cnae_categoria").update({ categoria_id: categoriaId || null }).eq("cnae", cnae);
  return error ? mensagemDoBanco(error, "salvarCnae") : { ok: true, dados: null };
}

// ---------------------------------------------------------------------------
// Bairros da Receita sem correspondência
// ---------------------------------------------------------------------------

export interface ApelidoBairro {
  nome_receita: string;
  bairro_id: string | null;
  ignorar: boolean;
  comercios: number;
}

export async function listarApelidos(supabase: SupabaseClient): Promise<Resultado<ApelidoBairro[]>> {
  const { data, error } = await supabase
    .from("apelidos_bairro")
    .select("nome_receita, bairro_id, ignorar, comercios")
    .order("comercios", { ascending: false })
    .order("nome_receita");
  if (error) return mensagemDoBanco(error, "listarApelidos");
  return { ok: true, dados: data as ApelidoBairro[] };
}

export async function listarBairrosAdmin(supabase: SupabaseClient): Promise<Resultado<{ id: string; nome: string }[]>> {
  const { data, error } = await supabase.from("bairros").select("id, nome").eq("ativo", true).order("nome");
  if (error) return mensagemDoBanco(error, "listarBairrosAdmin");
  return { ok: true, dados: data };
}

/**
 * Muda o nome do bairro em todo o site (filtros, perfis, listas). O endereço
 * (slug) continua o mesmo, para não quebrar links já compartilhados.
 */
export async function renomearBairro(supabase: SupabaseClient, bairroId: string, nome: string): Promise<Resultado<null>> {
  if (!UUID.test(bairroId)) return falha("DADOS_INVALIDOS", "Bairro inválido.");
  const limpo = nome.trim().replace(/\s+/g, " ");
  if (limpo.length < 2 || limpo.length > 80) return falha("DADOS_INVALIDOS", "Nome do bairro: de 2 a 80 letras.");
  const { error } = await supabase.from("bairros").update({ nome: limpo }).eq("id", bairroId);
  return error ? mensagemDoBanco(error, "renomearBairro") : { ok: true, dados: null };
}

/**
 * Resolve um nome da Receita: liga a um bairro existente, cria um bairro novo
 * com esse nome ou deixa de fora. Os comércios entram na próxima importação.
 */
export async function resolverApelido(
  supabase: SupabaseClient,
  nomeReceita: string,
  decisao: { tipo: "ligar"; bairroId: string } | { tipo: "criar"; nome: string } | { tipo: "ignorar" } | { tipo: "pendente" },
): Promise<Resultado<null>> {
  if (!nomeReceita || nomeReceita.length > 100) return falha("DADOS_INVALIDOS", "Nome da Receita inválido.");
  let mudanca: { bairro_id: string | null; ignorar: boolean };
  switch (decisao.tipo) {
    case "ligar":
      if (!UUID.test(decisao.bairroId)) return falha("DADOS_INVALIDOS", "Escolha o bairro.");
      mudanca = { bairro_id: decisao.bairroId, ignorar: false };
      break;
    case "criar": {
      const nome = decisao.nome.trim().replace(/\s+/g, " ");
      if (nome.length < 2 || nome.length > 80) return falha("DADOS_INVALIDOS", "Nome do bairro novo: de 2 a 80 letras.");
      const { data: cidade, error: erroCidade } = await supabase.from("cidades").select("id").eq("slug", "rio-das-ostras").single();
      if (erroCidade) return mensagemDoBanco(erroCidade, "resolverApelido: cidade");
      const { data: bairro, error } = await supabase.from("bairros").insert({ cidade_id: cidade.id, nome, slug: paraSlug(nome) }).select("id").single();
      if (error?.code === "23505") return falha("CONFLITO", "Já existe um bairro com este nome. Escolha-o na lista.");
      if (error) return mensagemDoBanco(error, "resolverApelido: bairro novo");
      mudanca = { bairro_id: bairro.id, ignorar: false };
      break;
    }
    case "ignorar":
      mudanca = { bairro_id: null, ignorar: true };
      break;
    case "pendente":
      mudanca = { bairro_id: null, ignorar: false };
      break;
  }
  const { error } = await supabase.from("apelidos_bairro").update(mudanca).eq("nome_receita", nomeReceita);
  return error ? mensagemDoBanco(error, "resolverApelido") : { ok: true, dados: null };
}
