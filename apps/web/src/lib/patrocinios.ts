// Patrocinadores na administração: cotas (valores, vagas, tamanho do logo) e
// patrocínios (cadastro, logo, entrada no ar, pagamento e encerramento).
// Tudo com a sessão do administrador, para a auditoria registrar quem fez; o
// RLS só deixa o administrador com a segunda etapa alterar estas tabelas. As
// regras ficam em packages/domain (patrocinio.ts) e o banco repete as travas.
import { fimDoPatrocinio, impedimentoParaEntrarNoAr, type PatrocinioParaRegra } from "@acheaqui/domain";
import type { CotaPatrocinio, Resultado } from "@acheaqui/types";
import {
  ArquivoInvalido,
  TAMANHO_MAXIMO_FOTO,
  esquemaCotaPatrocinio,
  esquemaPatrocinio,
  identificarArquivo,
  lerDimensoes,
  limparMetadados,
} from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apagarArquivosPublicos, enderecoPublico, gravarArquivoPublico } from "./arquivos";
import { paraSlug } from "./texto";

const CIDADE = "rio-das-ostras";

export interface CotaAdmin {
  cota: CotaPatrocinio;
  nome: string;
  beneficios: string[];
  valor_centavos: number;
  valor_fundador_centavos: number;
  vagas: number | null;
  largura_logo: number;
  altura_logo: number;
  ordem: number;
}

export interface PatrocinioAdmin {
  id: string;
  cota: CotaPatrocinio;
  slug: string;
  nome: string;
  ramo: string;
  frase: string;
  whatsapp: string | null;
  logo_caminho: string | null;
  logo: string | null;
  grupo: string | null;
  categoria_id: string | null;
  categoria: string | null;
  situacao: "rascunho" | "no_ar" | "encerrado";
  inicio: string | null;
  fim: string | null;
  dias_somados: number;
  pagamento: { valor_centavos: number; preco_fundador: boolean; pago_em: string; observacao: string } | null;
  cliques: number;
}

