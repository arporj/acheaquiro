// Pagamento de extras e do evento avulso na administração (decisões B3, P1 a
// P4 e E1 a E3 de 17/11/2026): o extra mensal (ou anual) com vencimento
// próprio, a renovação, e o evento avulso pago por bloco de 7 dias. Os
// valores saem de calcularPagamentoExtra e calcularPagamentoEvento
// (packages/domain, testadas); o banco grava numa transação
// (registrar_pagamento_extra e registrar_pagamento_evento, migration
// 20261117233134) e só aceita o administrador.
import {
  calcularPagamentoEvento,
  calcularPagamentoExtra,
  impedimentoParaContratarExtra,
  prazoParaDesistirDoEvento,
  somarDias,
  type CobrancaExtra,
  type PagamentoEventoCalculado,
  type PagamentoExtraCalculado,
  type PrecoVigente,
} from "@acheaqui/domain";
import type { Resultado } from "@acheaqui/types";
import { esquemaPagamentoEvento, esquemaPagamentoExtra, mensagensPorCampo, type DadosPagamentoEvento, type DadosPagamentoExtra } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterAberturaAoPublico, obterRegrasCobranca } from "../dados/consultas";
import { limparPerfilDoCache, type Situacao } from "./anunciantesAdmin";
import { limparCacheDoSite } from "./arquivos";
import { apagarComprovante, guardarComprovante } from "./comprovantesGuardados";
import { hojeNaCidade, SITUACOES_QUE_PAGAM } from "./pagamentos";

type CodigoFalha = "DADOS_INVALIDOS" | "CONFLITO" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "ERRO_INTERNO";
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

export interface RepresentanteOpcao {
  id: string;
  codigo: string;
  recebeComissao: boolean;
}

/** Representantes ativos, para escolher quem atendeu a venda. */
async function listarRepresentantes(supabase: SupabaseClient): Promise<Resultado<RepresentanteOpcao[]>> {
  const { data, error } = await supabase.from("representantes").select("id, codigo, recebe_comissao").eq("ativo", true).order("codigo");
  if (error) return mensagemDoBanco(error, "listarRepresentantes");
  return { ok: true, dados: data.map((r) => ({ id: r.id, codigo: r.codigo, recebeComissao: r.recebe_comissao })) };
}

/** Carteira do representante ativo que trouxe o anunciante, com o percentual das configurações (decisões N1 a N3). */
async function lerCarteira(
  supabase: SupabaseClient,
  cidadeId: string,
  representanteId: string | null,
): Promise<Resultado<{ representanteId: string; codigo: string; percentual: number } | null>> {
  if (!representanteId) return { ok: true, dados: null };
  const [rep, config] = await Promise.all([
    supabase.from("representantes").select("id, codigo, ativo, recebe_comissao").eq("id", representanteId).maybeSingle(),
    supabase.from("configuracoes").select("valor").eq("cidade_id", cidadeId).eq("chave", "percentual_carteira").maybeSingle(),
  ]);
  if (rep.error) return mensagemDoBanco(rep.error, "lerCarteira: representante");
  if (config.error) return mensagemDoBanco(config.error, "lerCarteira: percentual");
  const percentual = Number(config.data?.valor ?? 0);
  const r = rep.data;
  return { ok: true, dados: r && r.ativo && r.recebe_comissao && percentual > 0 ? { representanteId: r.id, codigo: r.codigo, percentual } : null };
}

/** Quem atendeu: o representante escolhido no formulário, que precisa estar na lista dos ativos. */
function atendimentoEscolhido(representantes: readonly RepresentanteOpcao[], id: string): Resultado<RepresentanteOpcao | null> {
  if (!id) return { ok: true, dados: null };
  const r = representantes.find((x) => x.id === id);
  return r ? { ok: true, dados: r } : falha("DADOS_INVALIDOS", "Escolha um representante da lista.", { representanteId: "Escolha um representante da lista." });
}

const campoDe = (form: FormData | URLSearchParams) => (nome: string) => {
  const v = form.get(nome);
  return typeof v === "string" ? v.slice(0, 400) : undefined;
};

// ---------------------------------------------------------------------------
// Extras contratados do anunciante
// ---------------------------------------------------------------------------

