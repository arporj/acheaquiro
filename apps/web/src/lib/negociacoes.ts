// Clientes e negociações (opção B, decisões N1 a N6 de 06/11/2026): a lista única
// de clientes, a lista de negociações, a ficha e as ações dela. As contas e as
// permissões ficam no banco (migration 20261106120000); o que a ficha oferece em
// cada situação fica em packages/domain/negociacao.ts.
import { somarDias, type DataISO, type EtapaNegociacao, type SituacaoNegociacao, type TipoNegociacao } from "@acheaqui/domain";
import type { Resultado } from "@acheaqui/types";
import { esquemaMotivoPerda, esquemaNegociacaoPerdida, esquemaProximaAcao } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Situacao } from "./anunciantesAdmin";
import { hojeNaCidade } from "./pagamentos";
import { fecharComImportado, registrarDoFormulario } from "./representante";

type CodigoFalha = "DADOS_INVALIDOS" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string } };
const falha = (codigo: CodigoFalha, mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
}

export const POR_PAGINA = 30;

export const ROTULO_ETAPA: Record<EtapaNegociacao, string> = {
  contato: "Em contato",
  em_cadastro: "Em cadastro",
  convite_enviado: "Convite enviado",
  aceitou: "Aceitou o convite",
  proposta_enviada: "Proposta enviada",
  proposta_aceita: "Proposta aceita: falta pagar",
};
export const COR_ETAPA: Record<EtapaNegociacao, string> = {
  contato: "bg-fundo text-slate-700",
  em_cadastro: "bg-amarelo-200 text-azul-900",
  convite_enviado: "bg-amarelo-300 text-azul-900",
  aceitou: "bg-azul-50 text-azul-700",
  proposta_enviada: "bg-azul-100 text-azul-800",
  proposta_aceita: "bg-azul-200 text-azul-900",
};
export const ROTULO_SITUACAO_NEGOCIACAO: Record<SituacaoNegociacao, string> = { aberta: "Aberta", ganha: "Ganha", perdida: "Perdida" };
export const COR_SITUACAO_NEGOCIACAO: Record<SituacaoNegociacao, string> = {
  aberta: "bg-azul-50 text-azul-700",
  ganha: "bg-zap-50 text-zap-700",
  perdida: "bg-slate-200 text-slate-700",
};
export const ROTULO_TIPO: Record<TipoNegociacao, string> = { assinatura: "Assinatura", upgrade: "Plano maior" };

const ehEtapa = (v: string): v is EtapaNegociacao => v in ROTULO_ETAPA;
const id = (p: URLSearchParams, nome: string) => (UUID.test(p.get(nome) ?? "") ? p.get(nome)! : "");
const pagina = (p: URLSearchParams) => {
  const n = Number.parseInt(p.get("pagina") ?? "1", 10);
  return Number.isInteger(n) && n > 0 && n <= 1000 ? n : 1;
};

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface LinhaCliente {
  id: string;
  nome: string;
  slug: string;
  tipo: "profissional" | "comercio";
  status: Situacao;
  origem: "cadastro" | "receita";
  categoria: string | null;
  bairro: string | null;
  endereco: string | null;
  tem_conta: boolean;
  plano: string | null;
  vence_em: DataISO | null;
  nao_procurar: boolean;
  razao_social: string | null;
  telefones: string[] | null;
  email: string | null;
  negociacao: {
    id: string;
    tipo: TipoNegociacao;
    situacao: SituacaoNegociacao;
    etapa: EtapaNegociacao | null;
    responsavel: string;
    minha: boolean;
    proxima_acao_em: DataISO | null;
  } | null;
  ultimo_contato: { dia: DataISO; autor: string } | null;
}

export interface FiltroClientes {
  busca: string;
  categoriaId: string;
  bairroId: string;
  tipo: "" | "profissional" | "comercio";
  situacao: "" | "sem" | SituacaoNegociacao;
  etapa: "" | EtapaNegociacao;
  conta: "" | "com" | "sem";
  meus: boolean;
  responsavelId: string;
  pagina: number;
}

export function lerFiltroClientes(p: URLSearchParams): FiltroClientes {
  const tipo = p.get("tipo");
  const situacao = p.get("situacao");
  const etapa = p.get("etapa") ?? "";
  const conta = p.get("conta");
  return {
    busca: (p.get("q") ?? "").trim().slice(0, 80),
    categoriaId: id(p, "categoria"),
    bairroId: id(p, "bairro"),
    tipo: tipo === "profissional" || tipo === "comercio" ? tipo : "",
    situacao: situacao === "sem" || situacao === "aberta" || situacao === "ganha" || situacao === "perdida" ? situacao : "",
    etapa: ehEtapa(etapa) ? etapa : "",
    conta: conta === "com" || conta === "sem" ? conta : "",
    meus: p.get("meus") === "1",
    responsavelId: id(p, "responsavel"),
    pagina: pagina(p),
  };
}

