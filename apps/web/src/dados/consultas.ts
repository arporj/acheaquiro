// Ponto único de leitura de dados das páginas. O site de apresentação lê os
// dados fictícios de src/mocks; a produção lê o catálogo do banco (cidade,
// bairros, categorias, planos, extras e regras) e, até as tabelas de
// anunciantes existirem (etapa 2), mostra a lista de anunciantes vazia. A
// página "em breve" não acessa o banco: usa as regras de src/mocks/planos.ts.
import type { Anunciante, Bairro, CatalogoPublico, Categoria, Cidade, Extra, Foto, Patrocinador, CotaPatrocinio, CotaPatrocinioVenda, Plano, RegrasCobranca, Apresentacao, Artista, EventoAgenda, Selo, TipoAnunciante } from "@acheaqui/types";
import { dadosPublicosDoArtista, novaVagaAPartirDe, somarDias } from "@acheaqui/domain";
import {
  codigoRepresentanteValido,
  criarClientePublico,
  lerAnunciantePublico,
  lerAnunciantesPublicos,
  lerCatalogoPublico,
  lerPatrocinioPublico,
  registrarCliquePatrocinio,
  type FiltroAnunciantes,
} from "@acheaqui/supabase-client";
import { ENDERECO_ARQUIVOS } from "@/lib/arquivos";
import { enderecoParaRota, linkComoChegar } from "@/lib/contato";
import { ambiente } from "@/lib/ambiente";
import { normalizar } from "@/lib/texto";
import { anunciantes as anunciantesFicticios } from "@/mocks/anunciantes";
import { categorias, ordemAtalhos } from "@/mocks/categorias";
import { destaqueExclusivoId, linksDestacados, simulacaoComercios, superDestaqueIds } from "@/mocks/extras";
import { bairros, cidadeAtual } from "@/mocks/localidades";
import { apresentacoes as apresentacoesFicticias, artistas as artistasFicticios, eventos as eventosFicticios } from "@/mocks/agenda";
import { cotasPatrocinio, patrocinadores as patrocinadoresFicticios } from "@/mocks/patrocinadores";
import { extrasDisponiveis, planos, regrasCobranca } from "@/mocks/planos";

/** Anunciantes, destaques e destacados fictícios. */
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
  aberturaAoPublico: "2026-11-27",
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

