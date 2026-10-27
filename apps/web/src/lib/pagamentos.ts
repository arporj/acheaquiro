// Pagamentos do plano na administração (item 4.15; decisões de 23 e 27/10/2026):
// a fila dos que aguardam pagamento, o registro (Pix ou cartão na maquininha,
// com o comprovante opcional), a lista do mês com o total de cada conta e a
// devolução do primeiro pagamento. Os valores saem de calcularPagamentoPlano
// (packages/domain, testada); o banco grava tudo numa transação
// (registrar_pagamento_plano, migration 20261027120000) e só aceita o
// administrador.
import {
  calcularPagamentoPlano,
  momentoLocal,
  podeDevolver,
  situacaoCobranca,
  somarDias,
  type PagamentoPlanoCalculado,
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
}

/** Situações em que o cadastro recebe pagamento (a função do banco confere de novo). */
export const SITUACOES_QUE_PAGAM: readonly Situacao[] = ["aguardando_pagamento", "publicado", "pausado", "escondido_por_vencimento"];

export async function lerContexto(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<ContextoPagamento>> {
  if (!UUID.test(anuncianteId)) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const [anun, assinatura, pagamentos] = await Promise.all([
    supabase
      .from("anunciantes")
      .select("id, nome, slug, tipo, status, cidade_id, plano_escolhido_id, periodicidade_escolhida, fundador_desde, representante_id")
      .eq("id", anuncianteId)
      .maybeSingle(),
    supabase.from("assinaturas").select("ancora, vence_em, plano_id, periodicidade, representante_id").eq("anunciante_id", anuncianteId).maybeSingle(),
    supabase.from("pagamentos").select("periodicidade").eq("anunciante_id", anuncianteId).is("devolvido_em", null),
  ]);
  if (anun.error) return mensagemDoBanco(anun.error, "lerContexto: anunciante");
  if (!anun.data) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  if (assinatura.error) return mensagemDoBanco(assinatura.error, "lerContexto: assinatura");
  if (pagamentos.error) return mensagemDoBanco(pagamentos.error, "lerContexto: pagamentos");
  const a = anun.data;

  const vendaId = (assinatura.data?.representante_id as string | null) ?? (a.representante_id as string | null);
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
    },
  };
}

/** Lê a primeira etapa (plano, periodicidade e dia), com os valores do cadastro quando faltam. */
export function lerEscolha(parametros: URLSearchParams | FormData, contexto: ContextoPagamento): { valores: Record<string, string>; escolha: Resultado<EscolhaPagamento> } {
  const valor = (nome: string) => {
    const v = parametros.get(nome);
    return typeof v === "string" ? v.slice(0, 40) : "";
  };
  const valores = {
    planoId: valor("plano") || contexto.assinatura?.planoId || contexto.anunciante.planoEscolhidoId || "",
    periodicidade: valor("periodicidade") || contexto.assinatura?.periodicidade || contexto.anunciante.periodicidadeEscolhida || "mensal",
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
  const plano = contexto.planos.find((p) => p.id === escolha.planoId);
  if (!plano) return falha("DADOS_INVALIDOS", "Escolha um plano pago deste tipo de anunciante.");
  if (escolha.pagoEm > hoje) return falha("DADOS_INVALIDOS", "O dia do pagamento não pode ser depois de hoje.");
  const [regras, abertura] = await Promise.all([obterRegrasCobranca(), obterAberturaAoPublico()]);
  try {
    const calculado = calcularPagamentoPlano({
      plano,
      historicoPlano: contexto.historicos[plano.id],
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