export async function listarClientes(supabase: SupabaseClient, f: FiltroClientes): Promise<Resultado<{ total: number; linhas: LinhaCliente[] }>> {
  const { data, error } = await supabase.rpc("clientes_lista", {
    p_busca: f.busca || null,
    p_categoria: f.categoriaId || null,
    p_bairro: f.bairroId || null,
    p_tipo: f.tipo || null,
    p_situacao: f.situacao || null,
    p_etapa: f.etapa || null,
    p_conta: f.conta || null,
    p_meus: f.meus,
    p_responsavel: f.responsavelId || null,
    p_pagina: f.pagina,
  });
  if (error) return mensagemDoBanco(error, "listarClientes");
  return { ok: true, dados: data as { total: number; linhas: LinhaCliente[] } };
}

// ---------------------------------------------------------------------------
// Negociações
// ---------------------------------------------------------------------------

export interface LinhaNegociacao {
  id: string;
  anunciante_id: string;
  cliente: string;
  tem_conta: boolean;
  tipo: TipoNegociacao;
  situacao: SituacaoNegociacao;
  etapa: EtapaNegociacao | null;
  responsavel: string;
  responsavel_ativo: boolean;
  minha: boolean;
  proxima_acao_em: DataISO | null;
  proxima_acao: string;
  motivo: string | null;
  aberta_em: string;
  fechada_em: string | null;
  contatos: number;
  ultimo_contato: DataISO | null;
}

export interface FiltroNegociacoes {
  /** Vazio: todas as situações. Sem o parâmetro na URL, as abertas. */
  situacao: "" | SituacaoNegociacao;
  etapa: "" | EtapaNegociacao;
  tipo: "" | TipoNegociacao;
  responsavelId: string;
  atrasadas: boolean;
  busca: string;
  inicio: DataISO | "";
  fim: DataISO | "";
  pagina: number;
}

export function lerFiltroNegociacoes(p: URLSearchParams): FiltroNegociacoes {
  const situacao = p.get("situacao");
  const etapa = p.get("etapa") ?? "";
  const tipo = p.get("tipo");
  const de = p.get("de") ?? "";
  const ate = p.get("ate") ?? "";
  return {
    situacao: situacao === null ? "aberta" : situacao === "aberta" || situacao === "ganha" || situacao === "perdida" ? situacao : "",
    etapa: ehEtapa(etapa) ? etapa : "",
    tipo: tipo === "assinatura" || tipo === "upgrade" ? tipo : "",
    responsavelId: id(p, "responsavel"),
    atrasadas: p.get("atrasadas") === "1",
    busca: (p.get("q") ?? "").trim().slice(0, 80),
    inicio: DATA.test(de) ? (de as DataISO) : "",
    fim: DATA.test(ate) ? (ate as DataISO) : "",
    pagina: pagina(p),
  };
}

export async function listarNegociacoes(supabase: SupabaseClient, f: FiltroNegociacoes): Promise<Resultado<{ total: number; linhas: LinhaNegociacao[] }>> {
  const { data, error } = await supabase.rpc("negociacoes_lista", {
    p_situacao: f.situacao || null,
    p_etapa: f.etapa || null,
    p_tipo: f.tipo || null,
    p_responsavel: f.responsavelId || null,
    p_atrasadas: f.atrasadas,
    p_busca: f.busca || null,
    p_inicio: f.inicio || null,
    p_fim: f.fim || null,
    p_pagina: f.pagina,
  });
  if (error) return mensagemDoBanco(error, "listarNegociacoes");
  return { ok: true, dados: data as { total: number; linhas: LinhaNegociacao[] } };
}

export interface ResumoPessoa {
  usuario_id: string;
  nome: string | null;
  papel: "administrador" | "representante" | "anunciante" | null;
  ativo: boolean | null;
  contatos: number;
  comercios: number;
  cadastros_iniciados: number;
  abertas: number;
  atrasadas: number;
  ganhas: number;
  perdidas: number;
  valor_vendido_centavos: number;
}

/** O resumo da administração: sem datas no filtro, os últimos 30 dias. */
export function periodoDoResumo(f: Pick<FiltroNegociacoes, "inicio" | "fim">, hoje: DataISO = hojeNaCidade()): { inicio: DataISO; fim: DataISO } {
  const fim = f.fim || hoje;
  return { inicio: f.inicio && f.inicio <= fim ? f.inicio : somarDias(fim, -30), fim };
}

