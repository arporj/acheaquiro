// Ponto único de leitura de dados das páginas. O site de apresentação lê os
// dados fictícios de src/mocks; a produção lê o catálogo do banco (cidade,
// bairros, categorias, planos, extras e regras) e, até as tabelas de
// anunciantes existirem (etapa 2), mostra a lista de anunciantes vazia. A
// página "em breve" não acessa o banco: usa as regras de src/mocks/planos.ts.
import type { Anunciante, Bairro, CatalogoPublico, Categoria, Cidade, DestaqueInicio, Extra, Foto, Patrocinador, CotaPatrocinio, CotaPatrocinioVenda, Plano, RegrasCobranca, Apresentacao, Artista, EventoAgenda, Selo, TipoAnunciante } from "@acheaqui/types";
import { agruparCategorias, categoriaCombinaComBusca, dadosPublicosDoArtista, destaquesNoAr, diasDoEventoNoPeriodo, momentoLocal, novaVagaAPartirDe, somarDias, somarMeses as somarMesesData } from "@acheaqui/domain";
import {
  codigoRepresentanteValido,
  criarClientePublico,
  lerAnunciantePublico,
  lerAnunciantesPublicos,
  lerArtistasPublicos,
  lerCatalogoPublico,
  lerDestaquesPublicos,
  lerEventoPublico,
  lerEventosDoArtista,
  lerEventosPublicos,
  lerPatrocinioPublico,
  registrarCliquePatrocinio,
  registrarCliqueDestaque,
  type ArtistaDoBanco,
  type EventoDoBanco,
  type FiltroAnunciantes,
} from "@acheaqui/supabase-client";
import { ENDERECO_ARQUIVOS } from "@/lib/arquivos";
import { enderecoParaRota, linkComoChegar } from "@/lib/contato";
import { ABERTURA, ambiente } from "@/lib/ambiente";
import { normalizar } from "@/lib/texto";
import { anunciantes as anunciantesFicticios } from "@/mocks/anunciantes";
import { categorias, ordemAtalhos } from "@/mocks/categorias";
import { bannerExclusivoId, linksDestacados, simulacaoComercios, carrosselIds } from "@/mocks/extras";
import { bairros, cidadeAtual } from "@/mocks/localidades";
import { apresentacoes as apresentacoesRelativas, artistas as artistasFicticios, eventos as eventosFicticios } from "@/mocks/agenda";
import { destaques as destaquesFicticios } from "@/mocks/destaques";
import { cotasPatrocinio, patrocinadores as patrocinadoresFicticios } from "@/mocks/patrocinadores";
import { extrasDisponiveis, planos, regrasCobranca } from "@/mocks/planos";

/** Anunciantes, Banner Exclusivo, Carrossel e links destacados fictícios. */
const ficticio = ambiente === "apresentacao";
const catalogoDoBanco = ambiente === "producao";

const CIDADE = "rio-das-ostras";

const catalogoFicticio: CatalogoPublico = {
  cidade: cidadeAtual,
  bairros,
  categorias,
  ordemAtalhos,
  planos,
  extras: extrasDisponiveis,
  regras: regrasCobranca,
  aberturaAoPublico: ABERTURA,
};

const anunciantes: Anunciante[] = ficticio ? anunciantesFicticios : [];

function clientePublico() {
  return criarClientePublico({
    url: import.meta.env.PUBLIC_SUPABASE_URL ?? "",
    chavePublica: import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? "",
  });
}

/**
 * Anunciantes de uma lista: na produção, do banco (decisão de 23/10/2026);
 * no site de apresentação, os fictícios, filtrados aqui. Sem os dados não há
 * lista para montar: o erro vira a página de erro, e o cache continua
 * entregando a última versão boa.
 */
async function anunciantesDoBanco(filtro: FiltroAnunciantes): Promise<Anunciante[]> {
  const resultado = await lerAnunciantesPublicos(clientePublico(), CIDADE, filtro, ENDERECO_ARQUIVOS);
  if (!resultado.ok) throw new Error(`Anunciantes indisponíveis: ${resultado.erro.codigo}`);
  return resultado.dados;
}

/**
 * Uma página refeita chama várias consultas, e as páginas ficam 5 minutos no
 * cache (src/lib/cache.ts). Guardar o catálogo por 1 minuto no Worker evita
 * uma ida ao banco por consulta; uma alteração feita pela administração
 * aparece em até 1 minuto mais o tempo de cache da página.
 */
const SEGUNDOS_CATALOGO_EM_MEMORIA = 60;
let catalogoEmMemoria: { dados: CatalogoPublico; validoAte: number } | undefined;
let catalogoCarregando: Promise<CatalogoPublico> | undefined;

