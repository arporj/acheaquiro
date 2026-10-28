// Pagamentos do plano na administração (item 4.15; decisões de 23 e 27/10/2026):
// a fila dos que aguardam pagamento, o registro (Pix ou cartão na maquininha,
// com o comprovante opcional), a lista do mês com o total de cada conta e a
// devolução do primeiro pagamento. Os valores saem de calcularPagamentoPlano
// (packages/domain, testada); o banco grava tudo numa transação
// (registrar_pagamento_plano, migration 20261027120000) e só aceita o
// administrador.
import {
  anoComoFundador,
  calcularPagamentoPlano,
  calcularPagamentoUpgrade,
  diferencaParaComissao,
  momentoLocal,
  percentualFundadorNoAno,
  podeDevolver,
  situacaoCobranca,
  somarDias,
  type FaixaUpgrade,
  type PagamentoPlanoCalculado,
  type PagamentoUpgradeCalculado,
  type ParcelaDaFaixa,
  type PrecoVigente,
} from "@acheaqui/domain";
import type { Resultado } from "@acheaqui/types";
import {
  esquemaDevolucao,
  esquemaEscolhaPagamento,
  esquemaPagamento,
  mensagensPorCampo,
  type EscolhaPagamento,
  type FormaRecebimento,
} from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterAberturaAoPublico, obterRegrasCobranca } from "../dados/consultas";
import { limparPerfilDoCache, type Situacao } from "./anunciantesAdmin";
import { apagarComprovante, enderecoDoComprovante, guardarComprovante } from "./comprovantesGuardados";
import { lerProposta, planoDaProposta, type Proposta } from "./propostas";

