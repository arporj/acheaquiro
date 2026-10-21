// Ponto único de leitura de dados das páginas. O site de apresentação lê os
// dados fictícios de src/mocks; a produção lê o catálogo do banco (cidade,
// bairros, categorias, planos, extras e regras) e, até as tabelas de
// anunciantes existirem (etapa 2), mostra a lista de anunciantes vazia. A
// página "em breve" não acessa o banco: usa as regras de src/mocks/planos.ts.
import type { Anunciante, Bairro, CatalogoPublico, Categoria, Cidade, Extra, Foto, Plano, RegrasCobranca, Selo, TipoAnunciante } from "@acheaqui/types";
import { criarClientePublico, lerCatalogoPublico } from "@acheaqui/supabase-client";
import { ambiente } from "@/lib/ambiente";
import { normalizar } from "@/lib/texto";
import { anunciantes as anunciantesFicticios } from "@/mocks/anunciantes";
import { categorias, ordemAtalhos } from "@/mocks/categorias";
import { destaqueExclusivoId, linksPatrocinados, simulacaoComercios, superDestaqueIds } from "@/mocks/extras";
import { bairros, cidadeAtual } from "@/mocks/localidades";
import { extrasDisponiveis, planos, regrasCobranca } from "@/mocks/planos";

/** Anunciantes, destaques e patrocinados fictícios. */
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
  patrocinado: boolean;
  /** Bairros atendidos (profissional) ou endereço (comércio). */
  local: string;
  bairroIds: string[];
  todaCidade: boolean;
  whatsapp: string;
  telefone?: string;
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

export async function anunciantePorSlug(slug: string): Promise<Anunciante | undefined> {
  return anunciantes.find((a) => a.slug === slug);
}

/** SIMULAÇÃO: no sistema real, "aberto agora" sai do horário e a distância, da localização. */
export async function situacaoComercio(id: string): Promise<{ abertoAgora: boolean; distanciaKm: number } | undefined> {
  return ficticio ? simulacaoComercios[id] : undefined;
}

function paraItem(c: CatalogoPublico, anunciante: Anunciante, patrocinado = false): ItemResultado {
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
    patrocinado,
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
  const simulacao = ficticio ? simulacaoComercios[anunciante.id] : undefined;
  return {
    ...base,
    local:
      `${principal.logradouro}, ${principal.numero} · ${nomeBairroEm(c, principal.bairroId)}` +
      (outras > 0 ? ` (+${outras} ${outras === 1 ? "loja" : "lojas"})` : ""),
    bairroIds: anunciante.enderecos.map((e) => e.bairroId),
    todaCidade: false,
    abertoAgora: simulacao?.abertoAgora,
    distanciaKm: simulacao?.distanciaKm,
  };
}

/**
 * SIMULAÇÃO da ordem da lista, só para o layout: por nível do plano e nome. A
 * regra real (sorteio dos patrocinados, alternância dentro de cada grupo, vaga
 * rotativa) é `ordenarResultados`, de packages/domain, aplicada na etapa 3.
 */
function ordenarSimulado(c: CatalogoPublico, itens: { anunciante: Anunciante; patrocinado: boolean }[]) {
  return [...itens].sort((a, b) => {
    const nivelA = planoEm(c, a.anunciante.planoId)?.nivel ?? 0;
    const nivelB = planoEm(c, b.anunciante.planoId)?.nivel ?? 0;
    return nivelB - nivelA || a.anunciante.nome.localeCompare(b.anunciante.nome, "pt-BR");
  });
}

/**
 * Os patrocinados aparecem no topo, marcados, e também na posição do seu
 * plano: o patrocínio é um lugar a mais (decisão de 20/10/2026).
 */
export async function buscarPorCategoria(categoriaId: string): Promise<ItemResultado[]> {
  const c = await catalogo();
  const patrocinados = ficticio ? linksPatrocinados : [];
  const encontrados = ordenarSimulado(
    c,
    anunciantes
      .filter((a) => a.categoriaId === categoriaId || a.categoriasAdicionais.includes(categoriaId))
      .map((anunciante) => ({
        anunciante,
        patrocinado: patrocinados.some((l) => l.anuncianteId === anunciante.id && l.categoriaId === categoriaId),
      })),
  );
  const topo = encontrados.filter((r) => r.patrocinado).map((r) => paraItem(c, r.anunciante, true));
  return [...topo, ...encontrados.map((r) => paraItem(c, r.anunciante))];
}

export async function buscarPorTexto(termo: string): Promise<{ categorias: Categoria[]; resultados: ItemResultado[] }> {
  const c = await catalogo();
  const busca = normalizar(termo);
  if (!busca) {
    const todos = anunciantes.map((anunciante) => ({ anunciante, patrocinado: false }));
    return { categorias: [], resultados: ordenarSimulado(c, todos).map((r) => paraItem(c, r.anunciante)) };
  }

  const categoriasEncontradas = c.categorias.filter((categoria) =>
    [categoria.nome, categoria.nomePlural, ...categoria.sinonimos].some((texto) => normalizar(texto).includes(busca)),
  );
  const idsCategorias = new Set(categoriasEncontradas.map((categoria) => categoria.id));

  const encontrados = anunciantes
    .filter(
      (a) =>
        idsCategorias.has(a.categoriaId) ||
        a.categoriasAdicionais.some((id) => idsCategorias.has(id)) ||
        normalizar(a.nome).includes(busca) ||
        normalizar(a.descricao).includes(busca),
    )
    .map((anunciante) => ({ anunciante, patrocinado: false }));

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
  return anunciantes
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