export async function categoriasPorGrupo(): Promise<{ grupo: string; categorias: Categoria[] }[]> {
  const grupos = new Map<string, Categoria[]>();
  for (const categoria of (await catalogo()).categorias) {
    grupos.set(categoria.grupo, [...(grupos.get(categoria.grupo) ?? []), categoria]);
  }
  return [...grupos].map(([grupo, lista]) => ({ grupo, categorias: lista }));
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
    [categoria.nome, categoria.nomePlural, ...categoria.sinonimos].some((texto) => normalizar(texto).includes(busca)),
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

export async function destaqueExclusivo(): Promise<{ item: ItemResultado; anunciante: Anunciante } | undefined> {
  const c = await catalogo();
  const anunciante = ficticio ? anunciantes.find((a) => a.id === destaqueExclusivoId) : undefined;
  return anunciante && { item: paraItem(c, anunciante), anunciante };
}

/** Vitrine dos Fundadores (item 4.16), em ordem alfabética. */
export async function listarFundadores(): Promise<ItemResultado[]> {
  const c = await catalogo();
  const lista = catalogoDoBanco ? await anunciantesDoBanco({ soFundadores: true }) : anunciantes;
  return lista
    .filter((a) => a.fundador)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((a) => paraItem(c, a));
}

export async function superDestaques(): Promise<ItemResultado[]> {
  const c = await catalogo();
  const ids = ficticio ? superDestaqueIds : [];
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
 * Código do link /r/codigo de um representante ativo. Só a produção confere
 * no banco; o aviso "em breve" não acessa o banco e guarda o código como veio
 * (a equipe confere quando a mensagem chega).
 */
export async function indicacaoValida(codigo: string): Promise<boolean> {
  if (!catalogoDoBanco) return true;
  return codigoRepresentanteValido(clientePublico(), codigo);
}

// Agenda (módulo de eventos). Por enquanto só no site de apresentação.

/** Hoje em Rio das Ostras, AAAA-MM-DD. */
export function hojeNaCidade(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Uma apresentação com o artista e o lugar já resolvidos, pronta para a tela. */
export interface ItemAgenda {
  id: string;
  data: string;
  inicio: string;
  fim?: string;
  artista: Artista;
  lugar: { nome: string; href: string; bairroId: string; bairro: string; evento: boolean };
}

// As datas dos dados fictícios são relativas a hoje; por isso são calculadas
// a cada consulta (no Worker, o relógio só anda dentro da requisição).
function eventosAgenda(): EventoAgenda[] {
  if (!ficticio) return [];
  const hoje = hojeNaCidade();
  return eventosFicticios.map(({ diasDepoisDeHoje, ...e }) => ({ ...e, data: somarDias(hoje, diasDepoisDeHoje) }));
}

function apresentacoesAgenda(): Apresentacao[] {
  if (!ficticio) return [];
  const hoje = hojeNaCidade();
  return apresentacoesFicticias.map(({ diasDepoisDeHoje, ...a }) => ({ ...a, data: somarDias(hoje, diasDepoisDeHoje) }));
}

// Só o artista com anúncio ativo mostra foto, contato e o resto do perfil (packages/domain).
const artistas: Artista[] = (ficticio ? artistasFicticios : []).map((a) =>
  dadosPublicosDoArtista(a, Boolean(a.anuncianteId && anunciantes.some((an) => an.id === a.anuncianteId))),
);

async function paraItemAgenda(a: Apresentacao, eventos: EventoAgenda[]): Promise<ItemAgenda | undefined> {
  const artista = artistas.find((ar) => ar.id === a.artistaId);
  if (!artista) return undefined;
  if (a.eventoId) {
    const evento = eventos.find((e) => e.id === a.eventoId);
    if (!evento) return undefined;
    const lugar = { nome: evento.nome, href: `/agenda/${evento.slug}`, bairroId: evento.bairroId, bairro: await nomeBairro(evento.bairroId), evento: true };
    return { id: a.id, data: a.data, inicio: a.inicio, fim: a.fim, artista, lugar };
  }
  const comercio = anunciantes.find((an) => an.id === a.anuncianteId);
  if (!comercio || comercio.tipo !== "comercio") return undefined;
  const bairroId = comercio.enderecos[0].bairroId;
  const lugar = { nome: comercio.nome, href: `/perfil/${comercio.slug}`, bairroId, bairro: await nomeBairro(bairroId), evento: false };
  return { id: a.id, data: a.data, inicio: a.inicio, fim: a.fim, artista, lugar };
}

async function itensAgenda(filtro: (a: Apresentacao) => boolean): Promise<ItemAgenda[]> {
  const eventos = eventosAgenda();
  const itens = await Promise.all(apresentacoesAgenda().filter(filtro).map((a) => paraItemAgenda(a, eventos)));
  return itens
    .filter((i): i is ItemAgenda => Boolean(i))
    .sort((x, y) => (x.data + x.inicio).localeCompare(y.data + y.inicio));
}

/** Apresentações de hoje em diante, em ordem de data e horário. */
export async function agendaProximosDias(): Promise<ItemAgenda[]> {
  const hoje = hojeNaCidade();
  return itensAgenda((a) => a.data >= hoje);
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

/** Apresentações nos meses pedidos (AAAA-MM), de toda a cidade ou de um comércio. */
export async function agendaDosMeses(meses: string[], anuncianteId?: string): Promise<ItemAgenda[]> {
  return itensAgenda((a) => meses.includes(a.data.slice(0, 7)) && (!anuncianteId || a.anuncianteId === anuncianteId));
}

/** Bairros com alguma apresentação, em qualquer data, para o filtro de bairro. */
export async function bairrosDaAgenda(): Promise<{ id: string; nome: string }[]> {
  const itens = await itensAgenda(() => true);
  return [...new Map(itens.map((i) => [i.lugar.bairroId, i.lugar.bairro])).entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function agendaDoArtista(artistaId: string): Promise<ItemAgenda[]> {
  return itensAgenda((a) => a.artistaId === artistaId);
}

export async function listarArtistas(): Promise<Artista[]> {
  return [...artistas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function artistaPorSlug(slug: string): Promise<Artista | undefined> {
  return artistas.find((a) => a.slug === slug);
}

export async function listarEventos(): Promise<EventoAgenda[]> {
  const hoje = hojeNaCidade();
  return eventosAgenda().filter((e) => e.data >= hoje);
}

export async function eventoPorSlug(slug: string): Promise<{ evento: EventoAgenda; programacao: ItemAgenda[] } | undefined> {
  const evento = eventosAgenda().find((e) => e.slug === slug);
  if (!evento) return undefined;
  return { evento, programacao: await itensAgenda((a) => a.eventoId === evento.id) };
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
