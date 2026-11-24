// Destaques do bloco "Acontece em Rio das Ostras" na administração (decisões
// J1 a J5 de 24/11/2026). Tudo com a sessão do administrador, para a auditoria
// registrar quem fez; o RLS só deixa a administração gravar, e o banco repete
// as travas (migration 20261124134213). Regras em packages/domain/destaques.ts
// e esquema em packages/validation/destaque.ts.
import { contarDestaquesPorSituacao, momentoLocal, situacaoDoDestaque, somarDias, type SituacaoDestaque } from "@acheaqui/domain";
import type { OrigemEvento, Resultado, TipoDestaque } from "@acheaqui/types";
import { ArquivoInvalido, FORMATO_FOTO_PERFIL, TAMANHOS_FOTO, conferirVersaoFoto, esquemaDestaque, type TamanhoFoto } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apagarArquivosPublicos, caminhoFoto, caminhosFoto, enderecoPublico, gravarArquivoPublico, limparCacheDoSite } from "./arquivos";

const CIDADE = "rio-das-ostras";
/** Dias da coluna "últimos dias" dos cliques. */
export const DIAS_CLIQUES_RECENTES = 30;

type CodigoFalha = "DADOS_INVALIDOS" | "CONFLITO" | "ARQUIVO_INVALIDO" | "NAO_ENCONTRADO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string } };
const falha = (codigo: CodigoFalha, mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
const ok = <T>(dados: T): Resultado<T> => ({ ok: true, dados });

/** Mensagem das travas do banco (P0001) pode ir para a tela; o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("CONFLITO", erro.message);
  if (erro.code === "23514") return falha("DADOS_INVALIDOS", "Confira os campos do destaque: algum valor não foi aceito.");
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

export interface DestaqueAdmin {
  id: string;
  tipo: TipoDestaque;
  eventoId: string | null;
  eventoNome: string | null;
  eventoOrigem: OrigemEvento | null;
  eventoFim: string | null;
  titulo: string;
  texto: string;
  /** Versão de 800 px da imagem própria, ou do cartaz do evento. */
  imagem: string | null;
  imagemPropria: boolean;
  link: string | null;
  comercio: string | null;
  autorizadoPor: string | null;
  autorizadoEm: string | null;
  inicio: string;
  fim: string;
  ordem: number;
  ligado: boolean;
  situacao: SituacaoDestaque;
  cliquesTotal: number;
  cliquesRecentes: number;
}

export interface EventoParaDestaque {
  id: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
}

type Linha = {
  id: string;
  tipo: TipoDestaque;
  evento_id: string | null;
  titulo: string;
  texto: string;
  imagem_chave: string | null;
  link: string | null;
  comercio: string | null;
  autorizado_por: string | null;
  autorizado_em: string | null;
  inicio: string;
  fim: string;
  ordem: number;
  ligado: boolean;
  eventos: { nome: string; origem: OrigemEvento; data_fim: string; cartaz_chave: string | null } | null;
};

const COLUNAS =
  "id, tipo, evento_id, titulo, texto, imagem_chave, link, comercio, autorizado_por, autorizado_em, inicio, fim, ordem, ligado, " +
  "eventos(nome, origem, data_fim, cartaz_chave)";

const imagem800 = (chave: string | null | undefined) => (chave ? enderecoPublico(caminhoFoto(chave, 800, FORMATO_FOTO_PERFIL)) : null);

