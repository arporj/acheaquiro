// Catálogo e valores na administração (item 4 do plano, 27/10/2026): planos,
// extras e a escala do desconto de Fundador. O banco guarda o histórico dos
// preços (historico_precos). Quando um plano fica mais caro, cada assinante
// recebe um e-mail com o próprio valor e a partir de qual vencimento ele vale
// (avisoDePreco, em packages/domain): pelo menos 30 dias depois do aviso, como
// dizem os Termos de Uso (item 7.1). Quem contrata depois paga o valor novo.
import { avisoDePreco, situacaoCobranca, somarDias, validarEscalaFundador, type AvisoDePreco } from "@acheaqui/domain";
import type { DegrauDescontoFundador, Resultado } from "@acheaqui/types";
import {
  esquemaDestaquePorDia,
  esquemaEscalaFundador,
  esquemaExtraAdmin,
  esquemaPlanoAdmin,
  esquemaQuantidadePacote,
  mensagensPorCampo,
} from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterRegrasCobranca } from "../dados/consultas";
import { limparCacheDoSite } from "./arquivos";
import { hojeNaCidade } from "./pagamentos";
import { descricaoDescontoFundador } from "./precos";

type CodigoFalha = "DADOS_INVALIDOS" | "CONFLITO" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string; campos?: Record<string, string> } };
const falha = (codigo: CodigoFalha, mensagem: string, campos?: Record<string, string>): Falha => ({ ok: false, erro: { codigo, mensagem, campos } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CIDADE = "rio-das-ostras";

function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

const campo = (form: FormData, nome: string) => {
  const v = form.get(nome);
  return typeof v === "string" ? v.slice(0, 400) : undefined;
};

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface PlanoCatalogo {
  id: string;
  tipo: "profissional" | "comercio";
  nome: string;
  nivel: number;
  valorMensalCentavos: number;
  mesesCobradosNoAnual: number;
  limiteFotos: number;
  limiteCategoriasAdicionais: number;
  limiteEncartesSemana: number;
  limiteProdutos: number;
  limiteEnderecos: number;
  temRelatorio: boolean;
  ativo: boolean;
  /** Assinaturas em dia ou dentro da tolerância: recebem o aviso quando o preço sobe. */
  assinaturasAtivas: number;
}

export interface ExtraCatalogo {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  valorMensalCentavos: number;
  mesesCobradosNoAnual: number;
  recurso: string | null;
  quantidade: number | null;
  aceitaDescontoFundador: boolean;
  permiteAnual: boolean;
  cobranca: "mensal" | "por_dia";
  regras: Record<string, unknown>;
  ativo: boolean;
}

export interface Catalogo {
  planos: PlanoCatalogo[];
  extras: ExtraCatalogo[];
  escala: DegrauDescontoFundador[];
  /** Com Fundadores, a escala não muda: mudaria o valor deles sem o aviso de 30 dias. */
  temFundadores: boolean;
}

type LinhaAssinatura = { anunciante_id: string; plano_id: string; ancora: string; vence_em: string; periodicidade: "mensal" | "anual" };

/** Assinaturas que ainda valem (em dia ou dentro da tolerância), com o Fundador de cada anunciante. */
async function assinaturasAtivas(supabase: SupabaseClient, planoId?: string) {
  const hoje = hojeNaCidade();
  const { toleranciaVencimentoDias: tolerancia } = await obterRegrasCobranca();
  let consulta = supabase
    .from("assinaturas")
    .select("anunciante_id, plano_id, ancora, vence_em, periodicidade, anunciante:anunciantes!inner(fundador_desde, status)")
    .gte("vence_em", somarDias(hoje, -tolerancia))
    .in("anunciante.status", ["publicado", "pausado"]);
  if (planoId) consulta = consulta.eq("plano_id", planoId);
  const { data, error } = await consulta;
  if (error) return mensagemDoBanco(error, "catalogo: assinaturas");
  const linhas = data as unknown as (LinhaAssinatura & { anunciante: { fundador_desde: string | null } })[];
  return {
    ok: true as const,
    dados: linhas.filter((l) => situacaoCobranca({ venceEm: l.vence_em, hoje, toleranciaDias: tolerancia }) !== "vencida"),
  };
}

export async function lerCatalogo(supabase: SupabaseClient): Promise<Resultado<Catalogo>> {
  const [planos, extras, escala, fundadores, ativas] = await Promise.all([
    supabase
      .from("planos")
      .select(
        "id, tipo, nome, nivel, valor_mensal_centavos, meses_cobrados_no_anual, limite_fotos, limite_categorias_adicionais, " +
          "limite_encartes_semana, limite_produtos, limite_enderecos, tem_relatorio, ativo",
      )
      .order("tipo")
      .order("nivel"),
    supabase
      .from("extras")
      .select("id, codigo, nome, descricao, valor_mensal_centavos, meses_cobrados_no_anual, recurso, quantidade, aceita_desconto_fundador, permite_anual, cobranca, regras, ativo")
      .order("ordem"),
    supabase.from("configuracoes").select("valor").eq("chave", "desconto_fundador_escala").maybeSingle(),
    supabase.from("anunciantes").select("id", { count: "exact", head: true }).eq("fundador", true),
    assinaturasAtivas(supabase),
  ]);
  if (planos.error) return mensagemDoBanco(planos.error, "lerCatalogo: planos");
  if (extras.error) return mensagemDoBanco(extras.error, "lerCatalogo: extras");
  if (escala.error) return mensagemDoBanco(escala.error, "lerCatalogo: escala");
  if (fundadores.error) return mensagemDoBanco(fundadores.error, "lerCatalogo: Fundadores");
  if (!ativas.ok) return ativas;

  type LinhaPlano = {
    id: string;
    tipo: PlanoCatalogo["tipo"];
    nome: string;
    nivel: number;
    valor_mensal_centavos: number;
    meses_cobrados_no_anual: number;
    limite_fotos: number;
    limite_categorias_adicionais: number;
    limite_encartes_semana: number;
    limite_produtos: number;
    limite_enderecos: number;
    tem_relatorio: boolean;
    ativo: boolean;
  };
  type LinhaExtra = {
    id: string;
    codigo: string;
    nome: string;
    descricao: string;
    valor_mensal_centavos: number;
    meses_cobrados_no_anual: number;
    recurso: string | null;
    quantidade: number | null;
    aceita_desconto_fundador: boolean;
    permite_anual: boolean;
    cobranca: ExtraCatalogo["cobranca"];
    regras: Record<string, unknown>;
    ativo: boolean;
  };
  return {
    ok: true,
    dados: {
      planos: (planos.data as unknown as LinhaPlano[]).map((p) => ({
        id: p.id,
        tipo: p.tipo,
        nome: p.nome,
        nivel: p.nivel,
        valorMensalCentavos: p.valor_mensal_centavos,
        mesesCobradosNoAnual: p.meses_cobrados_no_anual,
        limiteFotos: p.limite_fotos,
        limiteCategoriasAdicionais: p.limite_categorias_adicionais,
        limiteEncartesSemana: p.limite_encartes_semana,
        limiteProdutos: p.limite_produtos,
        limiteEnderecos: p.limite_enderecos,
        temRelatorio: p.tem_relatorio,
        ativo: p.ativo,
        assinaturasAtivas: ativas.dados.filter((a) => a.plano_id === p.id).length,
      })),
      extras: (extras.data as unknown as LinhaExtra[]).map((e) => ({
        id: e.id,
        codigo: e.codigo,
        nome: e.nome,
        descricao: e.descricao,
        valorMensalCentavos: e.valor_mensal_centavos,
        mesesCobradosNoAnual: e.meses_cobrados_no_anual,
        recurso: e.recurso,
        quantidade: e.quantidade,
        aceitaDescontoFundador: e.aceita_desconto_fundador,
        permiteAnual: e.permite_anual,
        cobranca: e.cobranca,
        regras: e.regras ?? {},
        ativo: e.ativo,
      })),
      escala: (escala.data?.valor as DegrauDescontoFundador[] | undefined) ?? [],
      temFundadores: (fundadores.count ?? 0) > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

/**
 * Salva o plano. Se ficou mais caro, cada assinante recebe o aviso com o
 * próprio valor (avisoDePreco). Devolve quantos avisos entraram na fila.
 */
export async function salvarPlano(supabase: SupabaseClient, id: string, form: FormData, origemDoSite: string): Promise<Resultado<{ avisos: number }>> {
  if (!UUID.test(id)) return falha("NAO_ENCONTRADO", "Plano não encontrado.");
  const lido = esquemaPlanoAdmin.safeParse({
    nome: campo(form, "nome"),
    valorMensalCentavos: campo(form, "valor"),
    mesesCobradosNoAnual: campo(form, "meses_anual"),
    limiteFotos: campo(form, "limite_fotos"),
    limiteCategoriasAdicionais: campo(form, "limite_categorias"),
    limiteEncartesSemana: campo(form, "limite_encartes"),
    limiteProdutos: campo(form, "limite_produtos"),
    limiteEnderecos: campo(form, "limite_enderecos"),
    temRelatorio: campo(form, "tem_relatorio"),
  });
  if (!lido.success) return falha("DADOS_INVALIDOS", lido.error.issues[0]!.message, mensagensPorCampo(lido.error));
  const d = lido.data;

  const { data: atual, error: erroAtual } = await supabase.from("planos").select("valor_mensal_centavos, meses_cobrados_no_anual").eq("id", id).maybeSingle();
  if (erroAtual) return mensagemDoBanco(erroAtual, "salvarPlano: leitura");
  if (!atual) return falha("NAO_ENCONTRADO", "Plano não encontrado.");
  if ((atual.valor_mensal_centavos === 0) !== (d.valorMensalCentavos === 0)) {
    return falha("DADOS_INVALIDOS", "O plano Gratuito continua gratuito, e um plano pago não pode passar a custar zero.");
  }

  const antigo = { valorMensalCentavos: atual.valor_mensal_centavos as number, mesesCobradosNoAnual: atual.meses_cobrados_no_anual as number };
  const avisos = await avisosDosAssinantes(supabase, id, antigo, { valorMensalCentavos: d.valorMensalCentavos, mesesCobradosNoAnual: d.mesesCobradosNoAnual });
  if (!avisos.ok) return avisos;
  // Plano e avisos numa transação: o valor não muda sem o aviso aos assinantes.
  const { data, error } = await supabase.rpc("salvar_plano", { p_plano: id, p_antes: antigo, p_dados: d, p_avisos: avisos.dados });
  if (error) return mensagemDoBanco(error, "salvarPlano");
  await limparCacheDoSite(origemDoSite);
  return { ok: true, dados: { avisos: (data as number) ?? 0 } };
}

/** O aviso de cada assinante cujo valor sobe (avisoDePreco); vazio se o preço não mudou ou só caiu. */
async function avisosDosAssinantes(
  supabase: SupabaseClient,
  planoId: string,
  antigo: { valorMensalCentavos: number; mesesCobradosNoAnual: number },
  novo: { valorMensalCentavos: number; mesesCobradosNoAnual: number },
): Promise<Resultado<(AvisoDePreco & { anuncianteId: string })[]>> {
  if (antigo.valorMensalCentavos === novo.valorMensalCentavos && antigo.mesesCobradosNoAnual === novo.mesesCobradosNoAnual) {
    return { ok: true, dados: [] };
  }
  const [ativas, regras] = await Promise.all([assinaturasAtivas(supabase, planoId), obterRegrasCobranca()]);
  if (!ativas.ok) return ativas;
  const hoje = hojeNaCidade();
  const avisos: (AvisoDePreco & { anuncianteId: string })[] = [];
  for (const a of ativas.dados) {
    const aviso = avisoDePreco({
      assinatura: { ancora: a.ancora, venceEm: a.vence_em, periodicidade: a.periodicidade },
      antigo,
      novo,
      avisadoEm: hoje,
      fundadorDesde: a.anunciante.fundador_desde,
      escalaDescontoFundador: regras.escalaDescontoFundador,
    });
    if (aviso) avisos.push({ ...aviso, anuncianteId: a.anunciante_id });
  }
  return { ok: true, dados: avisos };
}

// ---------------------------------------------------------------------------
// Extras
// ---------------------------------------------------------------------------

export async function salvarExtra(supabase: SupabaseClient, id: string, form: FormData, origemDoSite: string): Promise<Resultado<null>> {
  if (!UUID.test(id)) return falha("NAO_ENCONTRADO", "Extra não encontrado.");
  const { data: atual, error: erroAtual } = await supabase.from("extras").select("recurso, cobranca, regras").eq("id", id).maybeSingle();
  if (erroAtual) return mensagemDoBanco(erroAtual, "salvarExtra: leitura");
  if (!atual) return falha("NAO_ENCONTRADO", "Extra não encontrado.");

  const porDia = atual.cobranca === "por_dia";
  // No Destaque Exclusivo, o valor do extra é o do bloco de dias seguidos.
  const destaque = porDia
    ? esquemaDestaquePorDia.safeParse({
        diariaCentavos: campo(form, "diaria"),
        valorBlocoCentavos: campo(form, "valor_bloco"),
        diasPorBloco: campo(form, "dias_bloco"),
        minimoDiasParaBloco: campo(form, "minimo_bloco"),
        antecedenciaDias: campo(form, "antecedencia"),
      })
    : null;
  if (destaque && !destaque.success) return falha("DADOS_INVALIDOS", destaque.error.issues[0]!.message);
  const lido = esquemaExtraAdmin.safeParse({
    nome: campo(form, "nome"),
    descricao: campo(form, "descricao"),
    valorMensalCentavos: destaque?.success ? (destaque.data.valorBlocoCentavos / 100).toFixed(2).replace(".", ",") : campo(form, "valor"),
    mesesCobradosNoAnual: campo(form, "meses_anual") ?? "10",
    aceitaDescontoFundador: campo(form, "desconto_fundador"),
    permiteAnual: porDia ? undefined : campo(form, "permite_anual"),
    ativo: campo(form, "ativo"),
  });
  if (!lido.success) return falha("DADOS_INVALIDOS", lido.error.issues[0]!.message, mensagensPorCampo(lido.error));
  const quantidade = atual.recurso ? esquemaQuantidadePacote.safeParse(campo(form, "quantidade")) : null;
  if (quantidade && !quantidade.success) return falha("DADOS_INVALIDOS", quantidade.error.issues[0]!.message);

  const d = lido.data;
  const regras = destaque?.success
    ? {
        ...(atual.regras as Record<string, unknown>),
        diaria_centavos: destaque.data.diariaCentavos,
        valor_bloco_centavos: destaque.data.valorBlocoCentavos,
        dias_por_bloco: destaque.data.diasPorBloco,
        minimo_dias_para_bloco: destaque.data.minimoDiasParaBloco,
        antecedencia_dias: destaque.data.antecedenciaDias,
      }
    : atual.regras;
  const { error } = await supabase
    .from("extras")
    .update({
      nome: d.nome,
      descricao: d.descricao,
      valor_mensal_centavos: d.valorMensalCentavos,
      meses_cobrados_no_anual: d.mesesCobradosNoAnual,
      aceita_desconto_fundador: d.aceitaDescontoFundador,
      permite_anual: d.permiteAnual,
      ativo: d.ativo,
      regras,
      ...(quantidade?.success ? { quantidade: quantidade.data } : {}),
    })
    .eq("id", id);
  if (error) return mensagemDoBanco(error, "salvarExtra");
  await limparCacheDoSite(origemDoSite);
  return { ok: true, dados: null };
}

// ---------------------------------------------------------------------------
// Escala do desconto de Fundador
// ---------------------------------------------------------------------------

/**
 * Textos fixos que repetem a escala do desconto de Fundador. As páginas
 * públicas leem a escala do banco e mudam sozinhas; estes não. Quem muda a
 * escala vê a lista na tela, e todos os administradores recebem por e-mail
 * (decisão de 28/10/2026).
 */
export const DOCUMENTOS_DA_ESCALA = [
  "Termos de Uso, item 7.4 (apps/web/src/conteudo/termos-v1.md e a cópia em docs/Juridico). Se alguém já aceitou a versão atual, a mudança sai numa versão nova, que todos aceitam de novo.",
  "Especificação funcional (docs): objetivo, itens 4.16, 6.4 e 10 e decisões 4, 27 e 46.",
  "CLAUDE.md do projeto (calendário e Fundadores).",
  "Site de apresentação (apps/web/src/mocks/planos.ts), que não lê o banco.",
  "Material de divulgação impresso ou já enviado (flyer, mensagens prontas dos representantes).",
];

/** Salva a escala e põe na fila o e-mail aos administradores, numa transação (salvar_escala_fundador). */
export async function salvarEscala(
  supabase: SupabaseClient,
  form: FormData,
  atual: { escala: DegrauDescontoFundador[]; temFundadores: boolean },
  origemDoSite: string,
): Promise<Resultado<{ avisos: number; mudou: boolean }>> {
  if (atual.temFundadores) {
    return falha("CONFLITO", "Já há Fundadores: mudar a escala muda o valor deles sem o aviso de 30 dias. Fale com o responsável pelo sistema.");
  }
  const linhas = [0, 1, 2, 3, 4].map((i) => ({ ateAno: campo(form, `ate_ano_${i}`), percentual: campo(form, `percentual_${i}`) }));
  const lido = esquemaEscalaFundador.safeParse(linhas);
  if (!lido.success) return falha("DADOS_INVALIDOS", lido.error.issues[0]!.message);
  const escala: DegrauDescontoFundador[] = lido.data.map((d: { ateAno?: number; percentual: number }) => (d.ateAno === undefined ? { percentual: d.percentual } : { ateAno: d.ateAno, percentual: d.percentual }));
  try {
    validarEscalaFundador(escala);
  } catch (e) {
    if (e instanceof RangeError) return falha("DADOS_INVALIDOS", e.message);
    throw e;
  }
  if (JSON.stringify(escala) === JSON.stringify(atual.escala)) return { ok: true, dados: { avisos: 0, mudou: false } };
  const textos = {
    antes: atual.escala.length ? descricaoDescontoFundador(atual.escala) : "",
    depois: descricaoDescontoFundador(escala),
    documentos: DOCUMENTOS_DA_ESCALA,
  };
  const { data, error } = await supabase.rpc("salvar_escala_fundador", { p_escala: escala, p_antes: atual.escala, p_textos: textos });
  if (error) return mensagemDoBanco(error, "salvarEscala");
  await limparCacheDoSite(origemDoSite);
  return { ok: true, dados: { avisos: Number(data ?? 0), mudou: true } };
}
