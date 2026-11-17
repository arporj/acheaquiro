// Agenda na administração: eventos (dados, cartaz, programação, barracas,
// publicação e cortesia), artistas e estilos musicais. Tudo com a sessão de
// quem está logado, para a auditoria registrar quem fez; o RLS decide o que
// cada papel pode alterar. Regras em packages/domain/agenda.ts e esquemas em
// packages/validation/agenda.ts; o banco repete as travas (migration da Agenda).
import { blocosDoEventoAvulso, impedimentoParaAparecerNaAgenda, momentoLocal, problemaNasDatasDoEvento, diaDentroDoEvento } from "@acheaqui/domain";
import type { OrigemEvento, Resultado } from "@acheaqui/types";
import {
  ArquivoInvalido,
  FORMATO_FOTO_PERFIL,
  TAMANHOS_FOTO,
  conferirVersaoFoto,
  esquemaArtista,
  esquemaBarraca,
  esquemaCortesia,
  esquemaEstiloMusical,
  esquemaEvento,
  esquemaItemProgramacao,
  type ClassificacaoEtaria,
  type TamanhoFoto,
  type TipoEntrada,
} from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apagarArquivosPublicos, caminhoFoto, caminhosFoto, enderecoPublico, gravarArquivoPublico } from "./arquivos";
import { paraSlug } from "./texto";

const CIDADE = "rio-das-ostras";