export async function resumirNegociacoes(supabase: SupabaseClient, periodo: { inicio: DataISO; fim: DataISO }): Promise<Resultado<ResumoPessoa[]>> {
  const { data, error } = await supabase.rpc("resumo_negociacoes", { p_inicio: periodo.inicio, p_fim: periodo.fim });
  if (error) return mensagemDoBanco(error, "resumirNegociacoes");
  return {
    ok: true,
    // Os totais vêm do banco como bigint.
    dados: (data as ResumoPessoa[]).map((r) => ({
      ...r,
      contatos: Number(r.contatos),
      comercios: Number(r.comercios),
      cadastros_iniciados: Number(r.cadastros_iniciados),
      abertas: Number(r.abertas),
      atrasadas: Number(r.atrasadas),
      ganhas: Number(r.ganhas),
      perdidas: Number(r.perdidas),
      valor_vendido_centavos: Number(r.valor_vendido_centavos),
    })),
  };
}

// ---------------------------------------------------------------------------
// Ficha do cliente
// ---------------------------------------------------------------------------

export interface NegociacaoDaFicha {
  id: string;
  tipo: TipoNegociacao;
  situacao: SituacaoNegociacao;
  etapa: EtapaNegociacao | null;
  responsavel: string;
  responsavel_id: string;
  responsavel_ativo: boolean;
  minha: boolean;
  pode_alterar: boolean;
  proxima_acao_em: DataISO | null;
  proxima_acao: string;
  motivo: string | null;
  observacao_perda: string;
  aberta_em: string;
  fechada_em: string | null;
}

export type ItemDaLinhaDoTempo = {
  quando: string;
  dia?: DataISO;
  tipo: "contato" | "fechou" | "aceite" | "proposta" | "pagamento" | "pagamento_devolvido" | "perdida";
  autor: string | null;
  texto: string | null;
  situacao?: string;
  valor_centavos?: number | null;
};

export interface FichaCliente {
  cliente: {
    id: string;
    nome: string;
    slug: string;
    tipo: "profissional" | "comercio";
    status: Situacao;
    origem: "cadastro" | "receita";
    tem_conta: boolean;
    whatsapp: string | null;
    telefone: string | null;
    categoria: string | null;
    plano: string | null;
    fundador: boolean;
    plano_em_dia: boolean;
    vence_em: DataISO | null;
    nao_procurar: boolean;
    meu_cadastro: boolean;
    carteira: string | null;
    endereco: string | null;
  };
  receita: { razao_social: string; telefones: string[]; email: string | null } | null;
  copia: { id: string; autor: string; minha: boolean; ate: DataISO; convite_enviado: boolean; vencida: boolean } | null;
  negociacoes: NegociacaoDaFicha[];
  linha_do_tempo: ItemDaLinhaDoTempo[];
}