export interface ExtraContratado {
  id: string;
  extraId: string;
  nome: string;
  periodicidade: "mensal" | "anual";
  ancora: string;
  venceEm: string;
  emVigor: boolean;
  motivoEncerramento: "vencimento" | "devolucao" | "contestacao" | null;
  /** Pagamentos válidos desta contratação: o próximo é o número seguinte. */
  pagamentosValidos: number;
}

export const ROTULO_ENCERRAMENTO: Record<NonNullable<ExtraContratado["motivoEncerramento"]>, string> = {
  vencimento: "Venceu sem renovação",
  devolucao: "Devolvido",
  contestacao: "Contestado no cartão",
};

/** Os extras do anunciante, em vigor primeiro. */
export async function listarExtrasDoAnunciante(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<ExtraContratado[]>> {
  if (!UUID.test(anuncianteId)) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const { data, error } = await supabase
    .from("extras_contratados")
    .select("id, extra_id, periodicidade, ancora, vence_em, encerrado_em, motivo_encerramento, extra:extras(nome), pagamentos(id, devolvido_em)")
    .eq("anunciante_id", anuncianteId)
    .order("criado_em", { ascending: false });
  if (error) return mensagemDoBanco(error, "listarExtrasDoAnunciante");
  type Linha = {
    id: string;
    extra_id: string;
    periodicidade: ExtraContratado["periodicidade"];
    ancora: string;
    vence_em: string;
    encerrado_em: string | null;
    motivo_encerramento: ExtraContratado["motivoEncerramento"];
    extra: { nome: string };
    pagamentos: { id: string; devolvido_em: string | null }[];
  };
  const extras = (data as unknown as Linha[]).map((l) => ({
    id: l.id,
    extraId: l.extra_id,
    nome: l.extra.nome,
    periodicidade: l.periodicidade,
    ancora: l.ancora,
    venceEm: l.vence_em,
    emVigor: l.encerrado_em === null,
    motivoEncerramento: l.motivo_encerramento,
    pagamentosValidos: l.pagamentos.filter((p) => p.devolvido_em === null).length,
  }));
  return { ok: true, dados: [...extras.filter((e) => e.emVigor), ...extras.filter((e) => !e.emVigor)] };
}

// ---------------------------------------------------------------------------
// Pagamento do extra
// ---------------------------------------------------------------------------

export interface ExtraDoCatalogo {
  id: string;
  codigo: string;
  nome: string;
  valorMensalCentavos: number;
  mesesCobradosNoAnual: number;
  aceitaDescontoFundador: boolean;
  permiteAnual: boolean;
  soComercio: boolean;
  cobranca: CobrancaExtra;
  ativo: boolean;
}

export interface ContextoExtra {
  anunciante: {
    id: string;
    nome: string;
    slug: string;
    tipo: "profissional" | "comercio";
    status: Situacao;
    fundadorDesde: string | null;
  };
  /** Extras contratados por mês (ou ano) que este anunciante pode ter. */
  extras: ExtraDoCatalogo[];
  emVigor: ExtraContratado[];
  historicos: Record<string, PrecoVigente[]>;
  representantes: RepresentanteOpcao[];
  carteira: { representanteId: string; codigo: string; percentual: number } | null;
}

export async function lerContextoExtra(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<ContextoExtra>> {
  if (!UUID.test(anuncianteId)) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const anun = await supabase
    .from("anunciantes")
    .select("id, nome, slug, tipo, status, cidade_id, fundador_desde, representante_id")
    .eq("id", anuncianteId)
    .maybeSingle();
  if (anun.error) return mensagemDoBanco(anun.error, "lerContextoExtra: anunciante");
  if (!anun.data) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const a = anun.data;
  const [extras, contratados, representantes, carteira] = await Promise.all([
    supabase
      .from("extras")
      .select("id, codigo, nome, valor_mensal_centavos, meses_cobrados_no_anual, aceita_desconto_fundador, permite_anual, so_comercio, cobranca, ativo")
      .eq("cidade_id", a.cidade_id)
      .eq("cobranca", "mensal")
      .gt("valor_mensal_centavos", 0)
      .order("nome"),
    listarExtrasDoAnunciante(supabase, anuncianteId),
    listarRepresentantes(supabase),
    lerCarteira(supabase, a.cidade_id, a.representante_id),
  ]);
  if (extras.error) return mensagemDoBanco(extras.error, "lerContextoExtra: extras");
  if (!contratados.ok) return contratados;
  if (!representantes.ok) return representantes;
  if (!carteira.ok) return carteira;
  const doCatalogo: ExtraDoCatalogo[] = extras.data
    .filter((e) => !e.so_comercio || a.tipo === "comercio")
    .map((e) => ({
      id: e.id,
      codigo: e.codigo,
      nome: e.nome,
      valorMensalCentavos: e.valor_mensal_centavos,
      mesesCobradosNoAnual: e.meses_cobrados_no_anual,
      aceitaDescontoFundador: e.aceita_desconto_fundador,
      permiteAnual: e.permite_anual,
      soComercio: e.so_comercio,
      cobranca: e.cobranca,
      ativo: e.ativo,
    }));
  const historico = await supabase
    .from("historico_precos")
    .select("extra_id, valor_mensal_centavos, meses_cobrados_no_anual, vigente_desde")
    .in("extra_id", doCatalogo.map((e) => e.id))
    .order("alterado_em");
  if (historico.error) return mensagemDoBanco(historico.error, "lerContextoExtra: histórico de preços");
  const historicos: Record<string, PrecoVigente[]> = {};
  for (const h of historico.data) {
    (historicos[h.extra_id as string] ??= []).push({ valorMensalCentavos: h.valor_mensal_centavos, mesesCobradosNoAnual: h.meses_cobrados_no_anual, vigenteDesde: h.vigente_desde });
  }
  return {
    ok: true,
    dados: {
      anunciante: { id: a.id, nome: a.nome, slug: a.slug, tipo: a.tipo, status: a.status, fundadorDesde: a.fundador_desde },
      extras: doCatalogo,
      emVigor: contratados.dados.filter((c) => c.emVigor),
      historicos,
      representantes: representantes.dados,
      carteira: carteira.dados,
    },
  };
}

export interface ExtraCalculado extends PagamentoExtraCalculado {
  extra: ExtraDoCatalogo;
  /** A contratação que este pagamento renova; null quando é uma contratação nova. */
  renova: ExtraContratado | null;
  atendimento: RepresentanteOpcao | null;
}

/** Lê o formulário (ou os parâmetros da prévia) do pagamento do extra. */
export function lerDadosExtra(form: FormData | URLSearchParams, contexto: ContextoExtra): { valores: Record<string, string>; dados: Resultado<DadosPagamentoExtra> } {
  const campo = campoDe(form);
  const extraId = campo("extra") || contexto.extras.find((e) => e.ativo)?.id || "";
  const valores = {
    extraId,
    periodicidade: campo("periodicidade") || contexto.emVigor.find((c) => c.extraId === extraId)?.periodicidade || "mensal",
    pagoEm: campo("pago_em") || hojeNaCidade(),
    representanteId: campo("representante") ?? "",
    descontoCentavos: campo("desconto") ?? "",
    forma: campo("forma") || "pix",
    parcelas: campo("parcelas") || "1",
    codigoAutorizacao: campo("codigo_autorizacao") ?? "",
    observacao: campo("observacao") ?? "",
  };
  const r = esquemaPagamentoExtra.safeParse(valores);
  return { valores, dados: r.success ? { ok: true, dados: r.data } : falha("DADOS_INVALIDOS", r.error.issues[0]!.message, mensagensPorCampo(r.error)) };
}

/** O que o pagamento do extra grava, pelas regras de packages/domain. */
export async function calcularExtra(contexto: ContextoExtra, dados: DadosPagamentoExtra, hoje = hojeNaCidade()): Promise<Resultado<ExtraCalculado>> {
  if (!SITUACOES_QUE_PAGAM.includes(contexto.anunciante.status)) {
    return falha("CONFLITO", "Este cadastro não recebe pagamento na situação atual.");
  }
  const extra = contexto.extras.find((e) => e.id === dados.extraId);
  if (!extra) return falha("DADOS_INVALIDOS", "Escolha um extra da lista.");
  if (dados.pagoEm > hoje) return falha("DADOS_INVALIDOS", "O dia do pagamento não pode ser depois de hoje.");
  const atendimento = atendimentoEscolhido(contexto.representantes, dados.representanteId);
  if (!atendimento.ok) return atendimento;
  const emVigor = contexto.emVigor.find((c) => c.extraId === extra.id) ?? null;
  const [regras, abertura] = await Promise.all([obterRegrasCobranca(), obterAberturaAoPublico()]);
  // Passada a tolerância, a contratação antiga acaba e o pagamento é uma contratação nova.
  const renova = emVigor && dados.pagoEm <= somarDias(emVigor.venceEm, regras.toleranciaVencimentoDias) ? emVigor : null;
  if (!renova) {
    const impedimento = impedimentoParaContratarExtra({ extra, tipoAnunciante: contexto.anunciante.tipo, jaContratado: false });
    if (impedimento) return falha("CONFLITO", impedimento);
  }
  try {
    const calculado = calcularPagamentoExtra({
      extra,
      historicoExtra: contexto.historicos[extra.id],
      periodicidade: dados.periodicidade,
      pagoEm: dados.pagoEm,
      confirmadoEm: hoje,
      regras: { escalaDescontoFundador: regras.escalaDescontoFundador, toleranciaVencimentoDias: regras.toleranciaVencimentoDias, aberturaAoPublico: abertura },
      contratacao: renova ? { ancora: renova.ancora, venceEm: renova.venceEm, pagamentosAnteriores: renova.pagamentosValidos } : null,
      fundadorDesde: contexto.anunciante.fundadorDesde,
      atendimento: atendimento.dados ? { recebeComissao: atendimento.dados.recebeComissao } : null,
      carteira: contexto.carteira ? { percentual: contexto.carteira.percentual } : null,
      descontoVendaCentavos: dados.descontoCentavos,
    });
    return { ok: true, dados: { ...calculado, extra, renova, atendimento: atendimento.dados } };
  } catch (e) {
    if (e instanceof RangeError) return falha("DADOS_INVALIDOS", e.message);
    throw e;
  }
}

export async function registrarPagamentoExtra(
  supabase: SupabaseClient,
  contexto: ContextoExtra,
  form: FormData,
  comprovante: Uint8Array | null,
  origemDoSite: string,
): Promise<Resultado<{ id: string }>> {
  const { dados: lido } = lerDadosExtra(form, contexto);
  if (!lido.ok) return lido;
  const dados = lido.dados;
  const calculado = await calcularExtra(contexto, dados);
  if (!calculado.ok) return calculado;
  const c = calculado.dados;

  let caminho = "";
  if (comprovante && comprovante.length > 0) {
    const guardado = await guardarComprovante(supabase, contexto.anunciante.id, comprovante);
    if (!guardado.ok) return guardado;
    caminho = guardado.dados;
  }
  const { data, error } = await supabase.rpc("registrar_pagamento_extra", {
    p_anunciante: contexto.anunciante.id,
    p_extra: c.extra.id,
    p_contratacao: c.renova?.id ?? null,
    p_periodicidade: dados.periodicidade,
    p_numero: c.numero,
    p_vence_anterior: c.renova?.venceEm ?? null,
    p_ancora: c.periodo.ancora,
    p_periodo_inicio: c.periodo.inicio,
    p_vence_em: c.periodo.venceEm,
    p_valor_cheio: c.cobranca.valorCheioCentavos,
    p_desconto_fundador: c.cobranca.descontoFundadorCentavos,
    p_desconto_representante: c.descontoRepresentanteCentavos,
    p_forma: dados.forma,
    p_parcelas: dados.parcelas,
    p_codigo_autorizacao: dados.codigoAutorizacao,
    p_pago_em: dados.pagoEm,
    p_confirmado_em: hojeNaCidade(),
    p_comprovante: caminho,
    p_observacao: dados.observacao,
    p_representante: c.atendimento?.id ?? null,
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
    return mensagemDoBanco(error, "registrarPagamentoExtra");
  }
  // A Agenda do perfil e as páginas da Agenda mudam com o extra.
  await Promise.all([limparPerfilDoCache(origemDoSite, contexto.anunciante.slug), limparCacheDoSite(origemDoSite)]);
  return { ok: true, dados: { id: data as string } };
}

// ---------------------------------------------------------------------------
// Pagamento do evento avulso
// ---------------------------------------------------------------------------

export interface PagamentoDoEvento {
  id: string;
  numero: number;
  blocos: number;
  valorCentavos: number;
  pagoEm: string;
  devolvido: boolean;
}

export interface ContextoEvento {
  evento: { id: string; nome: string; slug: string; origem: string; situacao: string; dataInicio: string; dataFim: string; cortesia: boolean };
  /** Valor do bloco de 7 dias no catálogo; null com o evento avulso desligado. */
  valorBlocoCentavos: number | null;
  pagamentos: PagamentoDoEvento[];
  blocosPagos: number;
  representantes: RepresentanteOpcao[];
  carteira: { representanteId: string; codigo: string; percentual: number } | null;
}

export async function lerContextoEvento(supabase: SupabaseClient, eventoId: string): Promise<Resultado<ContextoEvento>> {
  if (!UUID.test(eventoId)) return falha("NAO_ENCONTRADO", "Evento não encontrado.");
  const ev = await supabase
    .from("eventos")
    .select("id, nome, slug, origem, situacao, data_inicio, data_fim, cidade_id, cortesia_em, anunciante:anunciantes(representante_id)")
    .eq("id", eventoId)
    .maybeSingle();
  if (ev.error) return mensagemDoBanco(ev.error, "lerContextoEvento: evento");
  if (!ev.data) return falha("NAO_ENCONTRADO", "Evento não encontrado.");
  const e = ev.data as unknown as {
    id: string;
    nome: string;
    slug: string;
    origem: string;
    situacao: string;
    data_inicio: string;
    data_fim: string;
    cidade_id: string;
    cortesia_em: string | null;
    anunciante: { representante_id: string | null } | null;
  };
  const [extra, pagamentos, representantes, carteira] = await Promise.all([
    supabase.from("extras").select("valor_mensal_centavos, ativo").eq("cidade_id", e.cidade_id).eq("codigo", "evento-avulso").maybeSingle(),
    supabase.from("pagamentos").select("id, numero, blocos, valor_centavos, pago_em, devolvido_em").eq("evento_id", e.id).order("registrado_em"),
    listarRepresentantes(supabase),
    lerCarteira(supabase, e.cidade_id, e.anunciante?.representante_id ?? null),
  ]);
  if (extra.error) return mensagemDoBanco(extra.error, "lerContextoEvento: catálogo");
  if (pagamentos.error) return mensagemDoBanco(pagamentos.error, "lerContextoEvento: pagamentos");
  if (!representantes.ok) return representantes;
  if (!carteira.ok) return carteira;
  const lista = pagamentos.data.map((p) => ({
    id: p.id,
    numero: p.numero,
    blocos: p.blocos,
    valorCentavos: p.valor_centavos,
    pagoEm: p.pago_em,
    devolvido: p.devolvido_em !== null,
  }));
  return {
    ok: true,
    dados: {
      evento: {
        id: e.id,
        nome: e.nome,
        slug: e.slug,
        origem: e.origem,
        situacao: e.situacao,
        dataInicio: e.data_inicio,
        dataFim: e.data_fim,
        cortesia: e.cortesia_em !== null,
      },
      valorBlocoCentavos: extra.data?.ativo ? extra.data.valor_mensal_centavos : null,
      pagamentos: lista,
      blocosPagos: lista.filter((p) => !p.devolvido).reduce((soma, p) => soma + p.blocos, 0),
      representantes: representantes.dados,
      carteira: carteira.dados,
    },
  };
}

export interface EventoCalculado extends PagamentoEventoCalculado {
  numero: number;
  dataFim: string;
  /** Último dia para desistir (E1). */
  desistirAte: string;
  atendimento: RepresentanteOpcao | null;
}

export function lerDadosEvento(form: FormData | URLSearchParams, contexto: ContextoEvento): { valores: Record<string, string>; dados: Resultado<DadosPagamentoEvento> } {
  const campo = campoDe(form);
  const valores = {
    dataFim: campo("data_fim") || contexto.evento.dataFim,
    pagoEm: campo("pago_em") || hojeNaCidade(),
    representanteId: campo("representante") ?? "",
    descontoCentavos: campo("desconto") ?? "",
    forma: campo("forma") || "pix",
    parcelas: campo("parcelas") || "1",
    codigoAutorizacao: campo("codigo_autorizacao") ?? "",
    observacao: campo("observacao") ?? "",
  };
  const r = esquemaPagamentoEvento.safeParse(valores);
  return { valores, dados: r.success ? { ok: true, dados: r.data } : falha("DADOS_INVALIDOS", r.error.issues[0]!.message, mensagensPorCampo(r.error)) };
}

export function calcularEvento(contexto: ContextoEvento, dados: DadosPagamentoEvento, hoje = hojeNaCidade()): Resultado<EventoCalculado> {
  const { evento } = contexto;
  if (evento.origem !== "avulso") return falha("CONFLITO", "Só o evento avulso é pago por bloco de 7 dias.");
  if (evento.situacao === "cancelado") return falha("CONFLITO", "Este evento foi cancelado.");
  if (contexto.valorBlocoCentavos === null) return falha("CONFLITO", "O evento avulso está desligado no catálogo.");
  if (dados.pagoEm > hoje) return falha("DADOS_INVALIDOS", "O dia do pagamento não pode ser depois de hoje.");
  if (dados.dataFim < evento.dataInicio) return falha("DADOS_INVALIDOS", "O último dia não pode ser antes do primeiro.", { dataFim: "O último dia não pode ser antes do primeiro." });
  if (dados.dataFim < hoje) return falha("CONFLITO", "Este evento já terminou.");
  const atendimento = atendimentoEscolhido(contexto.representantes, dados.representanteId);
  if (!atendimento.ok) return atendimento;
  try {
    const calculado = calcularPagamentoEvento({
      inicio: evento.dataInicio,
      fim: dados.dataFim,
      valorBlocoCentavos: contexto.valorBlocoCentavos,
      blocosJaPagos: contexto.blocosPagos,
      pagoEm: dados.pagoEm,
      confirmadoEm: hoje,
      atendimento: atendimento.dados ? { recebeComissao: atendimento.dados.recebeComissao } : null,
      carteira: contexto.carteira ? { percentual: contexto.carteira.percentual } : null,
      descontoVendaCentavos: dados.descontoCentavos,
    });
    return {
      ok: true,
      dados: {
        ...calculado,
        numero: contexto.pagamentos.filter((p) => !p.devolvido).length + 1,
        dataFim: dados.dataFim,
        desistirAte: prazoParaDesistirDoEvento(dados.pagoEm, evento.dataInicio),
        atendimento: atendimento.dados,
      },
    };
  } catch (e) {
    if (e instanceof RangeError) return falha("DADOS_INVALIDOS", e.message);
    throw e;
  }
}

export async function registrarPagamentoEvento(
  supabase: SupabaseClient,
  contexto: ContextoEvento,
  form: FormData,
  comprovante: Uint8Array | null,
  origemDoSite: string,
): Promise<Resultado<{ id: string }>> {
  const { dados: lido } = lerDadosEvento(form, contexto);
  if (!lido.ok) return lido;
  const dados = lido.dados;
  const calculado = calcularEvento(contexto, dados);
  if (!calculado.ok) return calculado;
  const c = calculado.dados;

  let caminho = "";
  if (comprovante && comprovante.length > 0) {
    // Comprovantes do evento ficam na pasta do evento (o produtor pode não ser anunciante).
    const guardado = await guardarComprovante(supabase, contexto.evento.id, comprovante);
    if (!guardado.ok) return guardado;
    caminho = guardado.dados;
  }
  const { data, error } = await supabase.rpc("registrar_pagamento_evento", {
    p_evento: contexto.evento.id,
    p_data_inicio: contexto.evento.dataInicio,
    p_data_fim: c.dataFim,
    p_numero: c.numero,
    p_blocos: c.blocosPagos,
    p_valor_cheio: c.valorCentavos,
    p_desconto_representante: c.descontoRepresentanteCentavos,
    p_forma: dados.forma,
    p_parcelas: dados.parcelas,
    p_codigo_autorizacao: dados.codigoAutorizacao,
    p_pago_em: dados.pagoEm,
    p_confirmado_em: hojeNaCidade(),
    p_comprovante: caminho,
    p_observacao: dados.observacao,
    p_representante: c.atendimento?.id ?? null,
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
    return mensagemDoBanco(error, "registrarPagamentoEvento");
  }
  await limparCacheDoSite(origemDoSite);
  return { ok: true, dados: { id: data as string } };
}