type CodigoFalha = "DADOS_INVALIDOS" | "CONFLITO" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "ARQUIVO_INVALIDO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string; campos?: Record<string, string> } };
const falha = (codigo: CodigoFalha, mensagem: string, campos?: Record<string, string>): Falha => ({ ok: false, erro: { codigo, mensagem, campos } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Mensagem das travas do banco (P0001) pode ir para a tela; o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

export const hojeNaCidade = () => momentoLocal(new Date()).data;

// ---------------------------------------------------------------------------
// Fila: aprovados com plano pago escolhido e ainda sem pagamento
// ---------------------------------------------------------------------------

export interface Aguardando {
  id: string;
  nome: string;
  tipo: "profissional" | "comercio";
  status: Situacao;
  periodicidade: "mensal" | "anual" | null;
  plano: string;
  /** Comércio importado assumido: já está no ar, no Gratuito, até pagar o plano escolhido. */
  noGratuito: boolean;
}

export async function listarAguardando(supabase: SupabaseClient): Promise<Resultado<Aguardando[]>> {
  const { data, error } = await supabase
    .from("anunciantes")
    .select(
      "id, nome, tipo, status, plano_id, plano_escolhido_id, periodicidade_escolhida, " +
        "escolhido:planos!anunciantes_plano_escolhido_id_fkey!inner(nome, valor_mensal_centavos), assinaturas(anunciante_id)",
    )
    .in("status", ["aguardando_pagamento", "publicado", "pausado"])
    .gt("escolhido.valor_mensal_centavos", 0)
    .is("assinaturas", null)
    .order("nome");
  if (error) return mensagemDoBanco(error, "listarAguardando");
  type Linha = {
    id: string;
    nome: string;
    tipo: Aguardando["tipo"];
    status: Situacao;
    plano_id: string | null;
    plano_escolhido_id: string;
    periodicidade_escolhida: Aguardando["periodicidade"];
    escolhido: { nome: string };
  };
  return {
    ok: true,
    dados: (data as unknown as Linha[]).map((l) => ({
      id: l.id,
      nome: l.nome,
      tipo: l.tipo,
      status: l.status,
      periodicidade: l.periodicidade_escolhida,
      plano: l.escolhido.nome,
      noGratuito: l.plano_id !== null && l.plano_id !== l.plano_escolhido_id,
    })),
  };
}

// ---------------------------------------------------------------------------
// Em atraso: venceu e ainda está dentro da tolerância para pagar (card do painel)
// ---------------------------------------------------------------------------

export interface EmAtraso {
  anuncianteId: string;
  nome: string;
  tipo: "profissional" | "comercio";
  plano: string;
  periodicidade: "mensal" | "anual";
  venceEm: string;
  /** Último dia para pagar sem o plano sair. */
  pagarAte: string;
}

export async function listarEmAtraso(supabase: SupabaseClient): Promise<Resultado<EmAtraso[]>> {
  const hoje = hojeNaCidade();
  const { toleranciaVencimentoDias: tolerancia } = await obterRegrasCobranca();
  const { data, error } = await supabase
    .from("assinaturas")
    .select("anunciante_id, periodicidade, vence_em, anunciante:anunciantes(nome, tipo), plano:planos(nome)")
    .lt("vence_em", hoje)
    .gte("vence_em", somarDias(hoje, -tolerancia))
    .order("vence_em");
  if (error) return mensagemDoBanco(error, "listarEmAtraso");
  type Linha = { anunciante_id: string; periodicidade: EmAtraso["periodicidade"]; vence_em: string; anunciante: { nome: string; tipo: EmAtraso["tipo"] }; plano: { nome: string } };
  return {
    ok: true,
    dados: (data as unknown as Linha[])
      .filter((l) => situacaoCobranca({ venceEm: l.vence_em, hoje, toleranciaDias: tolerancia }) === "em_atraso")
      .map((l) => ({
        anuncianteId: l.anunciante_id,
        nome: l.anunciante.nome,
        tipo: l.anunciante.tipo,
        plano: l.plano.nome,
        periodicidade: l.periodicidade,
        venceEm: l.vence_em,
        pagarAte: somarDias(l.vence_em, tolerancia),
      })),
  };
}

// ---------------------------------------------------------------------------
// Cálculo do pagamento
// ---------------------------------------------------------------------------

export interface PlanoPago {
  id: string;
  nome: string;
  valorMensalCentavos: number;
  mesesCobradosNoAnual: number;
}

export interface ContextoPagamento {
  anunciante: {
    id: string;
    nome: string;
    slug: string;
    tipo: "profissional" | "comercio";
    status: Situacao;
    planoEscolhidoId: string | null;
    periodicidadeEscolhida: "mensal" | "anual" | null;
    fundadorDesde: string | null;
  };
  assinatura: { ancora: string; venceEm: string; planoId: string; periodicidade: "mensal" | "anual" } | null;
  pagamentosValidos: number;
  algumAnual: boolean;
  /**
   * Quem atendeu a venda do plano: o da assinatura ou, no primeiro pagamento, o
   * que trouxe o anunciante. Recebe as parcelas mesmo depois de sair (decisão O1).
   */
  representante: { id: string; codigo: string; recebeComissao: boolean } | null;
  /** Carteira do representante ativo que trouxe o anunciante, com o percentual das configurações (decisões N1 a N3). */
  carteira: { representanteId: string; codigo: string; percentual: number } | null;
  planos: PlanoPago[];
  /** Histórico de preços de cada plano: na renovação, o aumento só vale com 30 dias de aviso. */
  historicos: Record<string, PrecoVigente[]>;
  /** Plano da venda: as parcelas dela ficam no valor dele quando o plano muda (decisão S8). */
  planoVendidoId: string | null;
  /** Redução agendada para a próxima renovação (decisão S2). */
  planoSeguinteId: string | null;
  /** Upgrades vendidos com parcelas a pagar, na ordem da venda (decisão S7). */
  faixas: (FaixaUpgrade & { representanteId: string })[];
  /** Proposta de assinatura aceita que este pagamento quita: fixa plano, período, representante e desconto. */
  proposta: Proposta | null;
}

/** Situações em que o cadastro recebe pagamento (a função do banco confere de novo). */
export const SITUACOES_QUE_PAGAM: readonly Situacao[] = ["aguardando_pagamento", "publicado", "pausado", "escondido_por_vencimento"];

/**
 * Tudo o que o pagamento do plano precisa. Com propostaId, a proposta de
 * assinatura aceita define o plano (com o preço travado), o período, o
 * representante que recebe a comissão e o desconto.
 */
export async function lerContexto(supabase: SupabaseClient, anuncianteId: string, propostaId?: string | null): Promise<Resultado<ContextoPagamento>> {
  if (!UUID.test(anuncianteId)) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const [anun, assinatura, pagamentos, upgrades] = await Promise.all([
    supabase
      .from("anunciantes")
      .select("id, nome, slug, tipo, status, cidade_id, plano_escolhido_id, periodicidade_escolhida, fundador_desde, representante_id")
      .eq("id", anuncianteId)
      .maybeSingle(),
    supabase
      .from("assinaturas")
      .select("ancora, vence_em, plano_id, periodicidade, representante_id, plano_vendido_id, plano_seguinte_id")
      .eq("anunciante_id", anuncianteId)
      .maybeSingle(),
    supabase.from("pagamentos").select("periodicidade").eq("anunciante_id", anuncianteId).eq("tipo", "plano").is("devolvido_em", null),
    supabase
      .from("upgrades")
      .select("id, representante_id, diferenca_mensal_centavos, parcelas_pagas, concluida, desconto_centavos")
      .eq("anunciante_id", anuncianteId)
      .is("cancelado_em", null)
      .eq("concluida", false)
      .order("criado_em"),
  ]);
  if (anun.error) return mensagemDoBanco(anun.error, "lerContexto: anunciante");
  if (!anun.data) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  if (assinatura.error) return mensagemDoBanco(assinatura.error, "lerContexto: assinatura");
  if (pagamentos.error) return mensagemDoBanco(pagamentos.error, "lerContexto: pagamentos");
  if (upgrades.error) return mensagemDoBanco(upgrades.error, "lerContexto: upgrades");
  const a = anun.data;

  let proposta: Proposta | null = null;
  if (propostaId) {
    const lida = await lerProposta(supabase, propostaId);
    if (!lida.ok) return lida;
    if (lida.dados.anuncianteId !== a.id) return falha("NAO_ENCONTRADO", "Proposta não encontrada.");
    proposta = lida.dados;
  }

  const vendaId = proposta?.representanteId ?? (assinatura.data?.representante_id as string | null) ?? (a.representante_id as string | null);
  const ids = [vendaId, a.representante_id as string | null].filter((x): x is string => !!x);
  const [reps, planos, config] = await Promise.all([
    ids.length > 0
      ? supabase.from("representantes").select("id, codigo, recebe_comissao, ativo").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; codigo: string; recebe_comissao: boolean; ativo: boolean }[], error: null }),
    supabase
      .from("planos")
      .select("id, nome, valor_mensal_centavos, meses_cobrados_no_anual")
      .eq("cidade_id", a.cidade_id)
      .eq("tipo", a.tipo)
      .eq("ativo", true)
      .gt("valor_mensal_centavos", 0)
      .order("nivel"),
    supabase.from("configuracoes").select("valor").eq("cidade_id", a.cidade_id).eq("chave", "percentual_carteira").maybeSingle(),
  ]);
  if (reps.error) return mensagemDoBanco(reps.error, "lerContexto: representantes");
  if (planos.error) return mensagemDoBanco(planos.error, "lerContexto: planos");
  if (config.error) return mensagemDoBanco(config.error, "lerContexto: percentual da carteira");
  const historico = await supabase
    .from("historico_precos")
    .select("plano_id, valor_mensal_centavos, meses_cobrados_no_anual, vigente_desde")
    .in("plano_id", planos.data.map((p) => p.id))
    .order("alterado_em");
  if (historico.error) return mensagemDoBanco(historico.error, "lerContexto: histórico de preços");
  const historicos: Record<string, PrecoVigente[]> = {};
  for (const h of historico.data) {
    (historicos[h.plano_id as string] ??= []).push({
      valorMensalCentavos: h.valor_mensal_centavos,
      mesesCobradosNoAnual: h.meses_cobrados_no_anual,
      vigenteDesde: h.vigente_desde,
    });
  }
  const venda = reps.data.find((r) => r.id === vendaId);
  const dono = reps.data.find((r) => r.id === a.representante_id);
  const percentualCarteira = Number(config.data?.valor ?? 0);

  return {
    ok: true,
    dados: {
      anunciante: {
        id: a.id,
        nome: a.nome,
        slug: a.slug,
        tipo: a.tipo,
        status: a.status,
        planoEscolhidoId: a.plano_escolhido_id,
        periodicidadeEscolhida: a.periodicidade_escolhida,
        fundadorDesde: a.fundador_desde,
      },
      assinatura: assinatura.data
        ? { ancora: assinatura.data.ancora, venceEm: assinatura.data.vence_em, planoId: assinatura.data.plano_id, periodicidade: assinatura.data.periodicidade }
        : null,
      pagamentosValidos: pagamentos.data.length,
      algumAnual: pagamentos.data.some((p) => p.periodicidade === "anual"),
      representante: venda ? { id: venda.id, codigo: venda.codigo, recebeComissao: venda.recebe_comissao } : null,
      carteira:
        dono && dono.ativo && dono.recebe_comissao && percentualCarteira > 0
          ? { representanteId: dono.id, codigo: dono.codigo, percentual: percentualCarteira }
          : null,
      planos: planos.data.map((p) => ({ id: p.id, nome: p.nome, valorMensalCentavos: p.valor_mensal_centavos, mesesCobradosNoAnual: p.meses_cobrados_no_anual })),
      historicos,
      planoVendidoId: (assinatura.data?.plano_vendido_id as string | null) ?? null,
      planoSeguinteId: (assinatura.data?.plano_seguinte_id as string | null) ?? null,
      faixas: upgrades.data.map((u) => ({
        id: u.id,
        representanteId: u.representante_id,
        diferencaMensalCentavos: u.diferenca_mensal_centavos,
        parcelasPagas: u.parcelas_pagas,
        concluida: u.concluida,
        descontoCentavos: u.desconto_centavos,
      })),
      proposta,
    },
  };
}