async function carregarCatalogo(): Promise<CatalogoPublico> {
  const cliente = criarClientePublico({
    url: import.meta.env.PUBLIC_SUPABASE_URL ?? "",
    chavePublica: import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? "",
  });
  const resultado = await lerCatalogoPublico(cliente, CIDADE);
  // Sem catálogo não há página para montar: o erro vira a página de erro do
  // servidor, e o cache continua entregando a última versão boa.
  if (!resultado.ok) throw new Error(`Catálogo indisponível: ${resultado.erro.codigo}`);
  catalogoEmMemoria = { dados: resultado.dados, validoAte: Date.now() + SEGUNDOS_CATALOGO_EM_MEMORIA * 1000 };
  return resultado.dados;
}

async function catalogo(): Promise<CatalogoPublico> {
  if (!catalogoDoBanco) return catalogoFicticio;
  if (catalogoEmMemoria && catalogoEmMemoria.validoAte > Date.now()) return catalogoEmMemoria.dados;
  catalogoCarregando ??= carregarCatalogo().finally(() => {
    catalogoCarregando = undefined;
  });
  return catalogoCarregando;
}

/** Dados prontos para exibir um anunciante em listas e carrosséis. */
export interface ItemResultado {
  id: string;
  slug: string;
  tipo: Anunciante["tipo"];
  nome: string;
  /** Foto de perfil; sem ela, a interface mostra o ícone da categoria. */
  foto?: Foto;
  categoriaNome: string;
  icone: string;
  cor: string;
  selo: Selo;
  fundador: boolean;
  destacado: boolean;
  /** Bairros atendidos (profissional) ou endereço (comércio). */
  local: string;
  bairroIds: string[];
  todaCidade: boolean;
  whatsapp?: string;
  telefone?: string;
  /** Rota até o endereço principal (comércio). */
  comoChegar?: string;
  abertoAgora?: boolean;
  distanciaKm?: number;
}

export async function obterCidade(): Promise<Cidade> {
  return (await catalogo()).cidade;
}

export async function listarCategorias(): Promise<Categoria[]> {
  return (await catalogo()).categorias;
}

export async function listarBairros(): Promise<Bairro[]> {
  return (await catalogo()).bairros;
}

export async function categoriaPorId(id: string): Promise<Categoria | undefined> {
  return (await catalogo()).categorias.find((c) => c.id === id);
}

export async function categoriaPorSlugLista(slug: string): Promise<Categoria | undefined> {
  return (await catalogo()).categorias.find((c) => c.slugLista === slug);
}

export async function categoriasAtalho(): Promise<Categoria[]> {
  const c = await catalogo();
  return c.ordemAtalhos.map((id) => c.categorias.find((categoria) => categoria.id === id)).filter((x): x is Categoria => Boolean(x));
}

/**
 * Grupos na ordem do catálogo, com as categorias em ordem alfabética (decisão
 * de 29/10/2026). O ícone do grupo continua o da primeira categoria do
 * catálogo, para não mudar com a ordem alfabética.
 */
export async function categoriasPorGrupo(): Promise<{ grupo: string; icone: string; categorias: Categoria[] }[]> {
  const { categorias } = await catalogo();
  return agruparCategorias(categorias, (c) => c.nome).map((g) => ({
    ...g,
    icone: categorias.find((c) => c.grupo === g.grupo)!.icone,
  }));
}

function nomeBairroEm(c: CatalogoPublico, id: string): string {
  return c.bairros.find((b) => b.id === id)?.nome ?? id;
}

function planoEm(c: CatalogoPublico, id: string): Plano | undefined {
  return c.planos.find((p) => p.id === id);
}

export async function nomeBairro(id: string): Promise<string> {
  return nomeBairroEm(await catalogo(), id);
}

export async function planoPorId(id: string): Promise<Plano | undefined> {
  return planoEm(await catalogo(), id);
}

/** Planos de um tipo de anunciante, do mais barato ao mais caro. */
export async function listarPlanos(tipo: TipoAnunciante): Promise<Plano[]> {
  return (await catalogo()).planos.filter((p) => p.tipo === tipo).sort((a, b) => a.nivel - b.nivel);
}

export async function listarExtras(): Promise<Extra[]> {
  return (await catalogo()).extras;
}

export async function obterRegrasCobranca(): Promise<RegrasCobranca> {
  return (await catalogo()).regras;
}

/** Dia da abertura ao público (AAAA-MM-DD): o período pago antes dela começa nela (decisão de 27/10/2026). */
export async function obterAberturaAoPublico(): Promise<string> {
  return (await catalogo()).aberturaAoPublico;
}

export async function anunciantePorSlug(slug: string): Promise<Anunciante | undefined> {
  if (!catalogoDoBanco) return anunciantes.find((a) => a.slug === slug);
  const resultado = await lerAnunciantePublico(clientePublico(), CIDADE, slug, ENDERECO_ARQUIVOS);
  if (!resultado.ok) throw new Error(`Anunciante indisponível: ${resultado.erro.codigo}`);
  return resultado.dados;
}

