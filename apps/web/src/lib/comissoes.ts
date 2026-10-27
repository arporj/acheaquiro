// Comissões dos representantes (item 4.12; plano 3A, decisões de 27/10/2026):
// na administração, o saldo de cada representante, o pagamento do saldo
// liberado inteiro por Pix (P2), com o comprovante opcional, e a marcação de
// quem recebe comissão (o sócio, por enquanto, não); na área do representante,
// as comissões dele. O saldo sai de saldoDoRepresentante (packages/domain); o
// banco confere de novo o que é pago (registrar_pagamento_representante,
// migration 20261027160000).
import { saldoDoRepresentante, type SaldoRepresentante } from "@acheaqui/domain";
import type { Resultado } from "@acheaqui/types";
import { esquemaPagamentoRepresentante } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apagarComprovante, enderecoDoComprovante, guardarComprovante } from "./comprovantesGuardados";
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

export type OrigemComissao = "plano" | "extra" | "patrocinio" | "upgrade" | "carteira" | "contestacao";

export const ROTULO_ORIGEM: Record<OrigemComissao, string> = {
  plano: "Venda do plano",
  extra: "Venda de extra",
  patrocinio: "Patrocínio",
  upgrade: "Mudança de plano",
  carteira: "Carteira",
  contestacao: "Desconto de contestação",
};

type LinhaComissao = { id: string; valor_centavos: number; libera_em: string; cancelada_em: string | null; pagamento_representante_id: string | null };

const paraLancada = (c: LinhaComissao) => ({
  id: c.id,
  valorCentavos: c.valor_centavos,
  liberaEm: c.libera_em,
  cancelada: c.cancelada_em !== null,
  paga: c.pagamento_representante_id !== null,
});

async function nomesDos(supabase: SupabaseClient, usuarios: string[]): Promise<Resultado<Map<string, string>>> {
  if (usuarios.length === 0) return { ok: true, dados: new Map() };
  const { data, error } = await supabase.from("perfis_usuario").select("usuario_id, nome").in("usuario_id", usuarios);
  if (error) return mensagemDoBanco(error, "comissoes: nomes");
  return { ok: true, dados: new Map(data.map((p) => [p.usuario_id as string, (p.nome as string) || ""])) };
}

// ---------------------------------------------------------------------------
// Administração
// ---------------------------------------------------------------------------

export interface ResumoRepresentante {
  id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
  recebeComissao: boolean;
  chavePix: string | null;
  saldo: SaldoRepresentante;
}

const COLUNAS_REPRESENTANTE = "id, usuario_id, codigo, ativo, recebe_comissao, chave_pix";
type LinhaRepresentante = { id: string; usuario_id: string; codigo: string; ativo: boolean; recebe_comissao: boolean; chave_pix: string | null };

const paraResumo = (r: LinhaRepresentante, nome: string, comissoes: LinhaComissao[], hoje: string): ResumoRepresentante => ({
  id: r.id,
  nome: nome || r.codigo,
  codigo: r.codigo,
  ativo: r.ativo,
  recebeComissao: r.recebe_comissao,
  chavePix: r.chave_pix,
  saldo: saldoDoRepresentante(comissoes.map(paraLancada), hoje),
});

/** Todos os representantes, os ativos primeiro, com o saldo de cada um. */
export async function listarRepresentantes(supabase: SupabaseClient): Promise<Resultado<ResumoRepresentante[]>> {
  const { data, error } = await supabase
    .from("representantes")
    .select(`${COLUNAS_REPRESENTANTE}, comissoes(id, valor_centavos, libera_em, cancelada_em, pagamento_representante_id)`)
    .order("ativo", { ascending: false })
    .order("codigo");
  if (error) return mensagemDoBanco(error, "listarRepresentantes");
  const linhas = data as unknown as (LinhaRepresentante & { comissoes: LinhaComissao[] })[];
  const nomes = await nomesDos(supabase, linhas.map((r) => r.usuario_id));
  if (!nomes.ok) return nomes;
  const hoje = hojeNaCidade();
  return { ok: true, dados: linhas.map((r) => paraResumo(r, nomes.dados.get(r.usuario_id) ?? "", r.comissoes, hoje)) };
}