function paraAdmin(l: Linha, hoje: string, cliques: Map<string, { total: number; recentes: number }>): DestaqueAdmin {
  const base = { inicio: l.inicio, fim: l.fim, ligado: l.ligado, ordem: l.ordem, eventoFim: l.eventos?.data_fim ?? null };
  return {
    id: l.id,
    tipo: l.tipo,
    eventoId: l.evento_id,
    eventoNome: l.eventos?.nome ?? null,
    eventoOrigem: l.eventos?.origem ?? null,
    eventoFim: l.eventos?.data_fim ?? null,
    titulo: l.titulo,
    texto: l.texto,
    imagem: imagem800(l.imagem_chave) ?? imagem800(l.eventos?.cartaz_chave),
    imagemPropria: l.imagem_chave !== null,
    link: l.link,
    comercio: l.comercio,
    autorizadoPor: l.autorizado_por,
    autorizadoEm: l.autorizado_em,
    inicio: l.inicio,
    fim: l.fim,
    ordem: l.ordem,
    ligado: l.ligado,
    situacao: situacaoDoDestaque(base, hoje),
    cliquesTotal: cliques.get(l.id)?.total ?? 0,
    cliquesRecentes: cliques.get(l.id)?.recentes ?? 0,
  };
}

async function lerCliques(supabase: SupabaseClient, hoje: string): Promise<Map<string, { total: number; recentes: number }> | null> {
  const { data, error } = await supabase.from("cliques_destaque").select("destaque_id, dia, cliques");
  if (error) {
    console.error("lerCliques (destaques) falhou", { codigo: error.code, mensagem: error.message });
    return null;
  }
  const desde = somarDias(hoje, -(DIAS_CLIQUES_RECENTES - 1));
  const mapa = new Map<string, { total: number; recentes: number }>();
  for (const c of data as { destaque_id: string; dia: string; cliques: number }[]) {
    const atual = mapa.get(c.destaque_id) ?? { total: 0, recentes: 0 };
    atual.total += c.cliques;
    if (c.dia >= desde) atual.recentes += c.cliques;
    mapa.set(c.destaque_id, atual);
  }
  return mapa;
}

/** Todos os destaques, com a situação de hoje, os cliques e a contagem por situação. */
export async function listarDestaquesAdmin(
  supabase: SupabaseClient,
): Promise<Resultado<{ destaques: DestaqueAdmin[]; contagem: Record<SituacaoDestaque, number> }>> {
  const hoje = momentoLocal(new Date()).data;
  const [{ data, error }, cliques] = await Promise.all([
    supabase.from("destaques").select(COLUNAS).order("ordem").order("inicio", { ascending: false }),
    lerCliques(supabase, hoje),
  ]);
  if (error) return mensagemDoBanco(error, "listarDestaquesAdmin");
  if (!cliques) return ERRO_INTERNO;
  const destaques = (data as unknown as Linha[]).map((l) => paraAdmin(l, hoje, cliques));
  return ok({ destaques, contagem: contarDestaquesPorSituacao(destaques, hoje) });
}

export async function lerDestaqueAdmin(supabase: SupabaseClient, id: string): Promise<Resultado<DestaqueAdmin>> {
  const hoje = momentoLocal(new Date()).data;
  const [{ data, error }, cliques] = await Promise.all([supabase.from("destaques").select(COLUNAS).eq("id", id).maybeSingle(), lerCliques(supabase, hoje)]);
  if (error) return mensagemDoBanco(error, "lerDestaqueAdmin");
  if (!data) return falha("NAO_ENCONTRADO", "Destaque não encontrado.");
  if (!cliques) return ERRO_INTERNO;
  return ok(paraAdmin(data as unknown as Linha, hoje, cliques));
}

/**
 * Eventos publicados que ainda não terminaram, para escolher no destaque de
 * evento. Se o escolhido não estiver liberado (sem pagamento nem cortesia), o
 * banco recusa com a explicação (J3).
 */
export async function eventosParaDestaque(supabase: SupabaseClient): Promise<Resultado<EventoParaDestaque[]>> {
  const { data, error } = await supabase
    .from("eventos")
    .select("id, nome, data_inicio, data_fim")
    .eq("situacao", "publicado")
    .gte("data_fim", momentoLocal(new Date()).data)
    .order("data_inicio");
  if (error) return mensagemDoBanco(error, "eventosParaDestaque");
  return ok((data as { id: string; nome: string; data_inicio: string; data_fim: string }[]).map((e) => ({ id: e.id, nome: e.nome, dataInicio: e.data_inicio, dataFim: e.data_fim })));
}