/** SIMULAÇÃO: no sistema real, "aberto agora" sai do horário e a distância, da localização. */
export async function situacaoComercio(id: string): Promise<{ abertoAgora: boolean; distanciaKm: number } | undefined> {
  return ficticio ? simulacaoComercios[id] : undefined;
}

function paraItem(c: CatalogoPublico, anunciante: Anunciante, destacado = false): ItemResultado {
  const categoria = c.categorias.find((x) => x.id === anunciante.categoriaId);
  const base = {
    id: anunciante.id,
    slug: anunciante.slug,
    tipo: anunciante.tipo,
    nome: anunciante.nome,
    foto: anunciante.fotoPerfil,
    categoriaNome: categoria?.nome ?? "",
    icone: categoria?.icone ?? "map-pin",
    cor: categoria?.cor ?? "#2563EB",
    selo: planoEm(c, anunciante.planoId)?.selo ?? "nenhum",
    fundador: anunciante.fundador,
    destacado,
    whatsapp: anunciante.whatsapp,
    telefone: anunciante.telefone,
  };

  if (anunciante.tipo === "profissional") {
    const nomes = anunciante.bairrosAtendidos.map((id) => nomeBairroEm(c, id));
    return {
      ...base,
      local: anunciante.atendeTodaCidade ? "Atende toda a cidade" : `Atende: ${nomes.join(", ")}`,
      bairroIds: anunciante.bairrosAtendidos,
      todaCidade: anunciante.atendeTodaCidade,
    };
  }

  const [principal] = anunciante.enderecos;
  const outras = anunciante.enderecos.length - 1;
  if (!principal) return { ...base, local: "", bairroIds: [], todaCidade: false };
  const simulacao = ficticio ? simulacaoComercios[anunciante.id] : undefined;
  return {
    ...base,
    local:
      `${principal.logradouro}, ${principal.numero} · ${nomeBairroEm(c, principal.bairroId)}` +
      (outras > 0 ? ` (+${outras} ${outras === 1 ? "loja" : "lojas"})` : ""),
    bairroIds: anunciante.enderecos.map((e) => e.bairroId),
    todaCidade: false,
    comoChegar: linkComoChegar({
      latitude: principal.latitude,
      longitude: principal.longitude,
      endereco: enderecoParaRota(principal, nomeBairroEm(c, principal.bairroId)),
    }),
    abertoAgora: simulacao?.abertoAgora,
    distanciaKm: simulacao?.distanciaKm,
  };
}

/**
 * SIMULAÇÃO da ordem da lista, só para o layout: por nível do plano e nome. A
 * regra real (sorteio dos destacados, alternância dentro de cada grupo, vaga
 * rotativa) é `ordenarResultados`, de packages/domain, aplicada na etapa 3.
 */
function ordenarSimulado(c: CatalogoPublico, itens: { anunciante: Anunciante; destacado: boolean }[]) {
  return [...itens].sort((a, b) => {
    const nivelA = planoEm(c, a.anunciante.planoId)?.nivel ?? 0;
    const nivelB = planoEm(c, b.anunciante.planoId)?.nivel ?? 0;
    return nivelB - nivelA || a.anunciante.nome.localeCompare(b.anunciante.nome, "pt-BR");
  });
}

/**
 * Os destacados aparecem no topo, marcados, e também na posição do seu
 * plano: o patrocínio é um lugar a mais (decisão de 20/10/2026).
 */
export async function buscarPorCategoria(categoriaId: string): Promise<ItemResultado[]> {
  const c = await catalogo();
  const destacados = ficticio ? linksDestacados : [];
  const daCategoria = catalogoDoBanco
    ? await anunciantesDoBanco({ categorias: [categoriaId] })
    : anunciantes.filter((a) => a.categoriaId === categoriaId || a.categoriasAdicionais.includes(categoriaId));
  const encontrados = ordenarSimulado(
    c,
    daCategoria
      .map((anunciante) => ({
        anunciante,
        destacado: destacados.some((l) => l.anuncianteId === anunciante.id && l.categoriaId === categoriaId),
      })),
  );
  const topo = encontrados.filter((r) => r.destacado).map((r) => paraItem(c, r.anunciante, true));
  return [...topo, ...encontrados.map((r) => paraItem(c, r.anunciante))];
}