type CodigoFalha = "DADOS_INVALIDOS" | "CONFLITO" | "ARQUIVO_INVALIDO" | "NAO_ENCONTRADO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string } };
const falha = (codigo: CodigoFalha, mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
const ok = <T>(dados: T): Resultado<T> => ({ ok: true, dados });

/** Mensagem do banco que pode ir para a tela (travas de vaga e de exclusividade); o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("CONFLITO", erro.message);
  if (erro.code === "23505") {
    if (erro.message.includes("um_por_ramo")) return falha("CONFLITO", "Já há uma empresa deste ramo no ar nesta cota.");
    if (erro.message.includes("um_por_grupo")) return falha("CONFLITO", "Este grupo já tem patrocinador no ar.");
    if (erro.message.includes("um_por_categoria")) return falha("CONFLITO", "Esta categoria já tem patrocinador no ar.");
  }
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

async function idDaCidade(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("cidades").select("id").eq("slug", CIDADE).single();
  if (error) console.error("idDaCidade falhou", { codigo: error.code, mensagem: error.message });
  return data?.id ?? null;
}

export async function listarCotasAdmin(supabase: SupabaseClient): Promise<Resultado<CotaAdmin[]>> {
  const { data, error } = await supabase
    .from("cotas_patrocinio")
    .select("cota, nome, beneficios, valor_centavos, valor_fundador_centavos, vagas, largura_logo, altura_logo, ordem")
    .order("ordem");
  if (error) return mensagemDoBanco(error, "listarCotasAdmin");
  return ok(data as CotaAdmin[]);
}

export async function listarPatrociniosAdmin(supabase: SupabaseClient): Promise<Resultado<PatrocinioAdmin[]>> {
  const { data, error } = await supabase
    .from("patrocinios")
    .select(
      "id, cota, slug, nome, ramo, frase, whatsapp, logo_caminho, grupo, categoria_id, situacao, inicio, fim, dias_somados, " +
        "categorias(nome_plural), pagamentos_patrocinio(valor_centavos, preco_fundador, pago_em, observacao), cliques_patrocinio(cliques)",
    )
    .order("situacao")
    .order("nome");
  if (error) return mensagemDoBanco(error, "listarPatrociniosAdmin");
  type Linha = Omit<PatrocinioAdmin, "logo" | "categoria" | "pagamento" | "cliques"> & {
    categorias: { nome_plural: string } | null;
    pagamentos_patrocinio: PatrocinioAdmin["pagamento"];
    cliques_patrocinio: { cliques: number }[];
  };
  return ok(
    (data as unknown as Linha[]).map(({ categorias, pagamentos_patrocinio, cliques_patrocinio, ...p }) => ({
      ...p,
      logo: p.logo_caminho ? enderecoPublico(p.logo_caminho) : null,
      categoria: categorias?.nome_plural ?? null,
      pagamento: pagamentos_patrocinio,
      cliques: cliques_patrocinio.reduce((soma, c) => soma + c.cliques, 0),
    })),
  );
}

export async function listarGruposECategorias(
  supabase: SupabaseClient,
): Promise<Resultado<{ grupos: string[]; categorias: { id: string; nome: string; grupo: string }[] }>> {
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome_plural, grupos_categoria(nome, ordem)")
    .eq("ativa", true)
    .order("nome_plural");
  if (error) return mensagemDoBanco(error, "listarGruposECategorias");
  const linhas = data as unknown as { id: string; nome_plural: string; grupos_categoria: { nome: string; ordem: number } }[];
  const grupos = [...new Map(linhas.map((l) => [l.grupos_categoria.nome, l.grupos_categoria.ordem])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([nome]) => nome);
  return ok({ grupos, categorias: linhas.map((l) => ({ id: l.id, nome: l.nome_plural, grupo: l.grupos_categoria.nome })) });
}

/**
 * Confere e prepara o logo: WebP de verdade, no tamanho exato da cota, até
 * 2 MB, sem metadados. A conversão para WebP no tamanho da cota é feita no
 * navegador; aqui nada é aceito só pelo nome ou pelo tipo informado.
 */
function prepararLogo(bytes: Uint8Array, cota: CotaAdmin): Resultado<Uint8Array> {
  if (bytes.length === 0 || bytes.length > TAMANHO_MAXIMO_FOTO) return falha("ARQUIVO_INVALIDO", "O logo precisa ter até 2 MB.");
  if (identificarArquivo(bytes) !== "webp") return falha("ARQUIVO_INVALIDO", "O logo não chegou no formato esperado. Escolha a imagem de novo.");
  try {
    const { largura, altura } = lerDimensoes(bytes, "webp");
    if (largura !== cota.largura_logo || altura !== cota.altura_logo) {
      return falha("ARQUIVO_INVALIDO", `O logo da cota ${cota.nome} precisa ter ${cota.largura_logo} × ${cota.altura_logo} pixels.`);
    }
    return ok(limparMetadados(bytes, "webp"));
  } catch (e) {
    if (e instanceof ArquivoInvalido) return falha("ARQUIVO_INVALIDO", e.message);
    throw e;
  }
}

/** Slug livre a partir do nome: construmar, construmar-2... */
async function slugLivre(supabase: SupabaseClient, nome: string, idAtual: string | null): Promise<string> {
  const base = paraSlug(nome).slice(0, 50) || "patrocinador";
  const { data } = await supabase.from("patrocinios").select("id, slug").like("slug", `${base}%`);
  const usados = new Set((data ?? []).filter((p) => p.id !== idAtual).map((p) => p.slug));
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Cria ou altera um patrocínio (o cadastro; entrar no ar é outra ação). O logo
 * é opcional na alteração: sem arquivo, fica o que já existe.
 */
export async function salvarPatrocinio(
  supabase: SupabaseClient,
  id: string | null,
  campos: Record<string, string>,
  logo: Uint8Array | null,
): Promise<Resultado<{ id: string }>> {
  const validado = esquemaPatrocinio.safeParse(campos);
  if (!validado.success) return falha("DADOS_INVALIDOS", validado.error.issues[0]?.message ?? "Dados inválidos.");
  const dados = validado.data;

  const cotas = await listarCotasAdmin(supabase);
  if (!cotas.ok) return cotas;
  const cota = cotas.dados.find((c) => c.cota === dados.cota);
  if (!cota) return falha("DADOS_INVALIDOS", "Cota desconhecida.");

  let anterior: { situacao: string; cota: string; logo_caminho: string | null } | null = null;
  if (id) {
    const { data, error } = await supabase.from("patrocinios").select("situacao, cota, logo_caminho").eq("id", id).maybeSingle();
    if (error) return mensagemDoBanco(error, "salvarPatrocinio");
    if (!data) return falha("NAO_ENCONTRADO", "Patrocínio não encontrado.");
    anterior = data;
    if (data.situacao === "no_ar" && data.cota !== dados.cota) {
      return falha("CONFLITO", "Para trocar a cota de um patrocínio no ar, encerre-o e cadastre de novo.");
    }
  }

  let caminhoNovo: string | null = null;
  if (logo) {
    const preparado = prepararLogo(logo, cota);
    if (!preparado.ok) return preparado;
    caminhoNovo = `patrocinadores/${crypto.randomUUID()}.webp`;
    try {
      await gravarArquivoPublico(caminhoNovo, preparado.dados, "webp");
    } catch (e) {
      console.error("salvarPatrocinio: gravar logo falhou", { erro: e instanceof Error ? e.message : String(e) });
      return ERRO_INTERNO;
    }
  } else if (anterior && anterior.cota !== dados.cota) {
    return falha("DADOS_INVALIDOS", "Ao trocar a cota, envie o logo no tamanho da nova cota.");
  }

  const registro = {
    cota: dados.cota,
    nome: dados.nome,
    ramo: dados.ramo,
    frase: dados.frase,
    whatsapp: dados.whatsapp,
    grupo: dados.grupo,
    categoria_id: dados.categoriaId,
    slug: await slugLivre(supabase, dados.nome, id),
    ...(caminhoNovo ? { logo_caminho: caminhoNovo } : {}),
  };

  const cidadeId = await idDaCidade(supabase);
  if (!cidadeId) return ERRO_INTERNO;
  const consulta = id
    ? supabase.from("patrocinios").update(registro).eq("id", id).select("id").single()
    : supabase.from("patrocinios").insert({ ...registro, cidade_id: cidadeId }).select("id").single();
  const { data, error } = await consulta;
  if (error) {
    if (caminhoNovo) await apagarLogo(caminhoNovo, "salvarPatrocinio: desfazer logo");
    return mensagemDoBanco(error, "salvarPatrocinio");
  }
  // O logo antigo sai do ar (e do cache) só depois que o novo foi gravado.
  if (caminhoNovo && anterior?.logo_caminho) await apagarLogo(anterior.logo_caminho, "salvarPatrocinio: logo antigo");
  return ok({ id: data.id as string });
}

async function apagarLogo(caminho: string, contexto: string): Promise<void> {
  try {
    await apagarArquivosPublicos([caminho]);
  } catch (e) {
    console.error(`${contexto} falhou`, { caminho, erro: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Coloca o patrocínio no ar a partir de um dia: confere as regras de vaga e de
 * exclusividade (packages/domain) e calcula o fim (12 meses).
 */
export async function colocarNoAr(supabase: SupabaseClient, id: string, inicio: string): Promise<Resultado<null>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return falha("DADOS_INVALIDOS", "Informe o dia em que o logo entra no ar.");
  const { data: alvo, error } = await supabase
    .from("patrocinios")
    .select("id, cota, ramo, grupo, categoria_id, logo_caminho, situacao, dias_somados")
    .eq("id", id)
    .maybeSingle();
  if (error) return mensagemDoBanco(error, "colocarNoAr");
  if (!alvo) return falha("NAO_ENCONTRADO", "Patrocínio não encontrado.");
  if (alvo.situacao === "no_ar") return falha("CONFLITO", "Este patrocínio já está no ar.");
  if (!alvo.logo_caminho) return falha("DADOS_INVALIDOS", "Envie o logo antes de colocar no ar.");

  const [{ data: noAr, error: erroNoAr }, { data: cota, error: erroCota }] = await Promise.all([
    supabase.from("patrocinios").select("id, cota, ramo, grupo, categoria_id").eq("situacao", "no_ar").eq("cota", alvo.cota),
    supabase.from("cotas_patrocinio").select("vagas").eq("cota", alvo.cota).single(),
  ]);
  if (erroNoAr || erroCota) return mensagemDoBanco((erroNoAr ?? erroCota)!, "colocarNoAr");
  const paraRegra = (p: { id: string; cota: CotaPatrocinio; ramo: string; grupo: string | null; categoria_id: string | null }): PatrocinioParaRegra => ({
    id: p.id,
    cota: p.cota,
    ramo: p.ramo,
    grupo: p.grupo ?? undefined,
    categoriaId: p.categoria_id ?? undefined,
  });
  const impedimento = impedimentoParaEntrarNoAr(paraRegra(alvo), (noAr ?? []).map(paraRegra), cota.vagas);
  if (impedimento) return falha("CONFLITO", impedimento);

  let fim: string;
  try {
    fim = fimDoPatrocinio(inicio, alvo.dias_somados);
  } catch {
    return falha("DADOS_INVALIDOS", "Dia de entrada no ar inválido.");
  }
  const { error: erroUpdate } = await supabase.from("patrocinios").update({ situacao: "no_ar", inicio, fim }).eq("id", id);
  return erroUpdate ? mensagemDoBanco(erroUpdate, "colocarNoAr") : ok(null);
}

/** Soma dias ao prazo (site fora do ar por mais de 3 dias seguidos) e recalcula o fim. */
export async function somarDiasAoPrazo(supabase: SupabaseClient, id: string, dias: number): Promise<Resultado<null>> {
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) return falha("DADOS_INVALIDOS", "Informe de 1 a 365 dias.");
  const { data: alvo, error } = await supabase.from("patrocinios").select("inicio, dias_somados").eq("id", id).maybeSingle();
  if (error) return mensagemDoBanco(error, "somarDiasAoPrazo");
  if (!alvo?.inicio) return falha("CONFLITO", "Só dá para somar dias a um patrocínio que já entrou no ar.");
  const total = alvo.dias_somados + dias;
  const { error: erroUpdate } = await supabase
    .from("patrocinios")
    .update({ dias_somados: total, fim: fimDoPatrocinio(alvo.inicio, total) })
    .eq("id", id);
  return erroUpdate ? mensagemDoBanco(erroUpdate, "somarDiasAoPrazo") : ok(null);
}

export async function encerrar(supabase: SupabaseClient, id: string): Promise<Resultado<null>> {
  const { error } = await supabase.from("patrocinios").update({ situacao: "encerrado" }).eq("id", id).eq("situacao", "no_ar");
  return error ? mensagemDoBanco(error, "encerrar") : ok(null);
}

/** Apaga um rascunho (nunca foi ao ar) e o logo dele. */
export async function apagarRascunho(supabase: SupabaseClient, id: string): Promise<Resultado<null>> {
  const { data, error } = await supabase.from("patrocinios").delete().eq("id", id).eq("situacao", "rascunho").select("logo_caminho");
  if (error) return mensagemDoBanco(error, "apagarRascunho");
  if (!data?.length) return falha("CONFLITO", "Só rascunhos podem ser apagados; patrocínio que foi ao ar fica no histórico.");
  if (data[0]!.logo_caminho) await apagarLogo(data[0]!.logo_caminho, "apagarRascunho: logo");
  return ok(null);
}

export async function registrarPagamento(
  supabase: SupabaseClient,
  id: string,
  campos: { valor: string; pagoEm: string; precoFundador: boolean; observacao: string },
): Promise<Resultado<null>> {
  const valor = Math.round(Number(campos.valor.replace(/\./g, "").replace(",", ".")) * 100);
  if (!Number.isFinite(valor) || valor <= 0) return falha("DADOS_INVALIDOS", "Valor pago inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(campos.pagoEm)) return falha("DADOS_INVALIDOS", "Informe o dia do pagamento.");
  const { error } = await supabase.from("pagamentos_patrocinio").upsert({
    patrocinio_id: id,
    valor_centavos: valor,
    pago_em: campos.pagoEm,
    preco_fundador: campos.precoFundador,
    observacao: campos.observacao.trim().slice(0, 300),
  });
  return error ? mensagemDoBanco(error, "registrarPagamento") : ok(null);
}

export async function salvarCota(supabase: SupabaseClient, cota: CotaPatrocinio, campos: Record<string, string>): Promise<Resultado<null>> {
  const validado = esquemaCotaPatrocinio.safeParse(campos);
  if (!validado.success) return falha("DADOS_INVALIDOS", validado.error.issues[0]?.message ?? "Dados inválidos.");
  const d = validado.data;
  const porGrupoOuCategoria = cota === "grupo" || cota === "categoria";
  const { error } = await supabase
    .from("cotas_patrocinio")
    .update({
      nome: d.nome,
      beneficios: d.beneficios,
      valor_centavos: d.valorCentavos,
      valor_fundador_centavos: d.valorFundadorCentavos,
      vagas: porGrupoOuCategoria ? null : (d.vagas ?? 1),
      largura_logo: d.larguraLogo,
      altura_logo: d.alturaLogo,
    })
    .eq("cota", cota);
  return error ? mensagemDoBanco(error, "salvarCota") : ok(null);
}
