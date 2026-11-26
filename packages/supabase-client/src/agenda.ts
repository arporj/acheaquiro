// Agenda como o visitante vê (migration 20261117173424_agenda.sql): o RLS só
// entrega os eventos publicados e liberados (interno.evento_visivel), com a
// programação e as barracas deles. Aqui as linhas viram o formato das páginas.
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const FALHA = { ok: false, erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível carregar a Agenda agora." } } as const;

export interface ArtistaDoBanco {
  id: string;
  slug: string;
  nome: string;
  cor: string;
  formacao: string | null;
  atende: string[];
  videos: { titulo: string; url: string }[];
  estilos: string[];
  /** Anúncio do artista (Músicos e bandas), de onde vêm foto, descrição e contato. */
  anuncio: { id: string; slug: string } | null;
}

export interface ItemProgramacaoDoBanco {
  id: string;
  dia: string;
  inicio: string;
  fim: string | null;
  titulo: string | null;
  artistaId: string | null;
  /** Artista sem cadastro no site: só o nome, sem página. */
  artistaNome: string | null;
}

export interface BarracaDoBanco {
  nome: string;
  vende: string;
  whatsapp: string | null;
  anuncioSlug: string | null;
}

export interface EventoDoBanco {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  origem: "comercio" | "artista" | "avulso" | "orgao_publico";
  anunciante: { id: string; slug: string; nome: string } | null;
  produtor: string | null;
  local: string;
  endereco: string | null;
  bairroId: string;
  dataInicio: string;
  dataFim: string;
  entrada: "gratuita" | "couvert" | "ingressos";
  couvertCentavos: number | null;
  ingressos: { nome: string; valorCentavos: number }[];
  abertoAoPublico: boolean;
  classificacao: string | null;
  cadeiraDePraia: boolean | null;
  cooler: boolean | null;
  ruasFechadas: string | null;
  /** Prefixo do cartaz no bucket público (<chave>-400.jpg, -800.jpg e -1600.jpg). */
  cartazChave: string | null;
  programacao: ItemProgramacaoDoBanco[];
  barracas: BarracaDoBanco[];
}

const CAMPOS_EVENTO =
  "id, slug, nome, descricao, origem, produtor, local, endereco, bairro_id, data_inicio, data_fim, entrada, couvert_centavos, ingressos, " +
  "aberto_ao_publico, classificacao, cadeira_de_praia, cooler, ruas_fechadas, cartaz_chave, anunciantes(id, slug, nome), cidades!inner(slug), " +
  "programacao_evento(id, dia, inicio, fim, titulo, artista_id, artista_nome)";

interface LinhaEvento {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  origem: EventoDoBanco["origem"];
  produtor: string | null;
  local: string;
  endereco: string | null;
  bairro_id: string;
  data_inicio: string;
  data_fim: string;
  entrada: EventoDoBanco["entrada"];
  couvert_centavos: number | null;
  ingressos: { nome: string; valorCentavos: number }[];
  aberto_ao_publico: boolean;
  classificacao: string | null;
  cadeira_de_praia: boolean | null;
  cooler: boolean | null;
  ruas_fechadas: string | null;
  cartaz_chave: string | null;
  anunciantes: { id: string; slug: string; nome: string } | null;
  programacao_evento: {
    id: string;
    dia: string;
    inicio: string;
    fim: string | null;
    titulo: string | null;
    artista_id: string | null;
    artista_nome: string | null;
  }[];
  barracas_evento?: { nome: string; vende: string; whatsapp: string | null; ordem: number; anunciantes: { slug: string } | null }[];
}

function paraEvento(l: LinhaEvento): EventoDoBanco {
  return {
    id: l.id,
    slug: l.slug,
    nome: l.nome,
    descricao: l.descricao,
    origem: l.origem,
    anunciante: l.anunciantes,
    produtor: l.produtor,
    local: l.local,
    endereco: l.endereco,
    bairroId: l.bairro_id,
    dataInicio: l.data_inicio,
    dataFim: l.data_fim,
    entrada: l.entrada,
    couvertCentavos: l.couvert_centavos,
    ingressos: l.ingressos,
    abertoAoPublico: l.aberto_ao_publico,
    classificacao: l.classificacao,
    cadeiraDePraia: l.cadeira_de_praia,
    cooler: l.cooler,
    ruasFechadas: l.ruas_fechadas,
    cartazChave: l.cartaz_chave,
    // O horário vem como 21:00:00; a tela usa 21:00.
    programacao: l.programacao_evento
      .map((p) => ({
        id: p.id,
        dia: p.dia,
        inicio: p.inicio.slice(0, 5),
        fim: p.fim?.slice(0, 5) ?? null,
        titulo: p.titulo,
        artistaId: p.artista_id,
        artistaNome: p.artista_nome,
      }))
      .sort((a, b) => `${a.dia}${a.inicio}`.localeCompare(`${b.dia}${b.inicio}`)),
    barracas: (l.barracas_evento ?? [])
      .sort((a, b) => a.ordem - b.ordem)
      .map((b) => ({ nome: b.nome, vende: b.vende, whatsapp: b.whatsapp, anuncioSlug: b.anunciantes?.slug ?? null })),
  };
}

/** Eventos com algum dia entre `de` e `ate` (AAAA-MM-DD), de toda a cidade ou de um anunciante. */
export async function lerEventosPublicos(
  cliente: SupabaseClient,
  cidade: string,
  periodo: { de: string; ate: string; anuncianteId?: string },
): Promise<Resultado<EventoDoBanco[]>> {
  let consulta = cliente.from("eventos").select(CAMPOS_EVENTO).eq("cidades.slug", cidade).lte("data_inicio", periodo.ate).gte("data_fim", periodo.de);
  if (periodo.anuncianteId) consulta = consulta.eq("anunciante_id", periodo.anuncianteId);
  const { data, error } = await consulta.order("data_inicio").limit(500);
  if (error) {
    console.error("lerEventosPublicos falhou", { cidade, codigo: error.code, mensagem: error.message });
    return FALHA;
  }
  return { ok: true, dados: (data as unknown as LinhaEvento[]).map(paraEvento) };
}

/** Um evento pelo endereço /agenda/slug, com as barracas; `undefined` quando não existe ou não está visível. */
export async function lerEventoPublico(cliente: SupabaseClient, cidade: string, slug: string): Promise<Resultado<EventoDoBanco | undefined>> {
  const { data, error } = await cliente
    .from("eventos")
    .select(`${CAMPOS_EVENTO}, barracas_evento(nome, vende, whatsapp, ordem, anunciantes(slug))`)
    .eq("cidades.slug", cidade)
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("lerEventoPublico falhou", { cidade, slug, codigo: error.code, mensagem: error.message });
    return FALHA;
  }
  return { ok: true, dados: data ? paraEvento(data as unknown as LinhaEvento) : undefined };
}