export async function buscarPorTexto(termo: string): Promise<{ categorias: Categoria[]; resultados: ItemResultado[] }> {
  const c = await catalogo();
  const busca = normalizar(termo);
  if (!busca) {
    const lista = catalogoDoBanco ? await anunciantesDoBanco({}) : anunciantes;
    const todos = lista.map((anunciante) => ({ anunciante, destacado: false }));
    return { categorias: [], resultados: ordenarSimulado(c, todos).map((r) => paraItem(c, r.anunciante)) };
  }

  const categoriasEncontradas = c.categorias.filter((categoria) =>
    categoriaCombinaComBusca([categoria.nome, categoria.nomePlural, ...categoria.sinonimos], termo),
  );
  const idsCategorias = new Set(categoriasEncontradas.map((categoria) => categoria.id));

  const candidatos = catalogoDoBanco ? await anunciantesDoBanco({ categorias: [...idsCategorias], termo }) : anunciantes;
  const encontrados = candidatos
    .filter(
      (a) =>
        idsCategorias.has(a.categoriaId) ||
        a.categoriasAdicionais.some((id) => idsCategorias.has(id)) ||
        normalizar(a.nome).includes(busca) ||
        normalizar(a.descricao).includes(busca),
    )
    .map((anunciante) => ({ anunciante, destacado: false }));

  return { categorias: categoriasEncontradas, resultados: ordenarSimulado(c, encontrados).map((r) => paraItem(c, r.anunciante)) };
}

export async function bannerExclusivo(): Promise<{ item: ItemResultado; anunciante: Anunciante } | undefined> {
  const c = await catalogo();
  const anunciante = ficticio ? anunciantes.find((a) => a.id === bannerExclusivoId) : undefined;
  return anunciante && { item: paraItem(c, anunciante), anunciante };
}

/** Mural dos Fundadores (item 4.16), em ordem alfabética. */
export async function listarFundadores(): Promise<ItemResultado[]> {
  const c = await catalogo();
  const lista = catalogoDoBanco ? await anunciantesDoBanco({ soFundadores: true }) : anunciantes;
  return lista
    .filter((a) => a.fundador)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((a) => paraItem(c, a));
}

export async function anunciantesDoCarrossel(): Promise<ItemResultado[]> {
  const c = await catalogo();
  const ids = ficticio ? carrosselIds : [];
  return ids
    .map((id) => anunciantes.find((a) => a.id === id))
    .filter((a): a is Anunciante => Boolean(a))
    .map((a) => paraItem(c, a));
}

/**
 * Patrocinadores no ar e cotas à venda. Na produção vêm do banco (só os no ar
 * e dentro do prazo, pelo RLS), guardados 1 minuto no Worker como o catálogo;
 * no site de apresentação, dos dados fictícios; a página "em breve" não tem.
 */
interface DadosPatrocinio {
  patrocinadores: Patrocinador[];
  cotas: CotaPatrocinioVenda[];
}
let patrocinioEmMemoria: { dados: DadosPatrocinio; validoAte: number } | undefined;
let patrocinioCarregando: Promise<DadosPatrocinio> | undefined;

async function carregarPatrocinio(): Promise<DadosPatrocinio> {
  const cliente = criarClientePublico({
    url: import.meta.env.PUBLIC_SUPABASE_URL ?? "",
    chavePublica: import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? "",
  });
  const resultado = await lerPatrocinioPublico(cliente, CIDADE, ENDERECO_ARQUIVOS);
  // Sem os patrocinadores, a página sai sem eles (não é motivo para erro):
  // a falha já foi registrada, e a próxima consulta tenta de novo.
  const dados = resultado.ok ? resultado.dados : { patrocinadores: [], cotas: [] };
  if (resultado.ok) patrocinioEmMemoria = { dados, validoAte: Date.now() + SEGUNDOS_CATALOGO_EM_MEMORIA * 1000 };
  return dados;
}

async function patrocinio(): Promise<DadosPatrocinio> {
  if (ficticio) return { patrocinadores: patrocinadoresFicticios, cotas: cotasPatrocinio };
  if (!catalogoDoBanco) return { patrocinadores: [], cotas: [] };
  if (patrocinioEmMemoria && patrocinioEmMemoria.validoAte > Date.now()) return patrocinioEmMemoria.dados;
  patrocinioCarregando ??= carregarPatrocinio().finally(() => {
    patrocinioCarregando = undefined;
  });
  return patrocinioCarregando;
}

export async function listarPatrocinadores(): Promise<Patrocinador[]> {
  return (await patrocinio()).patrocinadores;
}

/** Patrocinador do grupo e da categoria, para o topo da página da categoria. */
export async function patrocinadoresDaCategoria(
  categoria: Categoria,
): Promise<{ grupo?: Patrocinador; categoria?: Patrocinador }> {
  const { patrocinadores } = await patrocinio();
  return {
    grupo: patrocinadores.find((p) => p.cota === "grupo" && p.grupo === categoria.grupo),
    categoria: patrocinadores.find((p) => p.cota === "categoria" && p.categoriaId === categoria.id),
  };
}

export async function patrocinadorPorSlug(slug: string): Promise<Patrocinador | undefined> {
  return (await patrocinio()).patrocinadores.find((p) => p.slug === slug);
}