/** Lê a primeira etapa (plano, periodicidade e dia), com os valores do cadastro quando faltam. */
export function lerEscolha(parametros: URLSearchParams | FormData, contexto: ContextoPagamento): { valores: Record<string, string>; escolha: Resultado<EscolhaPagamento> } {
  const valor = (nome: string) => {
    const v = parametros.get(nome);
    return typeof v === "string" ? v.slice(0, 40) : "";
  };
  // A proposta aceita fixa o plano e o período; sem ela, vale a redução agendada para a renovação.
  const p = contexto.proposta;
  const valores = {
    planoId: p?.planoId || valor("plano") || contexto.planoSeguinteId || contexto.assinatura?.planoId || contexto.anunciante.planoEscolhidoId || "",
    periodicidade: p?.periodicidade || valor("periodicidade") || contexto.assinatura?.periodicidade || contexto.anunciante.periodicidadeEscolhida || "mensal",
    pagoEm: valor("pago_em") || hojeNaCidade(),
  };
  const r = esquemaEscolhaPagamento.safeParse(valores);
  return { valores, escolha: r.success ? { ok: true, dados: r.data } : falha("DADOS_INVALIDOS", r.error.issues[0]!.message, mensagensPorCampo(r.error)) };
}

export interface Calculado extends PagamentoPlanoCalculado {
  plano: PlanoPago;
}