/** Três versões da imagem (até 2 MB cada) mais os campos de texto. */
const TAMANHO_MAXIMO_PEDIDO = 6 * 1024 * 1024 + 64 * 1024;

async function versoesEnviadas(f: FormData): Promise<Partial<Record<TamanhoFoto, Uint8Array>>> {
  const versoes: Partial<Record<TamanhoFoto, Uint8Array>> = {};
  for (const t of TAMANHOS_FOTO) {
    const arquivo = f.get(`cartaz_${t}`);
    if (arquivo instanceof File && arquivo.size > 0) versoes[t] = new Uint8Array(await arquivo.arrayBuffer());
  }
  return versoes;
}

/** Confere e grava as três versões da imagem (JPEG, sem a localização, geradas no navegador). */
async function gravarImagem(
  id: string,
  versoes: Partial<Record<TamanhoFoto, Uint8Array>>,
): Promise<Resultado<{ chave: string; largura: number; altura: number }>> {
  const conferidas: { tamanho: TamanhoFoto; arquivo: Uint8Array; largura: number; altura: number }[] = [];
  try {
    for (const tamanho of TAMANHOS_FOTO) {
      const bytes = versoes[tamanho];
      if (!bytes) return falha("DADOS_INVALIDOS", `Falta a versão de ${tamanho} px da imagem. Escolha a imagem de novo.`);
      const v = conferirVersaoFoto(bytes, tamanho);
      if (v.formato !== FORMATO_FOTO_PERFIL) return falha("ARQUIVO_INVALIDO", "A imagem precisa chegar em JPEG. Escolha a imagem de novo.");
      conferidas.push({ tamanho, arquivo: v.arquivo, largura: v.largura, altura: v.altura });
    }
  } catch (e) {
    if (e instanceof ArquivoInvalido) return falha("ARQUIVO_INVALIDO", `Imagem recusada: ${e.message}`);
    throw e;
  }
  const chave = `destaques/${id}/${crypto.randomUUID()}`;
  try {
    await Promise.all(conferidas.map((v) => gravarArquivoPublico(caminhoFoto(chave, v.tamanho, FORMATO_FOTO_PERFIL), v.arquivo, FORMATO_FOTO_PERFIL)));
  } catch (e) {
    console.error("gravarImagem (destaque) falhou", { erro: e instanceof Error ? e.message : String(e) });
    return ERRO_INTERNO;
  }
  const maior = conferidas[conferidas.length - 1]!;
  return ok({ chave, largura: maior.largura, altura: maior.altura });
}

async function apagarImagem(chave: string, contexto: string): Promise<void> {
  try {
    await apagarArquivosPublicos(caminhosFoto(chave, FORMATO_FOTO_PERFIL));
  } catch (e) {
    // O destaque já foi gravado; o arquivo que sobrou fica registrado para limpeza manual.
    console.error(`${contexto}: arquivos não apagados`, { chave, erro: e instanceof Error ? e.message : String(e) });
  }
}

async function idDaCidade(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("cidades").select("id").eq("slug", CIDADE).single();
  if (error) console.error("destaques: idDaCidade falhou", { codigo: error.code, mensagem: error.message });
  return data?.id ?? null;
}

/**
 * Cria (sem id) ou altera um destaque, com a imagem nova quando enviada. A
 * imagem antiga sai do ar só depois que a nova foi gravada; se o banco recusar,
 * a nova é apagada. Limpa o cache do site, porque a página inicial muda.
 */