/** Patrocinador da Agenda (cota "agenda"). */
export async function patrocinadorDaAgenda(): Promise<Patrocinador | undefined> {
  return (await patrocinio()).patrocinadores.find((p) => p.cota === "agenda");
}

/** Conta o clique no contato do patrocinador (só na produção; repetidos contam uma vez). */
export async function contarCliquePatrocinador(slug: string, visitante: string): Promise<void> {
  if (!catalogoDoBanco) return;
  const cliente = criarClientePublico({
    url: import.meta.env.PUBLIC_SUPABASE_URL ?? "",
    chavePublica: import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? "",
  });
  await registrarCliquePatrocinio(cliente, CIDADE, slug, visitante);
}

/**
 * Destaques no ar do bloco "Acontece em Rio das Ostras" (decisões J1 a J5 de
 * 24/11/2026), na ordem da administração: na produção, do banco; no site de
 * apresentação, os fictícios. Com falha, a página inicial abre sem o bloco
 * (a falha fica no registro), porque a busca vale mais que o destaque.
 */
export async function destaquesDaInicial(): Promise<DestaqueInicio[]> {
  const hoje = momentoLocal(new Date()).data;
  if (ficticio) return destaquesNoAr(destaquesFicticios, hoje);
  if (!catalogoDoBanco) return [];
  const r = await lerDestaquesPublicos(clientePublico(), CIDADE, ENDERECO_ARQUIVOS);
  if (!r.ok) {
    console.error("destaquesDaInicial: página inicial sem o bloco de destaques", { codigo: r.erro.codigo });
    return [];
  }
  return destaquesNoAr(r.dados, hoje);
}

/**
 * Conta o clique no destaque e devolve o destino (só na produção; repetidos
 * contam uma vez). Destaque fora do ar, ou falha, devolve undefined.
 */
export async function cliqueNoDestaque(id: string, visitante: string): Promise<string | undefined> {
  if (!catalogoDoBanco) return undefined;
  const r = await registrarCliqueDestaque(clientePublico(), id, visitante);
  return r.ok ? (r.dados ?? undefined) : undefined;
}

/**
 * Código do link /r/codigo de um representante ativo. Só a produção confere
 * no banco; o aviso "em breve" não acessa o banco e guarda o código como veio
 * (a equipe confere quando a mensagem chega).
 */
export async function indicacaoValida(codigo: string): Promise<boolean> {
  if (!catalogoDoBanco) return true;
  return codigoRepresentanteValido(clientePublico(), codigo);
}

// Agenda (módulo de eventos). Na produção, do banco (migration da Agenda, de
// 17/11/2026): o RLS só entrega os eventos publicados e liberados. No site de
// apresentação, os dados fictícios de src/mocks/agenda.ts.