/** O que o pagamento grava, pelas regras de packages/domain. */
export async function calcular(contexto: ContextoPagamento, escolha: EscolhaPagamento, hoje = hojeNaCidade()): Promise<Resultado<Calculado>> {
  if (!SITUACOES_QUE_PAGAM.includes(contexto.anunciante.status)) {
    return falha("CONFLITO", "O cadastro precisa estar aprovado para receber pagamento.");
  }
  const proposta = contexto.proposta;
  if (proposta) {
    if (proposta.tipo !== "assinatura") return falha("CONFLITO", "Esta proposta é de mudança de plano: registre pela tela de mudança de plano.");
    if (proposta.situacao !== "aceita") return falha("CONFLITO", "A proposta precisa estar aceita pelo anunciante.");
    if (hoje > proposta.expiraEm) return falha("CONFLITO", "A proposta venceu: o representante precisa fazer outra.");
    if (proposta.planoId !== escolha.planoId || proposta.periodicidade !== escolha.periodicidade) {
      return falha("DADOS_INVALIDOS", "O plano e o período são os da proposta aceita.");
    }
  }
  const catalogo = contexto.planos.find((p) => p.id === escolha.planoId);
  // Com a proposta, vale o preço travado nela (decisão S4).
  const plano = proposta && catalogo ? { ...planoDaProposta(proposta), nome: catalogo.nome } : catalogo;
  if (!plano) return falha("DADOS_INVALIDOS", "Escolha um plano pago deste tipo de anunciante.");
  if (escolha.pagoEm > hoje) return falha("DADOS_INVALIDOS", "O dia do pagamento não pode ser depois de hoje.");
  const vendido = contexto.planoVendidoId && contexto.planoVendidoId !== plano.id ? contexto.planos.find((p) => p.id === contexto.planoVendidoId) : null;
  const [regras, abertura] = await Promise.all([obterRegrasCobranca(), obterAberturaAoPublico()]);
  try {
    const calculado = calcularPagamentoPlano({
      plano,
      historicoPlano: proposta ? undefined : contexto.historicos[plano.id],
      planoVendido: vendido ?? null,
      faixasUpgrade: contexto.faixas,
      descontoVendaCentavos: proposta?.descontoCentavos ?? 0,
      periodicidade: escolha.periodicidade,
      pagoEm: escolha.pagoEm,
      confirmadoEm: hoje,
      regras: { ...regras, aberturaAoPublico: abertura },
      assinatura: contexto.assinatura
        ? { ...contexto.assinatura, pagamentosAnteriores: contexto.pagamentosValidos, algumAnual: contexto.algumAnual }
        : null,
      fundadorDesde: contexto.anunciante.fundadorDesde,
      representanteRecebeComissao: contexto.representante?.recebeComissao ?? false,
      carteira: contexto.carteira ? { percentual: contexto.carteira.percentual } : null,
    });
    return { ok: true, dados: { ...calculado, plano } };
  } catch (e) {
    if (e instanceof RangeError) return falha("DADOS_INVALIDOS", e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

/** Parcelas que mudam a faixa (pagas ou concluídas), no formato de registrar_pagamento_plano; o banco confere as parcelas de antes. */
function parcelasParaGravar(faixas: ContextoPagamento["faixas"], parcelas: readonly ParcelaDaFaixa[]) {
  return parcelas.flatMap((p) => {
    const faixa = faixas.find((f) => f.id === p.faixaId)!;
    if (p.parcelasPagasDepois === faixa.parcelasPagas && p.concluida === faixa.concluida && !p.comissao) return [];
    return [
      {
        faixa: p.faixaId,
        parcelasAntes: faixa.parcelasPagas,
        parcelasPagasDepois: p.parcelasPagasDepois,
        concluida: p.concluida,
        desconto: p.descontoCentavos,
        base: p.comissao?.baseCentavos ?? null,
        percentual: p.comissao?.percentual ?? null,
        valor: p.comissao?.valorCentavos ?? null,
      },
    ];
  });
}

export async function registrarPagamento(
  supabase: SupabaseClient,
  contexto: ContextoPagamento,
  form: FormData,
  comprovante: Uint8Array | null,
  origemDoSite: string,
): Promise<Resultado<{ id: string }>> {
  const campo = (nome: string) => {
    const v = form.get(nome);
    return typeof v === "string" ? v.slice(0, 400) : undefined;
  };
  const lido = esquemaPagamento.safeParse({
    planoId: campo("plano"),
    periodicidade: campo("periodicidade"),
    pagoEm: campo("pago_em"),
    forma: campo("forma"),
    parcelas: campo("parcelas") || "1",
    codigoAutorizacao: campo("codigo_autorizacao"),
    observacao: campo("observacao"),
  });
  if (!lido.success) return falha("DADOS_INVALIDOS", lido.error.issues[0]!.message, mensagensPorCampo(lido.error));
  const dados = lido.data;
  const calculado = await calcular(contexto, dados);
  if (!calculado.ok) return calculado;
  const c = calculado.dados;

  let caminho = "";
  if (comprovante && comprovante.length > 0) {
    const guardado = await guardarComprovante(supabase, contexto.anunciante.id, comprovante);
    if (!guardado.ok) return guardado;
    caminho = guardado.dados;
  }

  const { data, error } = await supabase.rpc("registrar_pagamento_plano", {
    p_anunciante: contexto.anunciante.id,
    p_plano: c.plano.id,
    p_periodicidade: dados.periodicidade,
    p_numero: c.numero,
    p_vence_anterior: contexto.assinatura?.venceEm ?? null,
    p_ancora: c.periodo.ancora,
    p_periodo_inicio: c.periodo.inicio,
    p_vence_em: c.periodo.venceEm,
    p_valor_cheio: c.cobranca.valorCheioCentavos,
    p_desconto_fundador: c.cobranca.descontoFundadorCentavos,
    p_forma: dados.forma,
    p_parcelas: dados.parcelas,
    p_codigo_autorizacao: dados.codigoAutorizacao,
    p_pago_em: dados.pagoEm,
    p_confirmado_em: hojeNaCidade(),
    p_comprovante: caminho,
    p_observacao: dados.observacao,
    p_representante: contexto.representante?.id ?? null,
    p_fundador_desde: c.fundador.fundadorDesde,
    p_tornou_fundador: c.fundador.tornou,
    p_comissao_base: c.comissao?.baseCentavos ?? null,
    p_comissao_percentual: c.comissao?.percentual ?? null,
    p_comissao_valor: c.comissao?.valorCentavos ?? null,
    p_comissao_libera_em: c.comissaoLiberaEm,
    p_carteira_representante: c.comissaoCarteira ? contexto.carteira!.representanteId : null,
    p_carteira_base: c.comissaoCarteira?.baseCentavos ?? null,
    p_carteira_percentual: c.comissaoCarteira?.percentual ?? null,
    p_carteira_valor: c.comissaoCarteira?.valorCentavos ?? null,
    p_proposta: contexto.proposta?.id ?? null,
    p_desconto_representante: c.descontoRepresentanteCentavos,
    p_parcelas_upgrade: parcelasParaGravar(contexto.faixas, c.parcelasUpgrade),
  });
  if (error) {
    if (caminho) await apagarComprovante(supabase, caminho);
    return mensagemDoBanco(error, "registrarPagamento");
  }
  await limparPerfilDoCache(origemDoSite, contexto.anunciante.slug);
  return { ok: true, dados: { id: data as string } };
}

// ---------------------------------------------------------------------------
// Lista do mês e detalhe
// ---------------------------------------------------------------------------

export const ROTULO_FORMA: Record<FormaRecebimento, string> = { pix: "Pix", debito: "Débito", credito: "Crédito" };

export interface PagamentoLista {
  id: string;
  anuncianteId: string;
  anunciante: string;
  plano: string;
  periodicidade: "mensal" | "anual";
  numero: number;
  valorCentavos: number;
  forma: FormaRecebimento;
  parcelas: number;
  conta: string;
  pagoEm: string;
  devolvido: boolean;
  /** Devolvido por contestação no cartão (o dinheiro voltou pelo banco do anunciante). */
  contestado: boolean;
}

const COLUNAS_LISTA =
  "id, anunciante_id, periodicidade, numero, valor_centavos, forma, parcelas, pago_em, devolvido_em, tipo_devolucao, " +
  "anunciante:anunciantes(nome), plano:planos(nome), conta:contas_recebimento(nome)";

type LinhaLista = {
  id: string;
  anunciante_id: string;
  periodicidade: "mensal" | "anual";
  numero: number;
  valor_centavos: number;
  forma: FormaRecebimento;
  parcelas: number;
  pago_em: string;
  devolvido_em: string | null;
  tipo_devolucao: "devolucao" | "contestacao" | null;
  anunciante: { nome: string };
  plano: { nome: string };
  conta: { nome: string };
};

const paraLista = (l: LinhaLista): PagamentoLista => ({
  id: l.id,
  anuncianteId: l.anunciante_id,
  anunciante: l.anunciante.nome,
  plano: l.plano.nome,
  periodicidade: l.periodicidade,
  numero: l.numero,
  valorCentavos: l.valor_centavos,
  forma: l.forma,
  parcelas: l.parcelas,
  conta: l.conta.nome,
  pagoEm: l.pago_em,
  devolvido: l.devolvido_em !== null,
  contestado: l.tipo_devolucao === "contestacao",
});

/** "AAAA-MM" do mês pedido; o mês atual se vier vazio ou inválido. */
export function lerMes(valor: string | null): string {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : hojeNaCidade().slice(0, 7);
}

/** Pagamentos do mês, pelo dia em que foram pagos, e o total de cada conta (sem os devolvidos), para conferir com o extrato. */
export async function listarDoMes(supabase: SupabaseClient, mes: string): Promise<Resultado<{ pagamentos: PagamentoLista[]; totais: { conta: string; centavos: number }[] }>> {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  const fim = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("pagamentos")
    .select(COLUNAS_LISTA)
    .gte("pago_em", `${mes}-01`)
    .lte("pago_em", fim)
    .order("pago_em", { ascending: false })
    .order("registrado_em", { ascending: false });
  if (error) return mensagemDoBanco(error, "listarDoMes");
  const pagamentos = (data as unknown as LinhaLista[]).map(paraLista);
  const totais = new Map<string, number>();
  for (const p of pagamentos) if (!p.devolvido) totais.set(p.conta, (totais.get(p.conta) ?? 0) + p.valorCentavos);
  return { ok: true, dados: { pagamentos, totais: [...totais].map(([conta, centavos]) => ({ conta, centavos })) } };
}

export async function listarDoAnunciante(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<PagamentoLista[]>> {
  const { data, error } = await supabase.from("pagamentos").select(COLUNAS_LISTA).eq("anunciante_id", anuncianteId).order("registrado_em", { ascending: false });
  if (error) return mensagemDoBanco(error, "listarDoAnunciante");
  return { ok: true, dados: (data as unknown as LinhaLista[]).map(paraLista) };
}

export interface PagamentoDetalhe extends PagamentoLista {
  anuncianteSlug: string;
  periodoInicio: string;
  venceEm: string;
  valorCheioCentavos: number;
  descontoFundadorCentavos: number;
  codigoAutorizacao: string | null;
  confirmadoEm: string;
  observacao: string;
  tornouFundador: boolean;
  devolvidoEm: string | null;
  motivoDevolucao: string | null;
  /** Endereço temporário (5 minutos) do comprovante, só para a administração. */
  comprovante: string | null;
  comissao: { representante: string; origem: string; valorCentavos: number; liberaEm: string; cancelada: boolean } | null;
  podeDevolver: boolean;
  /** Pagamento no cartão ainda não devolvido: o banco do anunciante pode estornar (contestação). */
  podeContestar: boolean;
}

export async function lerPagamento(supabase: SupabaseClient, id: string): Promise<Resultado<PagamentoDetalhe>> {
  if (!UUID.test(id)) return falha("NAO_ENCONTRADO", "Pagamento não encontrado.");
  const { data, error } = await supabase
    .from("pagamentos")
    .select(
      `${COLUNAS_LISTA}, periodo_inicio, vence_em, valor_cheio_centavos, desconto_fundador_centavos, codigo_autorizacao, confirmado_em, ` +
        "observacao, tornou_fundador, motivo_devolucao, comprovante_caminho, slug:anunciantes(slug), " +
        "comissoes(origem, valor_centavos, libera_em, cancelada_em, representante:representantes(codigo))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return mensagemDoBanco(error, "lerPagamento");
  if (!data) return falha("NAO_ENCONTRADO", "Pagamento não encontrado.");
  const l = data as unknown as LinhaLista & {
    periodo_inicio: string;
    vence_em: string;
    valor_cheio_centavos: number;
    desconto_fundador_centavos: number;
    codigo_autorizacao: string | null;
    confirmado_em: string;
    observacao: string;
    tornou_fundador: boolean;
    motivo_devolucao: string | null;
    comprovante_caminho: string | null;
    slug: { slug: string };
    comissoes: { origem: string; valor_centavos: number; libera_em: string; cancelada_em: string | null; representante: { codigo: string } }[];
  };
  const comprovante = await enderecoDoComprovante(supabase, l.comprovante_caminho);
  const comissao = l.comissoes[0];
  return {
    ok: true,
    dados: {
      ...paraLista(l),
      anuncianteSlug: l.slug.slug,
      periodoInicio: l.periodo_inicio,
      venceEm: l.vence_em,
      valorCheioCentavos: l.valor_cheio_centavos,
      descontoFundadorCentavos: l.desconto_fundador_centavos,
      codigoAutorizacao: l.codigo_autorizacao,
      confirmadoEm: l.confirmado_em,
      observacao: l.observacao,
      tornouFundador: l.tornou_fundador,
      devolvidoEm: l.devolvido_em,
      motivoDevolucao: l.motivo_devolucao,
      comprovante,
      comissao: comissao
        ? { representante: comissao.representante.codigo, origem: comissao.origem, valorCentavos: comissao.valor_centavos, liberaEm: comissao.libera_em, cancelada: comissao.cancelada_em !== null }
        : null,
      podeDevolver: !l.devolvido_em && podeDevolver({ numero: l.numero, pagoEm: l.pago_em, hoje: hojeNaCidade() }),
      podeContestar: !l.devolvido_em && l.forma !== "pix",
    },
  };
}

/** Devolução do primeiro pagamento, em até 7 dias (decisão 11). */
export async function devolver(supabase: SupabaseClient, pagamento: PagamentoDetalhe, form: FormData, origemDoSite: string): Promise<Resultado<null>> {
  const lido = esquemaDevolucao.safeParse({ motivo: typeof form.get("motivo") === "string" ? String(form.get("motivo")).slice(0, 400) : undefined });
  if (!lido.success) return falha("DADOS_INVALIDOS", lido.error.issues[0]!.message);
  if (!pagamento.podeDevolver) return falha("CONFLITO", "Só o primeiro pagamento pode ser devolvido, em até 7 dias depois dele.");
  const { error } = await supabase.rpc("registrar_devolucao", { p_pagamento: pagamento.id, p_motivo: lido.data.motivo });
  if (error) return mensagemDoBanco(error, "devolver");
  await limparPerfilDoCache(origemDoSite, pagamento.anuncianteSlug);
  return { ok: true, dados: null };
}

/**
 * Contestação no cartão (decisão P1): o plano sai como na devolução, a comissão
 * ainda não paga é cancelada e a já paga vira um desconto no próximo pagamento
 * ao representante (registrar_contestacao).
 */
export async function contestar(supabase: SupabaseClient, pagamento: PagamentoDetalhe, form: FormData, origemDoSite: string): Promise<Resultado<null>> {
  const lido = esquemaDevolucao.safeParse({ motivo: typeof form.get("motivo") === "string" ? String(form.get("motivo")).slice(0, 400) : undefined });
  if (!lido.success) return falha("DADOS_INVALIDOS", lido.error.issues[0]!.message);
  if (!pagamento.podeContestar) return falha("CONFLITO", "Só pagamento no cartão, ainda não devolvido, tem contestação.");
  const { error } = await supabase.rpc("registrar_contestacao", { p_pagamento: pagamento.id, p_motivo: lido.data.motivo });
  if (error) return mensagemDoBanco(error, "contestar");
  await limparPerfilDoCache(origemDoSite, pagamento.anuncianteSlug);
  return { ok: true, dados: null };
}

// ---------------------------------------------------------------------------
// Mudança para um plano maior no meio do período (plano 3B.1)
// ---------------------------------------------------------------------------

export interface UpgradeCalculado extends PagamentoUpgradeCalculado {
  planoAtual: PlanoPago;
  planoNovo: PlanoPago;
  periodicidade: "mensal" | "anual";
  periodo: { inicio: string; venceEm: string };
  /** Faixa nova do representante da proposta; null sem comissão de venda (sem proposta, sócio ou plano já comissionado). */
  faixa: { representanteId: string; codigo: string; diferencaMensalCentavos: number; descontoCentavos: number } | null;
}

/**
 * O pagamento do upgrade (calcularPagamentoUpgrade): a diferença proporcional
 * até o vencimento, que não muda. Com a proposta aceita, o preço é o travado
 * nela e o representante ganha a faixa da comissão (decisões S4, S7 e S8).
 */
export async function calcularUpgrade(
  contexto: ContextoPagamento,
  extra: { periodoInicio: string | null; maiorComissionadaCentavos: number },
  escolha: { planoId: string; pagoEm: string },
  hoje = hojeNaCidade(),
): Promise<Resultado<UpgradeCalculado>> {
  const s = contexto.assinatura;
  if (!s || !["publicado", "pausado"].includes(contexto.anunciante.status)) {
    return falha("CONFLITO", "O anunciante precisa estar no ar, com o plano pago em dia, para mudar de plano.");
  }
  const proposta = contexto.proposta;
  if (proposta) {
    if (proposta.tipo !== "upgrade") return falha("CONFLITO", "Esta proposta é de assinatura: registre pela tela de pagamento do plano.");
    if (proposta.situacao !== "aceita") return falha("CONFLITO", "A proposta precisa estar aceita pelo anunciante.");
    if (hoje > proposta.expiraEm) return falha("CONFLITO", "A proposta venceu: o representante precisa fazer outra.");
  }
  const planoId = proposta?.planoId ?? escolha.planoId;
  const atual = contexto.planos.find((p) => p.id === s.planoId);
  const catalogo = contexto.planos.find((p) => p.id === planoId);
  if (!atual || !catalogo) return falha("DADOS_INVALIDOS", "Escolha um plano pago deste tipo de anunciante.");
  const novo = proposta ? { ...planoDaProposta(proposta), nome: catalogo.nome } : catalogo;
  if (novo.valorMensalCentavos <= atual.valorMensalCentavos) {
    return falha("DADOS_INVALIDOS", "O plano novo precisa ser maior que o atual. Para um menor, agende a redução.");
  }
  if (escolha.pagoEm > hoje) return falha("DADOS_INVALIDOS", "O dia do pagamento não pode ser depois de hoje.");
  if (escolha.pagoEm >= s.venceEm) return falha("DADOS_INVALIDOS", "No dia do vencimento ou depois, registre a renovação já no plano novo.");

  const regras = await obterRegrasCobranca();
  const inicio = extra.periodoInicio ?? s.ancora;
  const fundadorDesde = contexto.anunciante.fundadorDesde;
  const rep = proposta ? contexto.representante : null;
  const diferenca = rep?.recebeComissao
    ? diferencaParaComissao({
        mensalidadeNovaCentavos: novo.valorMensalCentavos,
        mensalidadeAtualCentavos: atual.valorMensalCentavos,
        maiorComissionadaCentavos: extra.maiorComissionadaCentavos,
      })
    : 0;
  const faixa =
    rep && diferenca > 0
      ? { representanteId: rep.id, codigo: rep.codigo, diferencaMensalCentavos: diferenca, descontoCentavos: proposta!.descontoCentavos }
      : null;
  try {
    const calculado = calcularPagamentoUpgrade({
      planoAtual: atual,
      planoNovo: novo,
      periodicidade: s.periodicidade,
      periodo: { inicio, venceEm: s.venceEm },
      pagoEm: escolha.pagoEm,
      confirmadoEm: hoje,
      percentualFundador: fundadorDesde ? percentualFundadorNoAno(regras.escalaDescontoFundador, anoComoFundador(fundadorDesde, inicio)) : 0,
      faixa: faixa ? { id: "nova", diferencaMensalCentavos: diferenca, parcelasPagas: 0, concluida: false, descontoCentavos: faixa.descontoCentavos } : null,
      carteira: contexto.carteira ? { percentual: contexto.carteira.percentual } : null,
    });
    if (calculado.valorCobradoCentavos <= 0) return falha("DADOS_INVALIDOS", "O desconto não pode zerar o pagamento.");
    return {
      ok: true,
      dados: { ...calculado, planoAtual: atual, planoNovo: novo, periodicidade: s.periodicidade, periodo: { inicio, venceEm: s.venceEm }, faixa },
    };
  } catch (e) {
    if (e instanceof RangeError) return falha("DADOS_INVALIDOS", e.message);
    throw e;
  }
}

export async function registrarUpgrade(
  supabase: SupabaseClient,
  contexto: ContextoPagamento,
  extra: { periodoInicio: string | null; maiorComissionadaCentavos: number },
  form: FormData,
  comprovante: Uint8Array | null,
  origemDoSite: string,
): Promise<Resultado<{ id: string }>> {
  const campo = (nome: string) => {
    const v = form.get(nome);
    return typeof v === "string" ? v.slice(0, 400) : undefined;
  };
  const lido = esquemaPagamento.safeParse({
    planoId: campo("plano"),
    periodicidade: contexto.assinatura?.periodicidade,
    pagoEm: campo("pago_em"),
    forma: campo("forma"),
    parcelas: campo("parcelas") || "1",
    codigoAutorizacao: campo("codigo_autorizacao"),
    observacao: campo("observacao"),
  });
  if (!lido.success) return falha("DADOS_INVALIDOS", lido.error.issues[0]!.message, mensagensPorCampo(lido.error));
  const dados = lido.data;
  const calculado = await calcularUpgrade(contexto, extra, { planoId: dados.planoId, pagoEm: dados.pagoEm });
  if (!calculado.ok) return calculado;
  const c = calculado.dados;

  let caminho = "";
  if (comprovante && comprovante.length > 0) {
    const guardado = await guardarComprovante(supabase, contexto.anunciante.id, comprovante);
    if (!guardado.ok) return guardado;
    caminho = guardado.dados;
  }
  const parcela = c.parcela;
  const { data, error } = await supabase.rpc("registrar_pagamento_upgrade", {
    p_anunciante: contexto.anunciante.id,
    p_plano: c.planoNovo.id,
    p_proposta: contexto.proposta?.id ?? null,
    p_vence_atual: c.periodo.venceEm,
    p_valor: c.valorCentavos,
    p_desconto_representante: c.descontoRepresentanteCentavos,
    p_forma: dados.forma,
    p_parcelas: dados.parcelas,
    p_codigo_autorizacao: dados.codigoAutorizacao,
    p_pago_em: dados.pagoEm,
    p_confirmado_em: hojeNaCidade(),
    p_comprovante: caminho,
    p_observacao: dados.observacao,
    p_faixa: c.faixa
      ? {
          representante: c.faixa.representanteId,
          diferenca: c.faixa.diferencaMensalCentavos,
          desconto: c.faixa.descontoCentavos,
          parcelasPagasDepois: parcela?.parcelasPagasDepois ?? 0,
          concluida: parcela?.concluida ?? false,
          base: parcela?.comissao?.baseCentavos ?? null,
          percentual: parcela?.comissao?.percentual ?? null,
          valor: parcela?.comissao?.valorCentavos ?? null,
        }
      : null,
    p_libera_em: c.comissaoLiberaEm,
    p_carteira_representante: c.comissaoCarteira ? contexto.carteira!.representanteId : null,
    p_carteira_base: c.comissaoCarteira?.baseCentavos ?? null,
    p_carteira_percentual: c.comissaoCarteira?.percentual ?? null,
    p_carteira_valor: c.comissaoCarteira?.valorCentavos ?? null,
  });
  if (error) {
    if (caminho) await apagarComprovante(supabase, caminho);
    return mensagemDoBanco(error, "registrarUpgrade");
  }
  await limparPerfilDoCache(origemDoSite, contexto.anunciante.slug);
  return { ok: true, dados: { id: data as string } };
}

/** Agenda (ou desfaz, com planoId vazio) a redução para o próximo vencimento (decisão S2). */
export async function agendarReducao(supabase: SupabaseClient, anuncianteId: string, planoId: string): Promise<Resultado<null>> {
  if (!UUID.test(anuncianteId) || (planoId !== "" && !UUID.test(planoId))) return falha("DADOS_INVALIDOS", "Escolha um plano.");
  const { error } = await supabase.rpc("agendar_reducao", { p_anunciante: anuncianteId, p_plano: planoId || null });
  if (error) return mensagemDoBanco(error, "agendarReducao");
  return { ok: true, dados: null };
}