export async function salvarDestaque(
  supabase: SupabaseClient,
  request: Request,
  id: string | null,
  origemDoSite: string,
): Promise<Resultado<{ id: string }>> {
  const tamanho = Number(request.headers.get("content-length") ?? "0");
  if (!tamanho || tamanho > TAMANHO_MAXIMO_PEDIDO) return falha("DADOS_INVALIDOS", "Envio maior que o permitido (imagem de até 2 MB).");
  const f = await request.formData();
  const campo = (nome: string) => String(f.get(nome) ?? "").slice(0, 400);
  const v = esquemaDestaque.safeParse({
    tipo: campo("tipo"),
    eventoId: campo("eventoId"),
    titulo: campo("titulo"),
    texto: campo("texto"),
    link: campo("link"),
    comercio: campo("comercio"),
    autorizadoPor: campo("autorizadoPor"),
    autorizadoEm: campo("autorizadoEm"),
    inicio: campo("inicio"),
    fim: campo("fim"),
    ordem: campo("ordem") || "0",
    ligado: campo("ligado"),
  });
  if (!v.success) return falha("DADOS_INVALIDOS", v.error.issues[0]?.message ?? "Dados inválidos.");
  const d = v.data;

  let anterior: string | null = null;
  if (id) {
    const { data: atual, error } = await supabase.from("destaques").select("imagem_chave").eq("id", id).maybeSingle();
    if (error) return mensagemDoBanco(error, "salvarDestaque");
    if (!atual) return falha("NAO_ENCONTRADO", "Destaque não encontrado.");
    anterior = atual.imagem_chave as string | null;
  }
  const destino = id ?? crypto.randomUUID();

  const versoes = await versoesEnviadas(f);
  let nova: { chave: string; largura: number; altura: number } | null = null;
  if (Object.keys(versoes).length > 0) {
    const r = await gravarImagem(destino, versoes);
    if (!r.ok) return r;
    nova = r.dados;
  } else if (d.tipo !== "evento" && !anterior) {
    return falha("DADOS_INVALIDOS", "Escolha a imagem do destaque.");
  }

  const cidadeId = id ? null : await idDaCidade(supabase);
  if (!id && !cidadeId) return ERRO_INTERNO;
  // Comércio citado só na campanha: o do evento já vem do próprio evento.
  const comercio = d.tipo === "campanha" && d.comercio !== "" ? d.comercio : null;
  const linha = {
    tipo: d.tipo,
    evento_id: d.tipo === "evento" ? d.eventoId : null,
    titulo: d.titulo,
    texto: d.texto,
    link: d.tipo === "evento" ? null : d.link,
    comercio,
    autorizado_por: comercio ? d.autorizadoPor : null,
    autorizado_em: comercio ? d.autorizadoEm : null,
    inicio: d.inicio,
    fim: d.fim,
    ordem: d.ordem,
    ligado: d.ligado,
    ...(nova ? { imagem_chave: nova.chave, imagem_largura: nova.largura, imagem_altura: nova.altura } : {}),
  };
  const { error } = id
    ? await supabase.from("destaques").update(linha).eq("id", id)
    : await supabase.from("destaques").insert({ ...linha, id: destino, cidade_id: cidadeId });
  if (error) {
    if (nova) await apagarImagem(nova.chave, "salvarDestaque: desfazer");
    return mensagemDoBanco(error, "salvarDestaque");
  }
  if (nova && anterior) await apagarImagem(anterior, "salvarDestaque: imagem antiga");
  await limparCacheDoSite(origemDoSite);
  return ok({ id: destino });
}

/** Apaga o destaque, os cliques dele e a imagem própria. */
export async function apagarDestaque(supabase: SupabaseClient, id: string, origemDoSite: string): Promise<Resultado<null>> {
  const { data, error } = await supabase.from("destaques").delete().eq("id", id).select("imagem_chave").maybeSingle();
  if (error) return mensagemDoBanco(error, "apagarDestaque");
  if (!data) return falha("NAO_ENCONTRADO", "Destaque não encontrado.");
  if (data.imagem_chave) await apagarImagem(data.imagem_chave as string, "apagarDestaque");
  await limparCacheDoSite(origemDoSite);
  return ok(null);
}