/** Representantes ativos que recebem comissão, para escolher quem atendeu um patrocinador. */
export async function representantesParaEscolha(supabase: SupabaseClient): Promise<Resultado<{ id: string; nome: string }[]>> {
  const lista = await listarRepresentantes(supabase);
  if (!lista.ok) return lista;
  return { ok: true, dados: lista.dados.filter((r) => r.ativo && r.recebeComissao).map((r) => ({ id: r.id, nome: r.nome })) };
}

export interface ComissaoDetalhe {
  id: string;
  origem: OrigemComissao;
  descricao: string;
  baseCentavos: number;
  percentual: number;
  valorCentavos: number;
  liberaEm: string;
  cancelada: boolean;
  paga: boolean;
  criadaEm: string;
}

export interface PagamentoAoRepresentante {
  id: string;
  valorCentavos: number;
  pagoEm: string;
  chavePix: string;
  observacao: string;
  comprovante: string | null;
}

export interface RepresentanteDetalhe extends ResumoRepresentante {
  comissoes: ComissaoDetalhe[];
  pagamentos: PagamentoAoRepresentante[];
}

export async function lerRepresentante(supabase: SupabaseClient, id: string): Promise<Resultado<RepresentanteDetalhe>> {
  if (!UUID.test(id)) return falha("NAO_ENCONTRADO", "Representante não encontrado.");
  const [rep, comissoes, pagamentos] = await Promise.all([
    supabase.from("representantes").select(COLUNAS_REPRESENTANTE).eq("id", id).maybeSingle(),
    supabase
      .from("comissoes")
      .select(
        "id, origem, base_centavos, percentual, valor_centavos, libera_em, cancelada_em, pagamento_representante_id, criado_em, " +
          "pagamento:pagamentos(anunciante:anunciantes(nome)), patrocinio:patrocinios(nome)",
      )
      .eq("representante_id", id)
      .order("criado_em", { ascending: false }),
    supabase
      .from("pagamentos_representante")
      .select("id, valor_centavos, pago_em, chave_pix, observacao, comprovante_caminho")
      .eq("representante_id", id)
      .order("pago_em", { ascending: false }),
  ]);
  if (rep.error) return mensagemDoBanco(rep.error, "lerRepresentante");
  if (!rep.data) return falha("NAO_ENCONTRADO", "Representante não encontrado.");
  if (comissoes.error) return mensagemDoBanco(comissoes.error, "lerRepresentante: comissões");
  if (pagamentos.error) return mensagemDoBanco(pagamentos.error, "lerRepresentante: pagamentos");
  const r = rep.data as LinhaRepresentante;
  const nomes = await nomesDos(supabase, [r.usuario_id]);
  if (!nomes.ok) return nomes;

  const linhas = comissoes.data as unknown as (LinhaComissao & {
    origem: OrigemComissao;
    base_centavos: number;
    percentual: number;
    criado_em: string;
    pagamento: { anunciante: { nome: string } } | null;
    patrocinio: { nome: string } | null;
  })[];
  const enderecos = await Promise.all(pagamentos.data.map((p) => enderecoDoComprovante(supabase, p.comprovante_caminho as string | null)));
  return {
    ok: true,
    dados: {
      ...paraResumo(r, nomes.dados.get(r.usuario_id) ?? "", linhas, hojeNaCidade()),
      comissoes: linhas.map((c) => ({
        id: c.id,
        origem: c.origem,
        descricao: c.pagamento?.anunciante.nome ?? c.patrocinio?.nome ?? "",
        baseCentavos: c.base_centavos,
        percentual: Number(c.percentual),
        valorCentavos: c.valor_centavos,
        liberaEm: c.libera_em,
        cancelada: c.cancelada_em !== null,
        paga: c.pagamento_representante_id !== null,
        criadaEm: c.criado_em,
      })),
      pagamentos: pagamentos.data.map((p, i) => ({
        id: p.id,
        valorCentavos: p.valor_centavos,
        pagoEm: p.pago_em,
        chavePix: p.chave_pix,
        observacao: p.observacao,
        comprovante: enderecos[i] ?? null,
      })),
    },
  };
}