type CodigoFalha = "DADOS_INVALIDOS" | "CONFLITO" | "ARQUIVO_INVALIDO" | "NAO_ENCONTRADO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string } };
const falha = (codigo: CodigoFalha, mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
const ok = <T>(dados: T): Resultado<T> => ({ ok: true, dados });

/** Mensagem das travas do banco (P0001) pode ir para a tela; o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("CONFLITO", erro.message);
  if (erro.code === "23505") return falha("CONFLITO", "Já existe um cadastro com este nome.");
  if (erro.code === "23503") return falha("CONFLITO", "Este item está em uso e não pode ser apagado.");
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

async function idDaCidade(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("cidades").select("id").eq("slug", CIDADE).single();
  if (error) console.error("agenda: idDaCidade falhou", { codigo: error.code, mensagem: error.message });
  return data?.id ?? null;
}

const hoje = () => momentoLocal(new Date()).data;

/** Endereço livre a partir do nome, na tabela indicada: festa-junina, festa-junina-2... */
async function slugLivre(supabase: SupabaseClient, tabela: "eventos" | "artistas", nome: string, idAtual: string | null, reserva: string): Promise<string> {
  const base = paraSlug(nome).slice(0, 70) || reserva;
  const { data, error } = await supabase.from(tabela).select("id, slug").like("slug", `${base}%`);
  if (error) console.error("agenda: slugLivre falhou", { tabela, codigo: error.code, mensagem: error.message });
  const usados = new Set((data ?? []).filter((r) => r.id !== idAtual).map((r) => r.slug as string));
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Anunciante pelo endereço do perfil ("https://acheaquiro.com.br/perfil/bar-do-ze",
 * "/perfil/bar-do-ze" ou "bar-do-ze"). Vazio: nenhum.
 */
async function anuncianteDoEndereco(supabase: SupabaseClient, texto: string): Promise<Resultado<{ id: string; nome: string } | null>> {
  const limpo = texto.trim();
  if (!limpo) return ok(null);
  const slug = limpo.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return falha("DADOS_INVALIDOS", "Endereço do perfil inválido: cole o link do perfil no Ache Aqui.");
  const { data, error } = await supabase.from("anunciantes").select("id, nome").eq("slug", slug).maybeSingle();
  if (error) return mensagemDoBanco(error, "anuncianteDoEndereco");
  if (!data) return falha("NAO_ENCONTRADO", "Nenhum perfil com este endereço.");
  return ok({ id: data.id as string, nome: data.nome as string });
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

export type SituacaoEvento = "rascunho" | "publicado" | "cancelado";

interface AnuncianteDoEvento {
  id: string;
  nome: string;
  slug: string;
  status: string;
  categoria_principal_id: string;
  planos: { inclui_agenda: boolean } | null;
  anunciante_categorias: { categoria_id: string }[];
}

export interface EventoResumoAdmin {
  id: string;
  slug: string;
  nome: string;
  origem: OrigemEvento;
  situacao: SituacaoEvento;
  data_inicio: string;
  data_fim: string;
  local: string;
  bairro: string;
  anunciante: { nome: string; slug: string } | null;
  cortesia: boolean;
  /** Por que o evento publicado não aparece na Agenda (null: aparece, ou não está publicado). */
  impedimento: string | null;
}

export interface ItemProgramacaoAdmin {
  id: string;
  dia: string;
  inicio: string;
  fim: string | null;
  titulo: string | null;
  artista: { id: string; nome: string; slug: string } | null;
}

export interface BarracaAdmin {
  id: string;
  nome: string;
  vende: string;
  whatsapp: string | null;
  anunciante: { nome: string; slug: string } | null;
}

export interface EventoAdmin extends EventoResumoAdmin {
  descricao: string;
  produtor: string | null;
  endereco: string | null;
  bairro_id: string;
  entrada: TipoEntrada;
  couvert_centavos: number | null;
  ingressos: { nome: string; valorCentavos: number }[];
  aberto_ao_publico: boolean;
  classificacao: ClassificacaoEtaria | null;
  cadeira_de_praia: boolean | null;
  cooler: boolean | null;
  ruas_fechadas: string | null;
  cartaz: string | null;
  cortesia_motivo: string | null;
  cortesia_em: string | null;
  programacao: ItemProgramacaoAdmin[];
  barracas: BarracaAdmin[];
}

const CAMPOS_RESUMO =
  "id, slug, nome, origem, situacao, data_inicio, data_fim, local, cortesia_em, bairros(nome), pagamentos(blocos, devolvido_em), " +
  "anunciantes(id, nome, slug, status, categoria_principal_id, planos!anunciantes_plano_id_fkey(inclui_agenda), anunciante_categorias(categoria_id), " +
  "extras_contratados(encerrado_em, extras(codigo)))";

type LinhaResumo = Omit<EventoResumoAdmin, "bairro" | "anunciante" | "cortesia" | "impedimento"> & {
  cortesia_em: string | null;
  bairros: { nome: string } | null;
  pagamentos: { blocos: number; devolvido_em: string | null }[];
  anunciantes: (AnuncianteDoEvento & { extras_contratados: { encerrado_em: string | null; extras: { codigo: string } }[] }) | null;
};

async function idCategoriaMusicos(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("categorias").select("id").eq("slug_lista", "musicos-e-bandas").maybeSingle();
  if (error) console.error("agenda: categoria Músicos e bandas não lida", { codigo: error.code, mensagem: error.message });
  return (data?.id as string | undefined) ?? null;
}

/**
 * Monta o resumo e confere se o evento aparece na Agenda pela regra do domínio
 * (a mesma de interno.evento_liberado): o extra Agenda em vigor do comércio e
 * os blocos de 7 dias pagos do evento avulso.
 */
function paraResumo(linha: LinhaResumo, musicos: string | null): EventoResumoAdmin {
  const { bairros, anunciantes: a, pagamentos, ...resto } = linha;
  const blocosPagos = pagamentos.filter((p) => p.devolvido_em === null).reduce((soma, p) => soma + p.blocos, 0);
  const impedimento =
    linha.situacao === "publicado"
      ? impedimentoParaAparecerNaAgenda({
          origem: linha.origem,
          anuncioNoAr: a?.status === "publicado",
          planoIncluiAgenda: Boolean(a?.planos?.inclui_agenda),
          extraAgendaEmDia: Boolean(a?.extras_contratados.some((c) => c.encerrado_em === null && c.extras.codigo === "agenda")),
          pago: blocosPagos > 0 && blocosPagos >= blocosDoEventoAvulso(linha.data_inicio, linha.data_fim),
          anuncioDeArtista: Boolean(a && musicos && (a.categoria_principal_id === musicos || a.anunciante_categorias.some((c) => c.categoria_id === musicos))),
          cortesia: linha.cortesia_em !== null,
        })
      : null;
  return {
    ...resto,
    bairro: bairros?.nome ?? "",
    anunciante: a ? { nome: a.nome, slug: a.slug } : null,
    cortesia: linha.cortesia_em !== null,
    impedimento,
  };
}

export type FiltroEventosAdmin = "proximos" | "passados";

export async function listarEventosAdmin(supabase: SupabaseClient, filtro: FiltroEventosAdmin): Promise<Resultado<EventoResumoAdmin[]>> {
  let consulta = supabase.from("eventos").select(CAMPOS_RESUMO);
  consulta = filtro === "proximos" ? consulta.gte("data_fim", hoje()).order("data_inicio") : consulta.lt("data_fim", hoje()).order("data_inicio", { ascending: false });
  const [{ data, error }, musicos] = await Promise.all([consulta.limit(300), idCategoriaMusicos(supabase)]);
  if (error) return mensagemDoBanco(error, "listarEventosAdmin");
  return ok((data as unknown as LinhaResumo[]).map((l) => paraResumo(l, musicos)));
}

export async function lerEventoAdmin(supabase: SupabaseClient, id: string): Promise<Resultado<EventoAdmin>> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return falha("NAO_ENCONTRADO", "Evento não encontrado.");
  const [{ data, error }, musicos] = await Promise.all([
    supabase
      .from("eventos")
      .select(
        `${CAMPOS_RESUMO}, descricao, produtor, endereco, bairro_id, entrada, couvert_centavos, ingressos, aberto_ao_publico, classificacao, ` +
          "cadeira_de_praia, cooler, ruas_fechadas, cartaz_chave, cortesia_motivo, " +
          "programacao_evento(id, dia, inicio, fim, titulo, artistas(id, nome, slug)), " +
          "barracas_evento(id, nome, vende, whatsapp, ordem, anunciantes(nome, slug))",
      )
      .eq("id", id)
      .maybeSingle(),
    idCategoriaMusicos(supabase),
  ]);
  if (error) return mensagemDoBanco(error, "lerEventoAdmin");
  if (!data) return falha("NAO_ENCONTRADO", "Evento não encontrado.");
  type Linha = LinhaResumo &
    Omit<EventoAdmin, keyof EventoResumoAdmin | "cartaz" | "programacao" | "barracas"> & {
      cartaz_chave: string | null;
      programacao_evento: (Omit<ItemProgramacaoAdmin, "artista"> & { artistas: ItemProgramacaoAdmin["artista"] })[];
      barracas_evento: (Omit<BarracaAdmin, "anunciante"> & { ordem: number; anunciantes: BarracaAdmin["anunciante"] })[];
    };
  const linha = data as unknown as Linha;
  const { programacao_evento, barracas_evento, cartaz_chave, ...resto } = linha;
  return ok({
    ...resto,
    ...paraResumo(linha, musicos),
    cartaz: cartaz_chave ? enderecoPublico(caminhoFoto(cartaz_chave, 800, FORMATO_FOTO_PERFIL)) : null,
    programacao: programacao_evento
      .map(({ artistas, ...p }) => ({ ...p, inicio: p.inicio.slice(0, 5), fim: p.fim?.slice(0, 5) ?? null, artista: artistas }))
      .sort((a, b) => `${a.dia}${a.inicio}`.localeCompare(`${b.dia}${b.inicio}`)),
    barracas: barracas_evento
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
      .map((b) => ({ id: b.id, nome: b.nome, vende: b.vende, whatsapp: b.whatsapp, anunciante: b.anunciantes })),
  });
}

/** Campos do formulário do evento (os ingressos chegam em listas paralelas). */
function camposDoEvento(f: FormData): Record<string, unknown> {
  const texto = (nome: string) => String(f.get(nome) ?? "").slice(0, 2100);
  const nomes = f.getAll("ingresso_nome").map(String);
  const valores = f.getAll("ingresso_valor").map(String);
  return {
    origem: texto("origem"),
    nome: texto("nome"),
    descricao: texto("descricao"),
    produtor: texto("produtor"),
    local: texto("local"),
    endereco: texto("endereco"),
    bairroId: texto("bairro"),
    dataInicio: texto("data_inicio"),
    dataFim: texto("data_fim"),
    entrada: texto("entrada"),
    couvert: texto("couvert"),
    ingressos: nomes.slice(0, 20).map((nome, i) => ({ nome, valor: valores[i] ?? "" })),
    abertoAoPublico: texto("aberto_ao_publico"),
    classificacao: texto("classificacao"),
    cadeiraDePraia: texto("cadeira_de_praia"),
    cooler: texto("cooler"),
    ruasFechadas: texto("ruas_fechadas"),
  };
}

/**
 * Cria ou altera o cadastro do evento (publicar, cancelar e cortesia são outras
 * ações). O endereço da página (slug) é escolhido na criação e não muda depois,
 * para não quebrar links já compartilhados.
 */
export async function salvarEvento(supabase: SupabaseClient, id: string | null, f: FormData): Promise<Resultado<{ id: string }>> {
  const perfil = await anuncianteDoEndereco(supabase, String(f.get("perfil") ?? "").slice(0, 300));
  if (!perfil.ok) return perfil;
  const validado = esquemaEvento.safeParse({ ...camposDoEvento(f), anuncianteId: perfil.dados?.id ?? "" });
  if (!validado.success) return falha("DADOS_INVALIDOS", validado.error.issues[0]?.message ?? "Dados inválidos.");
  const d = validado.data;
  const problema = problemaNasDatasDoEvento({ inicio: d.dataInicio, fim: d.dataFim, hoje: hoje() });
  if (problema) return falha("DADOS_INVALIDOS", problema);

  const registro = {
    origem: d.origem,
    anunciante_id: d.origem === "comercio" || d.origem === "artista" ? d.anuncianteId : null,
    nome: d.nome,
    descricao: d.descricao,
    produtor: d.produtor,
    local: d.local,
    endereco: d.endereco,
    bairro_id: d.bairroId,
    data_inicio: d.dataInicio,
    data_fim: d.dataFim,
    entrada: d.entrada,
    couvert_centavos: d.couvertCentavos,
    ingressos: d.ingressos,
    aberto_ao_publico: d.abertoAoPublico,
    classificacao: d.classificacao,
    cadeira_de_praia: d.cadeiraDePraia,
    cooler: d.cooler,
    ruas_fechadas: d.ruasFechadas,
  };
  if (id) {
    const { data, error } = await supabase.from("eventos").update(registro).eq("id", id).select("id").maybeSingle();
    if (error) return mensagemDoBanco(error, "salvarEvento");
    if (!data) return falha("NAO_ENCONTRADO", "Evento não encontrado.");
    return ok({ id });
  }
  const cidadeId = await idDaCidade(supabase);
  if (!cidadeId) return ERRO_INTERNO;
  const slug = await slugLivre(supabase, "eventos", d.nome, null, "evento");
  const { data, error } = await supabase.from("eventos").insert({ ...registro, cidade_id: cidadeId, slug }).select("id").single();
  if (error) return mensagemDoBanco(error, "salvarEvento");
  return ok({ id: data.id as string });
}

export async function mudarSituacaoEvento(supabase: SupabaseClient, id: string, situacao: string): Promise<Resultado<null>> {
  if (situacao !== "rascunho" && situacao !== "publicado" && situacao !== "cancelado") return falha("DADOS_INVALIDOS", "Situação inválida.");
  const { data, error } = await supabase.from("eventos").update({ situacao }).eq("id", id).select("id").maybeSingle();
  if (error) return mensagemDoBanco(error, "mudarSituacaoEvento");
  if (!data) return falha("NAO_ENCONTRADO", "Evento não encontrado.");
  return ok(null);
}

/** Dá (com motivo) ou tira (motivo vazio) a cortesia do evento avulso (decisão C1 de 17/11/2026). */
export async function salvarCortesia(supabase: SupabaseClient, id: string, motivo: string): Promise<Resultado<null>> {
  let valor: string | null = null;
  if (motivo.trim()) {
    const validado = esquemaCortesia.safeParse({ motivo });
    if (!validado.success) return falha("DADOS_INVALIDOS", validado.error.issues[0]?.message ?? "Motivo inválido.");
    valor = validado.data.motivo;
  }
  const { data, error } = await supabase.from("eventos").update({ cortesia_motivo: valor }).eq("id", id).select("id").maybeSingle();
  if (error) {
    if (error.code === "23514") return falha("DADOS_INVALIDOS", "A cortesia vale só para o evento avulso.");
    return mensagemDoBanco(error, "salvarCortesia");
  }
  if (!data) return falha("NAO_ENCONTRADO", "Evento não encontrado.");
  return ok(null);
}

/**
 * Grava o cartaz em JPEG (a prévia do WhatsApp só garante JPEG), nas três
 * versões geradas no navegador, sem a localização. O cartaz antigo sai do ar
 * (e do cache) só depois que o novo foi gravado.
 */
export async function salvarCartaz(
  supabase: SupabaseClient,
  id: string,
  versoes: Partial<Record<TamanhoFoto, Uint8Array>>,
): Promise<Resultado<null>> {
  const { data: atual, error: erroAtual } = await supabase.from("eventos").select("id, cartaz_chave").eq("id", id).maybeSingle();
  if (erroAtual) return mensagemDoBanco(erroAtual, "salvarCartaz");
  if (!atual) return falha("NAO_ENCONTRADO", "Evento não encontrado.");

  const conferidas: { tamanho: TamanhoFoto; arquivo: Uint8Array; largura: number; altura: number }[] = [];
  try {
    for (const tamanho of TAMANHOS_FOTO) {
      const bytes = versoes[tamanho];
      if (!bytes) return falha("DADOS_INVALIDOS", `Falta a versão de ${tamanho} px do cartaz. Escolha a imagem de novo.`);
      const v = conferirVersaoFoto(bytes, tamanho);
      if (v.formato !== FORMATO_FOTO_PERFIL) return falha("ARQUIVO_INVALIDO", "O cartaz precisa chegar em JPEG. Escolha a imagem de novo.");
      conferidas.push({ tamanho, arquivo: v.arquivo, largura: v.largura, altura: v.altura });
    }
  } catch (e) {
    if (e instanceof ArquivoInvalido) return falha("ARQUIVO_INVALIDO", `Cartaz recusado: ${e.message}`);
    throw e;
  }

  const chave = `eventos/${id}/${crypto.randomUUID()}`;
  try {
    await Promise.all(conferidas.map((v) => gravarArquivoPublico(caminhoFoto(chave, v.tamanho, FORMATO_FOTO_PERFIL), v.arquivo, FORMATO_FOTO_PERFIL)));
  } catch (e) {
    console.error("salvarCartaz: gravar arquivos falhou", { erro: e instanceof Error ? e.message : String(e) });
    return ERRO_INTERNO;
  }
  const maior = conferidas[conferidas.length - 1]!;
  const { error } = await supabase.from("eventos").update({ cartaz_chave: chave, cartaz_largura: maior.largura, cartaz_altura: maior.altura }).eq("id", id);
  if (error) {
    await apagarCartazGuardado(chave, "salvarCartaz: desfazer");
    return mensagemDoBanco(error, "salvarCartaz");
  }
  if (atual.cartaz_chave) await apagarCartazGuardado(atual.cartaz_chave as string, "salvarCartaz: cartaz antigo");
  return ok(null);
}

export async function tirarCartaz(supabase: SupabaseClient, id: string): Promise<Resultado<null>> {
  const { data: atual, error: erroAtual } = await supabase.from("eventos").select("cartaz_chave").eq("id", id).maybeSingle();
  if (erroAtual) return mensagemDoBanco(erroAtual, "tirarCartaz");
  if (!atual) return falha("NAO_ENCONTRADO", "Evento não encontrado.");
  if (!atual.cartaz_chave) return ok(null);
  const { error } = await supabase.from("eventos").update({ cartaz_chave: null, cartaz_largura: null, cartaz_altura: null }).eq("id", id);
  if (error) return mensagemDoBanco(error, "tirarCartaz");
  await apagarCartazGuardado(atual.cartaz_chave as string, "tirarCartaz");
  return ok(null);
}

async function apagarCartazGuardado(chave: string, contexto: string): Promise<void> {
  try {
    await apagarArquivosPublicos(caminhosFoto(chave, FORMATO_FOTO_PERFIL));
  } catch (e) {
    console.error(`${contexto}: apagar arquivos falhou`, { chave, erro: e instanceof Error ? e.message : String(e) });
  }
}

export async function adicionarProgramacao(supabase: SupabaseClient, eventoId: string, f: FormData): Promise<Resultado<null>> {
  const texto = (nome: string) => String(f.get(nome) ?? "").slice(0, 200);
  const validado = esquemaItemProgramacao.safeParse({
    dia: texto("dia"),
    inicio: texto("inicio"),
    fim: texto("fim"),
    artistaId: texto("artista"),
    titulo: texto("titulo"),
  });
  if (!validado.success) return falha("DADOS_INVALIDOS", validado.error.issues[0]?.message ?? "Dados inválidos.");
  const d = validado.data;
  const { data: evento, error: erroEvento } = await supabase.from("eventos").select("data_inicio, data_fim").eq("id", eventoId).maybeSingle();
  if (erroEvento) return mensagemDoBanco(erroEvento, "adicionarProgramacao");
  if (!evento) return falha("NAO_ENCONTRADO", "Evento não encontrado.");
  if (!diaDentroDoEvento(d.dia, { inicio: evento.data_inicio as string, fim: evento.data_fim as string })) {
    return falha("DADOS_INVALIDOS", "O dia precisa estar entre o primeiro e o último dia do evento.");
  }
  const { error } = await supabase
    .from("programacao_evento")
    .insert({ evento_id: eventoId, dia: d.dia, inicio: d.inicio, fim: d.fim, artista_id: d.artistaId, titulo: d.titulo });
  if (error) return mensagemDoBanco(error, "adicionarProgramacao");
  return ok(null);
}

export async function apagarProgramacao(supabase: SupabaseClient, eventoId: string, itemId: string): Promise<Resultado<null>> {
  const { error } = await supabase.from("programacao_evento").delete().eq("id", itemId).eq("evento_id", eventoId);
  if (error) return mensagemDoBanco(error, "apagarProgramacao");
  return ok(null);
}

export async function adicionarBarraca(supabase: SupabaseClient, eventoId: string, f: FormData): Promise<Resultado<null>> {
  const texto = (nome: string) => String(f.get(nome) ?? "").slice(0, 300);
  const perfil = await anuncianteDoEndereco(supabase, texto("perfil"));
  if (!perfil.ok) return perfil;
  const validado = esquemaBarraca.safeParse({
    nome: texto("nome"),
    vende: texto("vende"),
    whatsapp: texto("whatsapp"),
    whatsappAutorizado: texto("whatsapp_autorizado"),
    anuncianteId: perfil.dados?.id ?? "",
  });
  if (!validado.success) return falha("DADOS_INVALIDOS", validado.error.issues[0]?.message ?? "Dados inválidos.");
  const d = validado.data;
  const { count } = await supabase.from("barracas_evento").select("id", { count: "exact", head: true }).eq("evento_id", eventoId);
  const { error } = await supabase
    .from("barracas_evento")
    .insert({ evento_id: eventoId, nome: d.nome, vende: d.vende, whatsapp: d.whatsapp, anunciante_id: d.anuncianteId, ordem: count ?? 0 });
  if (error) return mensagemDoBanco(error, "adicionarBarraca");
  return ok(null);
}

export async function apagarBarraca(supabase: SupabaseClient, eventoId: string, barracaId: string): Promise<Resultado<null>> {
  const { error } = await supabase.from("barracas_evento").delete().eq("id", barracaId).eq("evento_id", eventoId);
  if (error) return mensagemDoBanco(error, "apagarBarraca");
  return ok(null);
}

// ---------------------------------------------------------------------------
// Estilos musicais e artistas
// ---------------------------------------------------------------------------

export interface EstiloAdmin {
  id: string;
  nome: string;
  ativo: boolean;
}

export async function listarEstilos(supabase: SupabaseClient): Promise<Resultado<EstiloAdmin[]>> {
  const { data, error } = await supabase.from("estilos_musicais").select("id, nome, ativo");
  if (error) return mensagemDoBanco(error, "listarEstilos");
  return ok((data as EstiloAdmin[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
}

/** Cria (sem id) ou renomeia e ativa/desativa um estilo. Nada é apagado: o desativado some das escolhas. */
export async function salvarEstilo(supabase: SupabaseClient, f: FormData): Promise<Resultado<null>> {
  const validado = esquemaEstiloMusical.safeParse({ nome: String(f.get("nome") ?? "").slice(0, 100) });
  if (!validado.success) return falha("DADOS_INVALIDOS", validado.error.issues[0]?.message ?? "Nome inválido.");
  const id = String(f.get("id") ?? "");
  if (id) {
    const { error } = await supabase.from("estilos_musicais").update({ nome: validado.data.nome, ativo: f.get("ativo") !== "nao" }).eq("id", id);
    if (error) return mensagemDoBanco(error, "salvarEstilo");
    return ok(null);
  }
  const cidadeId = await idDaCidade(supabase);
  if (!cidadeId) return ERRO_INTERNO;
  const { error } = await supabase.from("estilos_musicais").insert({ cidade_id: cidadeId, nome: validado.data.nome });
  if (error) return mensagemDoBanco(error, "salvarEstilo");
  return ok(null);
}

export interface ArtistaAdmin {
  id: string;
  slug: string;
  nome: string;
  formacao: string | null;
  atende: string[];
  videos: { titulo: string; url: string }[];
  anunciante: { nome: string; slug: string } | null;
  estiloIds: string[];
}

export async function listarArtistasAdmin(supabase: SupabaseClient): Promise<Resultado<ArtistaAdmin[]>> {
  const { data, error } = await supabase.from("artistas").select("id, slug, nome, formacao, atende, videos, anunciantes(nome, slug), artista_estilos(estilo_id)");
  if (error) return mensagemDoBanco(error, "listarArtistasAdmin");
  type Linha = Omit<ArtistaAdmin, "anunciante" | "estiloIds"> & { anunciantes: ArtistaAdmin["anunciante"]; artista_estilos: { estilo_id: string }[] };
  return ok(
    (data as unknown as Linha[])
      .map(({ anunciantes, artista_estilos, ...a }) => ({ ...a, anunciante: anunciantes, estiloIds: artista_estilos.map((e) => e.estilo_id) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  );
}

/** Cria ou altera o artista e troca os estilos dele. */
export async function salvarArtista(supabase: SupabaseClient, id: string | null, f: FormData): Promise<Resultado<{ id: string }>> {
  const texto = (nome: string) => String(f.get(nome) ?? "").slice(0, 1000);
  const perfil = await anuncianteDoEndereco(supabase, texto("perfil"));
  if (!perfil.ok) return perfil;
  const titulos = f.getAll("video_titulo").map(String);
  const urls = f.getAll("video_url").map(String);
  const validado = esquemaArtista.safeParse({
    nome: texto("nome"),
    estiloIds: f.getAll("estilo").map(String).slice(0, 20),
    anuncianteId: perfil.dados?.id ?? "",
    formacao: texto("formacao"),
    atende: texto("atende"),
    videos: titulos.slice(0, 10).map((titulo, i) => ({ titulo, url: urls[i] ?? "" })),
  });
  if (!validado.success) return falha("DADOS_INVALIDOS", validado.error.issues[0]?.message ?? "Dados inválidos.");
  const d = validado.data;
  const registro = { nome: d.nome, anunciante_id: d.anuncianteId, formacao: d.formacao, atende: d.atende, videos: d.videos };

  let artistaId = id;
  if (id) {
    const { data, error } = await supabase.from("artistas").update(registro).eq("id", id).select("id").maybeSingle();
    if (error) return mensagemArtista(error);
    if (!data) return falha("NAO_ENCONTRADO", "Artista não encontrado.");
  } else {
    const cidadeId = await idDaCidade(supabase);
    if (!cidadeId) return ERRO_INTERNO;
    const slug = await slugLivre(supabase, "artistas", d.nome, null, "artista");
    const { data, error } = await supabase.from("artistas").insert({ ...registro, cidade_id: cidadeId, slug }).select("id").single();
    if (error) return mensagemArtista(error);
    artistaId = data.id as string;
  }

  // Troca os estilos: apaga os que saíram e inclui os novos.
  const { data: atuais, error: erroAtuais } = await supabase.from("artista_estilos").select("estilo_id").eq("artista_id", artistaId!);
  if (erroAtuais) return mensagemDoBanco(erroAtuais, "salvarArtista: estilos atuais");
  const atuaisIds = new Set((atuais ?? []).map((e) => e.estilo_id as string));
  const sair = [...atuaisIds].filter((e) => !d.estiloIds.includes(e));
  const entrar = d.estiloIds.filter((e) => !atuaisIds.has(e));
  if (sair.length) {
    const { error } = await supabase.from("artista_estilos").delete().eq("artista_id", artistaId!).in("estilo_id", sair);
    if (error) return mensagemDoBanco(error, "salvarArtista: tirar estilos");
  }
  if (entrar.length) {
    const { error } = await supabase.from("artista_estilos").insert(entrar.map((estilo_id) => ({ artista_id: artistaId, estilo_id })));
    if (error) return mensagemDoBanco(error, "salvarArtista: incluir estilos");
  }
  return ok({ id: artistaId! });
}

function mensagemArtista(erro: { code?: string; message: string }): Falha {
  if (erro.code === "23505" && erro.message.includes("anunciante")) return falha("CONFLITO", "Este anúncio já está ligado a outro artista.");
  return mensagemDoBanco(erro, "salvarArtista");
}

export async function listarBairros(supabase: SupabaseClient): Promise<Resultado<{ id: string; nome: string }[]>> {
  const { data, error } = await supabase.from("bairros").select("id, nome, cidades!inner(slug)").eq("cidades.slug", CIDADE).eq("ativo", true);
  if (error) return mensagemDoBanco(error, "listarBairros");
  return ok((data as { id: string; nome: string }[]).map(({ id, nome }) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
}
