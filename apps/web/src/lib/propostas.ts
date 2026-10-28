// Propostas do representante (plano 3B.1, decisões S2 a S8 de 28/10/2026): uma
// assinatura para quem não tem plano pago em dia, ou um plano maior no meio do
// período. O representante escolhe o plano e o desconto (até a comissão do
// pagamento em que ela sai); o anunciante aceita entrando na conta; a equipe
// registra o pagamento em até 7 dias, com o preço travado. As contas são as de
// packages/domain (calcularPagamentoPlano e calcularPagamentoUpgrade); o banco
// confere de novo no registro do pagamento.
import {
  anoComoFundador,
  calcularPagamentoPlano,
  calcularPagamentoUpgrade,
  diferencaParaComissao,
  percentualFundadorNoAno,
  situacaoCobranca,
  type DataISO,
} from "@acheaqui/domain";
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterAberturaAoPublico, obterRegrasCobranca } from "../dados/consultas";
import type { Situacao } from "./anunciantesAdmin";
import { hojeNaCidade } from "./pagamentos";

type CodigoFalha = "DADOS_INVALIDOS" | "CONFLITO" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string } };
const falha = (codigo: CodigoFalha, mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

export interface PlanoDaProposta {
  id: string;
  nome: string;
  nivel: number;
  valorMensalCentavos: number;
  mesesCobradosNoAnual: number;
}

/** O que a conta da proposta precisa (contexto_da_proposta, no banco). */
export interface ContextoProposta {
  anunciante: {
    id: string;
    nome: string;
    slug: string;
    tipo: "profissional" | "comercio";
    status: Situacao;
    temConta: boolean;
    fundadorDesde: DataISO | null;
    planoId: string | null;
  };
  assinatura: {
    planoId: string;
    periodicidade: "mensal" | "anual";
    ancora: DataISO;
    venceEm: DataISO;
    periodoInicio: DataISO | null;
    planoSeguinteId: string | null;
  } | null;
  pagamentosValidos: number;
  algumAnual: boolean;
  maiorComissionadaCentavos: number;
  planos: PlanoDaProposta[];
}

export async function lerContextoProposta(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<ContextoProposta>> {
  if (!UUID.test(anuncianteId)) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const { data, error } = await supabase.rpc("contexto_da_proposta", { p_anunciante: anuncianteId });
  if (error) return error.code === "P0001" ? falha("NAO_ENCONTRADO", "Anunciante não encontrado.") : mensagemDoBanco(error, "lerContextoProposta");
  return { ok: true, dados: data as ContextoProposta };
}

/** Upgrade quando há assinatura paga em dia (ou dentro da tolerância) no plano em vigor; senão, assinatura nova. */
export async function tipoDaProposta(ctx: ContextoProposta, hoje = hojeNaCidade()): Promise<"assinatura" | "upgrade"> {
  const s = ctx.assinatura;
  if (!s || ctx.anunciante.planoId !== s.planoId) return "assinatura";
  const { toleranciaVencimentoDias } = await obterRegrasCobranca();
  return situacaoCobranca({ venceEm: s.venceEm, hoje, toleranciaDias: toleranciaVencimentoDias }) === "vencida" ? "assinatura" : "upgrade";
}

export interface ValoresProposta {
  tipo: "assinatura" | "upgrade";
  plano: PlanoDaProposta;
  periodicidade: "mensal" | "anual";
  /** Pagamento de agora: a assinatura inteira ou a diferença proporcional do upgrade. */
  agora: { valorCentavos: number; descontoCentavos: number; cobradoCentavos: number };
  /** No upgrade, o próximo vencimento já no plano novo (com o desconto, quando a 1ª parcela sai nele). */
  proximo: { venceEm: DataISO; valorCentavos: number; descontoCentavos: number; cobradoCentavos: number } | null;
  /** Renovações pelo preço cheio, sem o desconto do representante. */
  renovacaoCentavos: number;
  /** Comissão da 1ª parcela, antes do desconto: o desconto vai até ela (pode zerar o pagamento, decisão T2 de 28/10/2026). */
  comissaoCentavos: number;
  descontoMaximoCentavos: number;
  /** Pagamento em que sai a 1ª parcela da comissão (e o desconto). */
  comissaoEm: "agora" | "proximo" | null;
}

/**
 * Valores da proposta pelas regras do domínio. O preço é o da proposta (travado
 * por 7 dias, decisão S4) ou, antes de criá-la, o do catálogo.
 */
export async function calcularProposta(
  ctx: ContextoProposta,
  escolha: { plano: PlanoDaProposta; periodicidade: "mensal" | "anual"; descontoCentavos: number; recebeComissao: boolean },
  hoje = hojeNaCidade(),
): Promise<Resultado<ValoresProposta>> {
  const tipo = await tipoDaProposta(ctx, hoje);
  const [regrasCobranca, abertura] = await Promise.all([obterRegrasCobranca(), obterAberturaAoPublico()]);
  const regras = { ...regrasCobranca, aberturaAoPublico: abertura };
  const { plano, descontoCentavos } = escolha;
  try {
    if (tipo === "assinatura") {
      const base = {
        plano,
        periodicidade: escolha.periodicidade,
        pagoEm: hoje,
        confirmadoEm: hoje,
        regras,
        assinatura: ctx.assinatura
          ? { ancora: ctx.assinatura.ancora, venceEm: ctx.assinatura.venceEm, pagamentosAnteriores: ctx.pagamentosValidos, algumAnual: ctx.algumAnual }
          : null,
        fundadorDesde: ctx.anunciante.fundadorDesde,
        representanteRecebeComissao: escolha.recebeComissao,
        carteira: null,
      };
      const primeiro = calcularPagamentoPlano(base);
      const comissao = primeiro.comissao?.valorCentavos ?? 0;
      const maximo = comissao;
      if (descontoCentavos > maximo) return falha("DADOS_INVALIDOS", descontoAcima(maximo));
      const renovacao = calcularPagamentoPlano({
        ...base,
        pagoEm: primeiro.periodo.venceEm,
        confirmadoEm: primeiro.periodo.venceEm,
        assinatura: {
          ancora: primeiro.periodo.ancora,
          venceEm: primeiro.periodo.venceEm,
          pagamentosAnteriores: primeiro.numero,
          algumAnual: ctx.algumAnual || escolha.periodicidade === "anual",
        },
        fundadorDesde: primeiro.fundador.fundadorDesde,
      });
      const valor = primeiro.cobranca.valorDevidoCentavos;
      return {
        ok: true,
        dados: {
          tipo,
          plano,
          periodicidade: escolha.periodicidade,
          agora: { valorCentavos: valor, descontoCentavos, cobradoCentavos: valor - descontoCentavos },
          proximo: null,
          renovacaoCentavos: renovacao.cobranca.valorDevidoCentavos,
          comissaoCentavos: comissao,
          descontoMaximoCentavos: maximo,
          comissaoEm: comissao > 0 ? "agora" : null,
        },
      };
    }

    // Upgrade: a diferença proporcional agora; a 1ª parcela sai quando o pagamento a cobre (decisão S7).
    const s = ctx.assinatura!;
    const atual = ctx.planos.find((p) => p.id === s.planoId);
    if (!atual) return falha("CONFLITO", "O plano atual deste anunciante não está mais no catálogo. Fale com a equipe.");
    if (plano.valorMensalCentavos <= atual.valorMensalCentavos) return falha("DADOS_INVALIDOS", "Escolha um plano maior que o atual.");
    const inicio = s.periodoInicio ?? s.ancora;
    const fundadorDesde = ctx.anunciante.fundadorDesde;
    const percentualFundador = fundadorDesde ? percentualFundadorNoAno(regras.escalaDescontoFundador, anoComoFundador(fundadorDesde, inicio)) : 0;
    const diferenca = diferencaParaComissao({
      mensalidadeNovaCentavos: plano.valorMensalCentavos,
      mensalidadeAtualCentavos: atual.valorMensalCentavos,
      maiorComissionadaCentavos: ctx.maiorComissionadaCentavos,
    });
    const faixa = (desconto: number) =>
      escolha.recebeComissao && diferenca > 0
        ? { id: "nova", diferencaMensalCentavos: diferenca, parcelasPagas: 0, concluida: false, descontoCentavos: desconto }
        : null;
    const agoraBruto = calcularPagamentoUpgrade({
      planoAtual: atual,
      planoNovo: plano,
      periodicidade: s.periodicidade,
      periodo: { inicio, venceEm: s.venceEm },
      pagoEm: hoje,
      confirmadoEm: hoje,
      percentualFundador,
      faixa: faixa(0),
      carteira: null,
    });
    const renovacaoDe = (desconto: number) =>
      calcularPagamentoPlano({
        plano,
        periodicidade: s.periodicidade,
        pagoEm: s.venceEm,
        confirmadoEm: s.venceEm,
        regras,
        assinatura: { ancora: s.ancora, venceEm: s.venceEm, pagamentosAnteriores: ctx.pagamentosValidos, algumAnual: ctx.algumAnual },
        fundadorDesde,
        representanteRecebeComissao: false,
        carteira: null,
        faixasUpgrade: agoraBruto.parcela?.comissao ? [] : [faixa(desconto)].filter((f) => f !== null),
      });
    const proximoBruto = renovacaoDe(0);
    const comissaoAgora = agoraBruto.parcela?.comissao?.valorCentavos ?? 0;
    const comissaoProximo = proximoBruto.parcelasUpgrade[0]?.comissao?.valorCentavos ?? 0;
    const comissaoEm = comissaoAgora > 0 ? "agora" : comissaoProximo > 0 ? "proximo" : null;
    const comissao = comissaoEm === "agora" ? comissaoAgora : comissaoProximo;
    const maximo = comissaoEm ? comissao : 0;
    if (descontoCentavos > maximo) return falha("DADOS_INVALIDOS", descontoAcima(maximo));
    const descontoAgora = comissaoEm === "agora" ? descontoCentavos : 0;
    const descontoProximo = comissaoEm === "proximo" ? descontoCentavos : 0;
    const proximoValor = proximoBruto.cobranca.valorDevidoCentavos;
    return {
      ok: true,
      dados: {
        tipo,
        plano,
        periodicidade: s.periodicidade,
        agora: { valorCentavos: agoraBruto.valorCentavos, descontoCentavos: descontoAgora, cobradoCentavos: agoraBruto.valorCentavos - descontoAgora },
        proximo: { venceEm: s.venceEm, valorCentavos: proximoValor, descontoCentavos: descontoProximo, cobradoCentavos: proximoValor - descontoProximo },
        renovacaoCentavos: proximoValor,
        comissaoCentavos: comissao,
        descontoMaximoCentavos: maximo,
        comissaoEm,
      },
    };
  } catch (e) {
    if (e instanceof RangeError) return falha("DADOS_INVALIDOS", e.message);
    throw e;
  }
}

const descontoAcima = (maximo: number) =>
  maximo > 0
    ? `O desconto vai até ${(maximo / 100).toFixed(2).replace(".", ",")} reais: a comissão do pagamento em que ele sai.`
    : "Esta proposta não tem comissão para dar desconto.";

/** Cria a proposta: o servidor confere o desconto pelas regras; o banco copia o preço e põe o e-mail na fila. */
export async function criarProposta(
  supabase: SupabaseClient,
  ctx: ContextoProposta,
  form: FormData,
  recebeComissao: boolean,
): Promise<Resultado<{ id: string }>> {
  const planoId = String(form.get("plano") ?? "");
  const plano = ctx.planos.find((p) => p.id === planoId);
  if (!plano) return falha("DADOS_INVALIDOS", "Escolha um plano pago.");
  const periodicidade = form.get("periodicidade") === "anual" ? "anual" : "mensal";
  const desconto = lerReais(form.get("desconto"));
  if (desconto === null) return falha("DADOS_INVALIDOS", "Desconto inválido: use reais e centavos, como 10,00.");
  const valores = await calcularProposta(ctx, { plano, periodicidade, descontoCentavos: desconto, recebeComissao });
  if (!valores.ok) return valores;
  const { data, error } = await supabase.rpc("criar_proposta", {
    p_anunciante: ctx.anunciante.id,
    p_plano: plano.id,
    p_periodicidade: valores.dados.periodicidade,
    p_desconto: desconto,
  });
  if (error) return mensagemDoBanco(error, "criarProposta");
  return { ok: true, dados: { id: data as string } };
}

/** "10,00" ou vazio (zero) vira centavos; null quando não é um valor. */
export function lerReais(valor: FormDataEntryValue | string | null): number | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (texto === "") return 0;
  if (!/^\d{1,6}(,\d{1,2})?$/.test(texto)) return null;
  return Math.round(Number(texto.replace(",", ".")) * 100);
}

// ---------------------------------------------------------------------------
// Leitura e respostas
// ---------------------------------------------------------------------------

export type SituacaoProposta = "aguardando_aceite" | "aceita" | "paga" | "recusada" | "cancelada";

export interface Proposta {
  id: string;
  tipo: "assinatura" | "upgrade";
  situacao: SituacaoProposta;
  periodicidade: "mensal" | "anual";
  anuncianteId: string;
  anunciante: string;
  anuncianteSlug: string;
  planoId: string;
  plano: string;
  valorMensalCentavos: number;
  mesesCobradosNoAnual: number;
  descontoCentavos: number;
  representanteId: string;
  representante: string;
  criadaEm: string;
  expiraEm: DataISO;
  aceitaEm: string | null;
  pagamentoId: string | null;
}

export const ROTULO_PROPOSTA: Record<SituacaoProposta | "vencida", string> = {
  aguardando_aceite: "Aguardando o anunciante",
  aceita: "Aceita, aguardando o pagamento",
  paga: "Paga",
  recusada: "Recusada",
  cancelada: "Cancelada",
  vencida: "Vencida",
};

/** Aceita ou aguardando, mas passou do prazo de 7 dias. */
export function situacaoVisivel(p: Proposta, hoje = hojeNaCidade()): SituacaoProposta | "vencida" {
  return (p.situacao === "aguardando_aceite" || p.situacao === "aceita") && hoje > p.expiraEm ? "vencida" : p.situacao;
}

export async function listarPropostas(
  supabase: SupabaseClient,
  filtro: { anuncianteId?: string; situacao?: SituacaoProposta } = {},
): Promise<Resultado<Proposta[]>> {
  const { data, error } = await supabase.rpc("propostas_visiveis", {
    p_anunciante: filtro.anuncianteId ?? null,
    p_situacao: filtro.situacao ?? null,
  });
  if (error) return mensagemDoBanco(error, "listarPropostas");
  return { ok: true, dados: data as Proposta[] };
}

export async function lerProposta(supabase: SupabaseClient, id: string): Promise<Resultado<Proposta>> {
  if (!UUID.test(id)) return falha("NAO_ENCONTRADO", "Proposta não encontrada.");
  const { data, error } = await supabase.from("propostas").select("anunciante_id").eq("id", id).maybeSingle();
  if (error) return mensagemDoBanco(error, "lerProposta");
  if (!data) return falha("NAO_ENCONTRADO", "Proposta não encontrada.");
  const lista = await listarPropostas(supabase, { anuncianteId: data.anunciante_id as string });
  if (!lista.ok) return lista;
  const proposta = lista.dados.find((p) => p.id === id);
  return proposta ? { ok: true, dados: proposta } : falha("NAO_ENCONTRADO", "Proposta não encontrada.");
}

/** O preço travado na proposta (decisão S4), no formato das contas. */
export function planoDaProposta(p: Proposta, nivel = 0): PlanoDaProposta {
  return { id: p.planoId, nome: p.plano, nivel, valorMensalCentavos: p.valorMensalCentavos, mesesCobradosNoAnual: p.mesesCobradosNoAnual };
}

export async function responderProposta(supabase: SupabaseClient, id: string, resposta: "aceitar" | "recusar" | "cancelar"): Promise<Resultado<null>> {
  if (!UUID.test(id)) return falha("NAO_ENCONTRADO", "Proposta não encontrada.");
  const funcao = resposta === "aceitar" ? "aceitar_proposta" : resposta === "recusar" ? "recusar_proposta" : "cancelar_proposta";
  const { error } = await supabase.rpc(funcao, { p_proposta: id });
  if (error) return mensagemDoBanco(error, `responderProposta: ${resposta}`);
  return { ok: true, dados: null };
}

/** Busca de anunciantes com conta para propor (nome e plano). */
export async function buscarAnunciantes(
  supabase: SupabaseClient,
  termo: string,
): Promise<Resultado<{ id: string; nome: string; tipo: "profissional" | "comercio"; plano: string | null }[]>> {
  if (termo.trim().length < 2) return { ok: true, dados: [] };
  const { data, error } = await supabase.rpc("anunciantes_para_proposta", { p_termo: termo.slice(0, 80) });
  if (error) return mensagemDoBanco(error, "buscarAnunciantes");
  return { ok: true, dados: data as { id: string; nome: string; tipo: "profissional" | "comercio"; plano: string | null }[] };
}