/** Hoje em Rio das Ostras, AAAA-MM-DD. */
export function hojeNaCidade(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/**
 * Uma linha da Agenda, pronta para a tela: um artista ou uma atividade num dia
 * e horário, ou o evento inteiro no dia sem programação (inicio vazio).
 */
export interface ItemAgenda {
  id: string;
  data: string;
  /** HH:MM; vazio quando o evento não tem programação naquele dia ("o dia todo"). */
  inicio: string;
  fim?: string;
  artista?: Artista;
  /** Artista sem cadastro no site: só o nome, sem página. */
  artistaNome?: string;
  /** Atividade sem artista, observação do artista, ou o nome do evento no dia sem programação. */
  titulo?: string;
  lugar: { nome: string; href: string; bairroId: string; bairro: string; evento: boolean };
}

/** Os eventos da Agenda podem começar até 12 meses à frente (decisão 8). */
const MESES_DA_AGENDA = 12;

const ordemAgenda = (x: ItemAgenda, y: ItemAgenda) => (x.data + x.inicio).localeCompare(y.data + y.inicio);

// ---------------------------------------------------------------------------
// Site de apresentação: dados fictícios com datas relativas a hoje, calculadas
// a cada consulta (no Worker, o relógio só anda dentro da requisição).
// ---------------------------------------------------------------------------

function eventosFicticiosDeHoje(): EventoAgenda[] {
  if (!ficticio) return [];
  const hoje = hojeNaCidade();
  return eventosFicticios.map((e) => {
    if ("dataInicio" in e) return e;
    const { diasDepoisDeHoje, dias, ...resto } = e;
    return { ...resto, dataInicio: somarDias(hoje, diasDepoisDeHoje), dataFim: somarDias(hoje, diasDepoisDeHoje + dias - 1) };
  });
}

function apresentacoesFicticias(): Apresentacao[] {
  if (!ficticio) return [];
  const hoje = hojeNaCidade();
  return apresentacoesRelativas.map((a) => {
    if ("data" in a) return a;
    const { diasDepoisDeHoje, ...resto } = a;
    return { ...resto, data: somarDias(hoje, diasDepoisDeHoje) };
  });
}

// Só o artista com anúncio ativo mostra foto, contato e o resto do perfil (packages/domain).
const artistasFicticiosPublicos: Artista[] = (ficticio ? artistasFicticios : []).map((a) =>
  dadosPublicosDoArtista(a, Boolean(a.anuncianteId && anunciantes.some((an) => an.id === a.anuncianteId))),
);

async function itemFicticio(a: Apresentacao, eventos: EventoAgenda[]): Promise<ItemAgenda | undefined> {
  // Atividade sem artista (largada, premiação) só existe dentro de um evento.
  const artista = artistasFicticiosPublicos.find((ar) => ar.id === a.artistaId);
  if (!artista && !(a.eventoId && a.titulo)) return undefined;
  if (a.eventoId) {
    const evento = eventos.find((e) => e.id === a.eventoId);
    if (!evento) return undefined;
    const lugar = { nome: evento.nome, href: `/agenda/${evento.slug}`, bairroId: evento.bairroId, bairro: await nomeBairro(evento.bairroId), evento: true };
    return { id: a.id, data: a.data, inicio: a.inicio, fim: a.fim, artista, titulo: a.titulo, lugar };
  }
  if (!artista) return undefined;
  const comercio = anunciantes.find((an) => an.id === a.anuncianteId);
  if (!comercio || comercio.tipo !== "comercio") return undefined;
  const bairroId = comercio.enderecos[0].bairroId;
  const lugar = { nome: comercio.nome, href: `/perfil/${comercio.slug}`, bairroId, bairro: await nomeBairro(bairroId), evento: false };
  return { id: a.id, data: a.data, inicio: a.inicio, fim: a.fim, artista, lugar };
}

async function itensFicticios(filtro: (a: Apresentacao) => boolean): Promise<ItemAgenda[]> {
  const eventos = eventosFicticiosDeHoje();
  const itens = await Promise.all(apresentacoesFicticias().filter(filtro).map((a) => itemFicticio(a, eventos)));
  return itens.filter((i): i is ItemAgenda => Boolean(i)).sort(ordemAgenda);
}

// ---------------------------------------------------------------------------
// Produção: banco
// ---------------------------------------------------------------------------

function artistaDoBanco(a: ArtistaDoBanco): Artista {
  const artista: Artista = {
    id: a.id,
    slug: a.slug,
    nome: a.nome,
    estilos: a.estilos,
    descricao: "",
    cor: a.cor,
    formacao: a.formacao ?? undefined,
    atende: a.atende,
    galeria: [],
    videos: a.videos,
    anuncianteId: a.anuncio?.id,
    anuncioSlug: a.anuncio?.slug,
  };
  return dadosPublicosDoArtista(artista, a.anuncio !== null);
}

async function artistasDoBanco(): Promise<Artista[]> {
  const r = await lerArtistasPublicos(clientePublico(), CIDADE);
  if (!r.ok) throw new Error(`Artistas indisponíveis: ${r.erro.codigo}`);
  return r.dados.map(artistaDoBanco);
}

function cartazDoBanco(chave: string | null, nome: string): Foto | undefined {
  // A versão de 1.600 px em JPEG serve à página e à prévia do WhatsApp.
  return chave ? { id: chave, url: `${ENDERECO_ARQUIVOS}/${chave}-1600.jpg`, legenda: `Cartaz de ${nome}` } : undefined;
}

function eventoDoBanco(e: EventoDoBanco): EventoAgenda {
  return {
    id: e.id,
    slug: e.slug,
    nome: e.nome,
    descricao: e.descricao,
    origem: e.origem,
    produtor: e.produtor ?? undefined,
    local: e.local,
    endereco: e.endereco ?? undefined,
    bairroId: e.bairroId,
    anunciante: e.anunciante ?? undefined,
    dataInicio: e.dataInicio,
    dataFim: e.dataFim,
    entrada: e.entrada,
    couvertCentavos: e.couvertCentavos ?? undefined,
    ingressos: e.ingressos,
    abertoAoPublico: e.abertoAoPublico,
    classificacao: e.classificacao ?? undefined,
    cadeiraDePraia: e.cadeiraDePraia,
    cooler: e.cooler,
    ruasFechadas: e.ruasFechadas ?? undefined,
    barracas: e.barracas.map((b) => ({ nome: b.nome, vende: b.vende, whatsapp: b.whatsapp ?? undefined, anuncioSlug: b.anuncioSlug ?? undefined })),
    cartaz: cartazDoBanco(e.cartazChave, e.nome),
  };
}

/**
 * Linhas da Agenda de um evento entre `de` e `ate`: a programação de cada dia,
 * ou o próprio evento no dia sem programação (o evento de vários dias aparece
 * em cada dia em que acontece, decisão 11).
 */
async function itensDoEvento(e: EventoDoBanco, artistas: Map<string, Artista>, de: string, ate: string): Promise<ItemAgenda[]> {
  const lugar = {
    nome: e.origem === "comercio" && e.anunciante ? e.anunciante.nome : e.nome,
    href: `/agenda/${e.slug}`,
    bairroId: e.bairroId,
    bairro: await nomeBairro(e.bairroId),
    evento: true,
  };
  return diasDoEventoNoPeriodo({ inicio: e.dataInicio, fim: e.dataFim }, de, ate).flatMap((dia): ItemAgenda[] => {
    const doDia = e.programacao.filter((p) => p.dia === dia);
    if (doDia.length === 0) return [{ id: `${e.id}-${dia}`, data: dia, inicio: "", titulo: e.nome, lugar }];
    return doDia.map((p) => ({
      id: p.id,
      data: dia,
      inicio: p.inicio,
      fim: p.fim ?? undefined,
      artista: p.artistaId ? artistas.get(p.artistaId) : undefined,
      artistaNome: p.artistaNome ?? undefined,
      titulo: p.titulo ?? undefined,
      lugar,
    }));
  });
}

async function itensDoBanco(eventos: EventoDoBanco[], de: string, ate: string): Promise<ItemAgenda[]> {
  const artistas = new Map((await artistasDoBanco()).map((a) => [a.id, a]));
  const itens = await Promise.all(eventos.map((e) => itensDoEvento(e, artistas, de, ate)));
  return itens.flat().sort(ordemAgenda);
}

async function eventosDoBanco(de: string, ate: string, anuncianteId?: string): Promise<EventoDoBanco[]> {
  const r = await lerEventosPublicos(clientePublico(), CIDADE, { de, ate, anuncianteId });
  if (!r.ok) throw new Error(`Agenda indisponível: ${r.erro.codigo}`);
  return r.dados;
}

// ---------------------------------------------------------------------------
// O que as páginas usam
// ---------------------------------------------------------------------------

/** Linhas de hoje até 12 meses à frente, em ordem de data e horário. */
export async function agendaProximosDias(): Promise<ItemAgenda[]> {
  const hoje = hojeNaCidade();
  if (!catalogoDoBanco) return itensFicticios((a) => a.data >= hoje);
  const ate = somarMesesData(hoje, MESES_DA_AGENDA);
  return itensDoBanco(await eventosDoBanco(hoje, ate), hoje, ate);
}

/** Meses que a página da Agenda já leva prontos: 1 antes e 3 depois do mês atual. */
export const MESES_ANTES_NA_PAGINA = 1;
export const MESES_DEPOIS_NA_PAGINA = 3;

/** "2026-10" + 2 → "2026-12". */
export function somarMeses(mes: string, meses: number): string {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m - 1 + meses, 1)).toISOString().slice(0, 7);
}