/** Eventos em que o artista se apresenta (qualquer data), para a página dele e o filtro da Agenda. */
export async function lerEventosDoArtista(cliente: SupabaseClient, cidade: string, artistaId: string): Promise<Resultado<EventoDoBanco[]>> {
  const { data: ids, error: erroIds } = await cliente.from("programacao_evento").select("evento_id").eq("artista_id", artistaId).limit(500);
  if (erroIds) {
    console.error("lerEventosDoArtista falhou", { artistaId, codigo: erroIds.code, mensagem: erroIds.message });
    return FALHA;
  }
  const eventos = [...new Set((ids ?? []).map((i) => i.evento_id as string))];
  if (eventos.length === 0) return { ok: true, dados: [] };
  const { data, error } = await cliente.from("eventos").select(CAMPOS_EVENTO).eq("cidades.slug", cidade).in("id", eventos).order("data_inicio");
  if (error) {
    console.error("lerEventosDoArtista falhou", { artistaId, codigo: error.code, mensagem: error.message });
    return FALHA;
  }
  return { ok: true, dados: (data as unknown as LinhaEvento[]).map(paraEvento) };
}

/** Artistas da cidade, com os estilos ativos em ordem alfabética. */
export async function lerArtistasPublicos(cliente: SupabaseClient, cidade: string): Promise<Resultado<ArtistaDoBanco[]>> {
  const { data, error } = await cliente
    .from("artistas")
    .select("id, slug, nome, cor, formacao, atende, videos, anunciantes(id, slug, status), cidades!inner(slug), artista_estilos(estilos_musicais(nome, ativo))")
    .eq("cidades.slug", cidade);
  if (error) {
    console.error("lerArtistasPublicos falhou", { cidade, codigo: error.code, mensagem: error.message });
    return FALHA;
  }
  type Linha = Omit<ArtistaDoBanco, "estilos" | "anuncio"> & {
    anunciantes: { id: string; slug: string; status: string } | null;
    artista_estilos: { estilos_musicais: { nome: string; ativo: boolean } | null }[];
  };
  return {
    ok: true,
    dados: (data as unknown as Linha[]).map(({ anunciantes, artista_estilos, ...a }) => ({
      id: a.id,
      slug: a.slug,
      nome: a.nome,
      cor: a.cor,
      formacao: a.formacao,
      atende: a.atende,
      videos: a.videos,
      estilos: artista_estilos
        .map((e) => e.estilos_musicais)
        .filter((e): e is { nome: string; ativo: boolean } => Boolean(e?.ativo))
        .map((e) => e.nome)
        .sort((x, y) => x.localeCompare(y, "pt-BR")),
      // Só o anúncio no ar dá o perfil completo (dadosPublicosDoArtista, packages/domain).
      anuncio: anunciantes && anunciantes.status === "publicado" ? { id: anunciantes.id, slug: anunciantes.slug } : null,
    })),
  };
}