/** Paga ao representante o saldo liberado inteiro (decisão P2). */
export async function pagarSaldo(
  supabase: SupabaseClient,
  representante: RepresentanteDetalhe,
  form: FormData,
  comprovante: Uint8Array | null,
): Promise<Resultado<null>> {
  const lido = esquemaPagamentoRepresentante.safeParse({
    pagoEm: typeof form.get("pago_em") === "string" ? String(form.get("pago_em")).slice(0, 20) : undefined,
    observacao: typeof form.get("observacao") === "string" ? String(form.get("observacao")).slice(0, 400) : undefined,
  });
  if (!lido.success) return falha("DADOS_INVALIDOS", lido.error.issues[0]!.message);
  if (lido.data.pagoEm > hojeNaCidade()) return falha("DADOS_INVALIDOS", "O dia do Pix não pode ser depois de hoje.");
  if (!representante.chavePix) return falha("CONFLITO", "O representante ainda não informou a chave Pix na área dele.");
  const { liberadoCentavos, aPagar } = representante.saldo;
  if (liberadoCentavos <= 0) return falha("CONFLITO", "Não há saldo liberado a pagar.");

  let caminho = "";
  if (comprovante && comprovante.length > 0) {
    const guardado = await guardarComprovante(supabase, `representantes/${representante.id}`, comprovante);
    if (!guardado.ok) return guardado;
    caminho = guardado.dados;
  }
  const { error } = await supabase.rpc("registrar_pagamento_representante", {
    p_representante: representante.id,
    p_comissoes: aPagar,
    p_valor: liberadoCentavos,
    p_pago_em: lido.data.pagoEm,
    p_comprovante: caminho,
    p_observacao: lido.data.observacao,
  });
  if (error) {
    if (caminho) await apagarComprovante(supabase, caminho);
    return mensagemDoBanco(error, "pagarSaldo");
  }
  return { ok: true, dados: null };
}

/** Liga ou desliga a comissão do representante (o sócio, por enquanto, não recebe). Vale para os próximos pagamentos. */
export async function mudarRecebeComissao(supabase: SupabaseClient, id: string, recebe: boolean): Promise<Resultado<null>> {
  const { data, error } = await supabase.from("representantes").update({ recebe_comissao: recebe }).eq("id", id).select("id");
  if (error) return mensagemDoBanco(error, "mudarRecebeComissao");
  return data.length > 0 ? { ok: true, dados: null } : falha("NAO_ENCONTRADO", "Representante não encontrado.");
}

// ---------------------------------------------------------------------------
// Área do representante
// ---------------------------------------------------------------------------

export interface MinhasComissoes {
  saldo: SaldoRepresentante;
  comissoes: ComissaoDetalhe[];
  pagamentos: { valorCentavos: number; pagoEm: string }[];
}

export async function lerMinhasComissoes(supabase: SupabaseClient, representanteId: string): Promise<Resultado<MinhasComissoes>> {
  const [comissoes, pagamentos] = await Promise.all([
    supabase.rpc("minhas_comissoes"),
    supabase.from("pagamentos_representante").select("valor_centavos, pago_em").eq("representante_id", representanteId).order("pago_em", { ascending: false }),
  ]);
  if (comissoes.error) return mensagemDoBanco(comissoes.error, "lerMinhasComissoes");
  if (pagamentos.error) return mensagemDoBanco(pagamentos.error, "lerMinhasComissoes: pagamentos");
  const linhas = comissoes.data as {
    id: string;
    origem: OrigemComissao;
    descricao: string;
    base_centavos: number;
    percentual: number;
    valor_centavos: number;
    libera_em: string;
    cancelada: boolean;
    pago_em: string | null;
    criado_em: string;
  }[];
  const lista: ComissaoDetalhe[] = linhas.map((c) => ({
    id: c.id,
    origem: c.origem,
    descricao: c.descricao,
    baseCentavos: c.base_centavos,
    percentual: Number(c.percentual),
    valorCentavos: c.valor_centavos,
    liberaEm: c.libera_em,
    cancelada: c.cancelada,
    paga: c.pago_em !== null,
    criadaEm: c.criado_em,
  }));
  return {
    ok: true,
    dados: {
      saldo: saldoDoRepresentante(lista, hojeNaCidade()),
      comissoes: lista,
      pagamentos: pagamentos.data.map((p) => ({ valorCentavos: p.valor_centavos, pagoEm: p.pago_em })),
    },
  };
}