/** Meses (AAAA-MM) que a página leva prontos; os outros o navegador busca em /agenda/mes. */
export function mesesNaPagina(): string[] {
  const atual = hojeNaCidade().slice(0, 7);
  const meses: string[] = [];
  for (let i = -MESES_ANTES_NA_PAGINA; i <= MESES_DEPOIS_NA_PAGINA; i++) meses.push(somarMeses(atual, i));
  return meses;
}

/** Linhas nos meses pedidos (AAAA-MM), de toda a cidade ou de um comércio. */
export async function agendaDosMeses(meses: string[], anuncianteId?: string): Promise<ItemAgenda[]> {
  if (!catalogoDoBanco) return itensFicticios((a) => meses.includes(a.data.slice(0, 7)) && (!anuncianteId || a.anuncianteId === anuncianteId));
  if (meses.length === 0) return [];
  const ordenados = [...meses].sort();
  const de = `${ordenados[0]}-01`;
  const ate = somarDias(somarMesesData(`${ordenados[ordenados.length - 1]}-01`, 1), -1);
  const itens = await itensDoBanco(await eventosDoBanco(de, ate, anuncianteId), de, ate);
  return itens.filter((i) => meses.includes(i.data.slice(0, 7)));
}

/** Bairros das linhas, para o filtro de bairro. */
export function bairrosDosItens(itens: ItemAgenda[]): { id: string; nome: string }[] {
  return [...new Map(itens.map((i) => [i.lugar.bairroId, i.lugar.bairro])).entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Estilos dos artistas das linhas, para o filtro de estilo (decisão 10). */
export function estilosDosItens(itens: ItemAgenda[]): string[] {
  return [...new Set(itens.flatMap((i) => i.artista?.estilos ?? []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function agendaDoArtista(artistaId: string): Promise<ItemAgenda[]> {
  if (!catalogoDoBanco) return itensFicticios((a) => a.artistaId === artistaId);
  const r = await lerEventosDoArtista(clientePublico(), CIDADE, artistaId);
  if (!r.ok) throw new Error(`Agenda do artista indisponível: ${r.erro.codigo}`);
  const itens = await Promise.all(r.dados.map(async (e) => itensDoBanco([e], e.dataInicio, e.dataFim)));
  return itens.flat().filter((i) => i.artista?.id === artistaId).sort(ordemAgenda);
}

export async function listarArtistas(): Promise<Artista[]> {
  const lista = catalogoDoBanco ? await artistasDoBanco() : artistasFicticiosPublicos;
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Artista pelo endereço /artista/slug. Na produção, o artista anunciante traz
 * do anúncio a foto, a descrição, as fotos e o contato.
 */
export async function artistaPorSlug(slug: string): Promise<Artista | undefined> {
  if (!catalogoDoBanco) return artistasFicticiosPublicos.find((a) => a.slug === slug);
  const artista = (await artistasDoBanco()).find((a) => a.slug === slug);
  if (!artista?.anuncioSlug) return artista;
  const anuncio = await anunciantePorSlug(artista.anuncioSlug);
  if (!anuncio) return artista;
  return {
    ...artista,
    descricao: anuncio.descricao,
    foto: anuncio.fotoPerfil.url ? anuncio.fotoPerfil : undefined,
    galeria: anuncio.galeria,
    whatsapp: anuncio.whatsapp,
    instagram: anuncio.instagram,
  };
}

/** Eventos de produtores e órgãos públicos, de hoje em diante (a lista "Eventos" da Agenda). */
export async function listarEventos(): Promise<EventoAgenda[]> {
  const hoje = hojeNaCidade();
  if (!catalogoDoBanco) return eventosFicticiosDeHoje().filter((e) => e.dataFim >= hoje);
  const eventos = await eventosDoBanco(hoje, somarMesesData(hoje, MESES_DA_AGENDA));
  return eventos.filter((e) => e.origem === "avulso" || e.origem === "orgao_publico").map(eventoDoBanco);
}

export async function eventoPorSlug(slug: string): Promise<{ evento: EventoAgenda; programacao: ItemAgenda[] } | undefined> {
  if (!catalogoDoBanco) {
    const evento = eventosFicticiosDeHoje().find((e) => e.slug === slug);
    if (!evento) return undefined;
    return { evento, programacao: await itensFicticios((a) => a.eventoId === evento.id) };
  }
  const r = await lerEventoPublico(clientePublico(), CIDADE, slug);
  if (!r.ok) throw new Error(`Evento indisponível: ${r.erro.codigo}`);
  if (!r.dados) return undefined;
  const programacao = await itensDoBanco([r.dados], r.dados.dataInicio, r.dados.dataFim);
  // Na página do evento, o dia sem programação não vira linha.
  return { evento: eventoDoBanco(r.dados), programacao: programacao.filter((i) => i.inicio !== "") };
}

export async function anuncianteSlugPorId(id: string): Promise<string | undefined> {
  return anunciantes.find((a) => a.id === id)?.slug;
}

/** Uma cota com as vagas já contadas, para a página de valores. */
export interface CotaComVagas extends CotaPatrocinioVenda {
  vagasTotais: number;
  vagasLivres: number;
  /** Cota esgotada: dia em que abre de novo uma vaga (AAAA-MM-DD). */
  novaVagaEm?: string;
}

/**
 * Cotas de patrocínio à venda, com as vagas livres. Nas cotas de grupo e de
 * categoria, há uma vaga por grupo e por categoria do catálogo.
 */
export async function listarCotasPatrocinio(): Promise<CotaComVagas[]> {
  const [{ patrocinadores, cotas }, grupos, categorias] = await Promise.all([patrocinio(), categoriasPorGrupo(), listarCategorias()]);
  // No site de apresentação, os patrocinadores fictícios só mostram o layout
  // (rodapé, página, categoria): não ocupam vaga, e a página mostra as vagas reais.
  const contratos: Patrocinador[] = ficticio ? [] : patrocinadores;
  return cotas.map((cota) => {
    const vagasTotais = cota.vagas ?? (cota.cota === "grupo" ? grupos.length : categorias.length);
    const daCota = contratos.filter((p) => p.cota === cota.cota);
    const vagasLivres = Math.max(0, vagasTotais - daCota.length);
    const novaVagaEm = vagasLivres === 0 ? novaVagaAPartirDe(daCota.map((p) => p.fim)) : undefined;
    return { ...cota, vagasTotais, vagasLivres, novaVagaEm };
  });
}

/** Cotas que põem o link "Patrocine" no cabeçalho enquanto tiverem vaga. */
const COTAS_DO_CABECALHO: readonly CotaPatrocinio[] = ["master", "ouro", "apoio"];

/** Há vaga livre em Master, Ouro ou Apoio (mesma conta da página Patrocine). */
export async function temPatrocinioDisponivel(): Promise<boolean> {
  const cotas = await listarCotasPatrocinio();
  return cotas.some((c) => COTAS_DO_CABECALHO.includes(c.cota) && c.vagasLivres > 0);
}