export async function lerFicha(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<FichaCliente>> {
  if (!UUID.test(anuncianteId)) return falha("NAO_ENCONTRADO", "Cliente não encontrado.");
  const { data, error } = await supabase.rpc("ficha_cliente", { p_anunciante: anuncianteId });
  if (error) {
    if (error.code === "P0001") return falha("NAO_ENCONTRADO", "Cliente não encontrado.");
    return mensagemDoBanco(error, "lerFicha");
  }
  return { ok: true, dados: data as FichaCliente };
}

/** Motivos ativos, para marcar uma negociação como perdida (o motivo do sistema entra sozinho). */
export async function listarMotivosAtivos(supabase: SupabaseClient): Promise<Resultado<{ id: string; nome: string }[]>> {
  const { data, error } = await supabase.from("motivos_perda").select("id, nome").eq("ativo", true).is("codigo_sistema", null).order("ordem").order("nome");
  if (error) return mensagemDoBanco(error, "listarMotivosAtivos");
  return { ok: true, dados: data };
}

const AVISOS_DA_FICHA = {
  atendimento: "Contato registrado.",
  "nao-procurar": "Contato registrado. O cliente pediu para não ser mais procurado, e a negociação foi encerrada.",
  aberta: "Negociação aberta. Ela é sua.",
  proxima: "Próxima ação salva.",
  perdida: "Negociação marcada como perdida.",
  reaberta: "Negociação reaberta.",
  responsavel: "Responsável trocado.",
  proposta: "Proposta enviada. O anunciante recebe um e-mail para entrar na conta, ver os valores e aceitar.",
} as const;
export const avisoDaFicha = (chave: string | null): string | undefined => AVISOS_DA_FICHA[chave as keyof typeof AVISOS_DA_FICHA];

/**
 * Formulários da ficha e da lista de clientes, com a mesma resposta: o aviso a
 * mostrar ou, no "Fechei", o cadastro para onde ir. O banco confere de novo quem
 * pode fazer o quê.
 */
export async function executarAcao(
  supabase: SupabaseClient,
  form: FormData,
): Promise<Resultado<{ aviso: keyof typeof AVISOS_DA_FICHA } | { destino: string }>> {
  const texto = (nome: string, limite = 400) => String(form.get(nome) ?? "").slice(0, limite);
  const negociacao = texto("negociacao", 40);
  switch (texto("acao", 20)) {
    case "atendimento": {
      const r = await registrarDoFormulario(supabase, form);
      return r.ok ? { ok: true, dados: { aviso: r.dados.naoProcurar ? "nao-procurar" : "atendimento" } } : r;
    }
    case "fechar": {
      const r = await fecharComImportado(supabase, texto("anuncianteId", 40));
      return r.ok ? { ok: true, dados: { destino: `/representante/anunciantes/${r.dados.id}?aviso=fechado` } } : r;
    }
    case "abrir": {
      const tipo = texto("tipo", 12);
      if (tipo !== "assinatura" && tipo !== "upgrade") return falha("DADOS_INVALIDOS", "Tipo de negociação inválido.");
      const { error } = await supabase.rpc("abrir_negociacao", { p_anunciante: texto("anuncianteId", 40), p_tipo: tipo });
      return error ? mensagemDoBanco(error, "abrir_negociacao") : { ok: true, dados: { aviso: "aberta" } };
    }
    case "proxima": {
      const v = esquemaProximaAcao.safeParse({ dia: texto("dia", 10), texto: texto("texto") });
      if (!v.success) return falha("DADOS_INVALIDOS", v.error.issues[0]!.message);
      const { error } = await supabase.rpc("salvar_proxima_acao", { p_negociacao: negociacao, p_dia: v.data.dia || null, p_texto: v.data.texto });
      return error ? mensagemDoBanco(error, "salvar_proxima_acao") : { ok: true, dados: { aviso: "proxima" } };
    }
    case "perdida": {
      const v = esquemaNegociacaoPerdida.safeParse({ motivoId: texto("motivo", 40), observacao: texto("observacao") });
      if (!v.success) return falha("DADOS_INVALIDOS", v.error.issues[0]!.message);
      const { error } = await supabase.rpc("marcar_negociacao_perdida", { p_negociacao: negociacao, p_motivo: v.data.motivoId, p_observacao: v.data.observacao });
      return error ? mensagemDoBanco(error, "marcar_negociacao_perdida") : { ok: true, dados: { aviso: "perdida" } };
    }
    case "reabrir": {
      const { error } = await supabase.rpc("reabrir_negociacao", { p_negociacao: negociacao });
      return error ? mensagemDoBanco(error, "reabrir_negociacao") : { ok: true, dados: { aviso: "reaberta" } };
    }
    case "responsavel": {
      const { error } = await supabase.rpc("trocar_responsavel_negociacao", { p_negociacao: negociacao, p_usuario: texto("usuario", 40) });
      return error ? mensagemDoBanco(error, "trocar_responsavel_negociacao") : { ok: true, dados: { aviso: "responsavel" } };
    }
    default:
      return falha("DADOS_INVALIDOS", "Ação desconhecida.");
  }
}

// ---------------------------------------------------------------------------
// Motivos de perda (administração)
// ---------------------------------------------------------------------------

export interface MotivoPerda {
  id: string;
  nome: string;
  codigo_sistema: string | null;
  ativo: boolean;
  ordem: number;
}

export async function listarMotivos(supabase: SupabaseClient): Promise<Resultado<MotivoPerda[]>> {
  const { data, error } = await supabase.from("motivos_perda").select("id, nome, codigo_sistema, ativo, ordem").order("ordem").order("nome");
  if (error) return mensagemDoBanco(error, "listarMotivos");
  return { ok: true, dados: data as MotivoPerda[] };
}

export async function salvarMotivo(supabase: SupabaseClient, form: FormData): Promise<Resultado<null>> {
  const v = esquemaMotivoPerda.safeParse({ nome: String(form.get("nome") ?? "").slice(0, 100) });
  if (!v.success) return falha("DADOS_INVALIDOS", v.error.issues[0]!.message);
  const motivoId = String(form.get("id") ?? "");
  const ativo = form.get("ativo") !== "nao";
  const { error } = motivoId
    ? await supabase.from("motivos_perda").update({ nome: v.data.nome, ativo }).eq("id", motivoId)
    : await supabase.from("motivos_perda").insert({
        nome: v.data.nome,
        cidade_id: (await supabase.from("cidades").select("id").eq("slug", "rio-das-ostras").single()).data?.id,
      });
  if (error?.code === "23505") return falha("DADOS_INVALIDOS", "Já existe um motivo com esse nome.");
  if (error?.code === "23514") return falha("DADOS_INVALIDOS", "Este motivo é usado pelo sistema e não pode ser desativado.");
  return error ? mensagemDoBanco(error, "salvarMotivo") : { ok: true, dados: null };
}
