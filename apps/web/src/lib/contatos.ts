// Contatos registrados e acompanhamento (decisão de 02/11/2026): a lista de
// todos os contatos de quem está vendo (o representante, os dele; o
// administrador, os de todos), com a etapa em que cada comércio está hoje, e o
// resumo por pessoa para a administração. As contas ficam no banco (funções
// contatos_registrados e resumo_contatos, migration 20261102130000).
import { somarDias, type DataISO } from "@acheaqui/domain";
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeNaCidade } from "./pagamentos";

type CodigoFalha = "DADOS_INVALIDOS" | "SEM_PERMISSAO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string } };
const falha = (codigo: CodigoFalha, mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });

function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("DADOS_INVALIDOS", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return falha("ERRO_INTERNO", "Não foi possível carregar os contatos agora. Tente de novo em instantes.");
}

export type EtapaContato = "prospeccao" | "em_cadastro" | "convite_enviado" | "aceito" | "publicado" | "plano_pago" | "nao_procurar" | "fora_do_ar";

/** Na ordem do funil, para o filtro. */
export const ROTULO_ETAPA: Record<EtapaContato, string> = {
  prospeccao: "Na prospecção",
  em_cadastro: "Em cadastro",
  convite_enviado: "Convite enviado",
  aceito: "Aceitou o convite",
  publicado: "Publicado, sem plano pago",
  plano_pago: "Plano pago",
  nao_procurar: "Não quer ser procurado",
  fora_do_ar: "Fora do ar",
};

export const COR_ETAPA: Record<EtapaContato, string> = {
  prospeccao: "bg-fundo text-slate-700",
  em_cadastro: "bg-amarelo-200 text-azul-900",
  convite_enviado: "bg-amarelo-300 text-azul-900",
  aceito: "bg-azul-50 text-azul-700",
  publicado: "bg-azul-100 text-azul-800",
  plano_pago: "bg-zap-50 text-zap-700",
  nao_procurar: "bg-vermelho-500 text-white",
  fora_do_ar: "bg-slate-200 text-slate-700",
};

export interface ContatoRegistrado {
  id: string;
  dia: DataISO;
  observacao: string;
  autor_id: string;
  autor_nome: string | null;
  anunciante_id: string;
  anunciante_nome: string;
  anunciante_tipo: "profissional" | "comercio";
  etapa: EtapaContato;
  /** O cadastro em andamento copiado do importado, quando há; senão, o próprio anunciante. */
  cadastro_id: string;
  fechado_por: string | null;
  do_meu_representante: boolean;
}

export interface ResumoPessoa {
  autor_id: string;
  nome: string | null;
  papel: "administrador" | "representante" | "anunciante" | null;
  ativo: boolean | null;
  contatos: number;
  comercios: number;
  cadastros_iniciados: number;
  vendas: number;
  valor_vendido_centavos: number;
}

export interface FiltroContatos {
  inicio: DataISO;
  fim: DataISO;
  busca: string;
  etapa: EtapaContato | "";
  /** Só na administração: os contatos de uma pessoa. */
  autorId: string;
}

/** Linhas que o banco devolve no máximo; a tela avisa quando chega nisso. */
export const LIMITE_CONTATOS = 500;
const DIAS_PADRAO = 30;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Filtro da URL; sem datas válidas, os últimos 30 dias. */
export function lerFiltroContatos(p: URLSearchParams, hoje: DataISO = hojeNaCidade()): FiltroContatos {
  const de = p.get("de") ?? "";
  const ate = p.get("ate") ?? "";
  const fim = DATA.test(ate) ? (ate as DataISO) : hoje;
  const inicio = DATA.test(de) && de <= fim ? (de as DataISO) : somarDias(fim, -DIAS_PADRAO);
  const etapa = p.get("etapa") ?? "";
  const autor = p.get("autor") ?? "";
  return {
    inicio,
    fim,
    busca: (p.get("q") ?? "").trim().slice(0, 80),
    etapa: etapa in ROTULO_ETAPA ? (etapa as EtapaContato) : "",
    autorId: UUID.test(autor) ? autor : "",
  };
}

export async function listarContatos(supabase: SupabaseClient, f: FiltroContatos): Promise<Resultado<ContatoRegistrado[]>> {
  const { data, error } = await supabase.rpc("contatos_registrados", {
    p_inicio: f.inicio,
    p_fim: f.fim,
    p_autor: f.autorId || null,
    p_busca: f.busca || null,
  });
  if (error) return mensagemDoBanco(error, "listarContatos");
  const lista = data as ContatoRegistrado[];
  return { ok: true, dados: f.etapa ? lista.filter((c) => c.etapa === f.etapa) : lista };
}

export async function resumirContatos(supabase: SupabaseClient, f: Pick<FiltroContatos, "inicio" | "fim">): Promise<Resultado<ResumoPessoa[]>> {
  const { data, error } = await supabase.rpc("resumo_contatos", { p_inicio: f.inicio, p_fim: f.fim });
  if (error) return mensagemDoBanco(error, "resumirContatos");
  return {
    ok: true,
    dados: (data as ResumoPessoa[]).map((r) => ({
      ...r,
      contatos: Number(r.contatos),
      comercios: Number(r.comercios),
      cadastros_iniciados: Number(r.cadastros_iniciados),
      vendas: Number(r.vendas),
      valor_vendido_centavos: Number(r.valor_vendido_centavos),
    })),
  };
}

/** Comércios diferentes na lista (o mesmo comércio pode ter vários contatos). */
export function comerciosDistintos(lista: readonly ContatoRegistrado[]): number {
  return new Set(lista.map((c) => c.anunciante_id)).size;
}
