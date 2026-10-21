// Ponto único de leitura de dados das páginas. Hoje lê os mocks; quando o
// Supabase entrar, só este arquivo muda (passa a usar packages/supabase-client).
import type {
  Anunciante,
  Bairro,
  Categoria,
  Extra,
  Foto,
  Plano,
  RegrasCobranca,
  Selo,
  TipoAnunciante,
} from "@acheaqui/types";
import { ambiente } from "@/lib/ambiente";
import { anunciantes as anunciantesFicticios } from "@/mocks/anunciantes";
import { categorias, ordemAtalhos } from "@/mocks/categorias";
import { destaqueExclusivoId, linksPatrocinados, simulacaoComercios, superDestaqueIds } from "@/mocks/extras";
import { bairros, cidadeAtual } from "@/mocks/localidades";
import { extrasDisponiveis, planos, regrasCobranca } from "@/mocks/planos";
import { normalizar } from "@/lib/texto";

export { cidadeAtual };

// Os anunciantes fictícios aparecem só no site de apresentação. Na produção, a
// lista fica vazia até as tabelas de anunciantes existirem (etapa 2).
const anunciantes = ambiente === "apresentacao" ? anunciantesFicticios : [];

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

export function listarCategorias(): Categoria[] {
  return categorias;
}

export function listarBairros(): Bairro[] {
  return bairros;
}

export function categoriaPorId(id: string): Categoria | undefined {
  return categorias.find((c) => c.id === id);
}

export function categoriaPorSlugLista(slug: string): Categoria | undefined {
  return categorias.find((c) => c.slugLista === slug);
}

export function categoriasAtalho(): Categoria[] {
  return ordemAtalhos.map((id) => categoriaPorId(id)).filter((c): c is Categoria => Boolean(c));
}

export function categoriasPorGrupo(): { grupo: string; categorias: Categoria[] }[] {
  const grupos = new Map<string, Categoria[]>();
  for (const categoria of categorias) {
    grupos.set(categoria.grupo, [...(grupos.get(categoria.grupo) ?? []), categoria]);
  }
  return [...grupos].map(([grupo, lista]) => ({ grupo, categorias: lista }));
}

export function nomeBairro(id: string): string {
  return bairros.find((b) => b.id === id)?.nome ?? id;
}

export function planoPorId(id: string): Plano | undefined {
  return planos.find((p) => p.id === id);
}

/** Planos de um tipo de anunciante, do mais barato ao mais caro. */
export function listarPlanos(tipo: TipoAnunciante): Plano[] {
  return planos.filter((p) => p.tipo === tipo).sort((a, b) => a.nivel - b.nivel);
}

export function listarExtras(): Extra[] {
  return extrasDisponiveis;
}

export function obterRegrasCobranca(): RegrasCobranca {
  return regrasCobranca;
}

export function anunciantePorSlug(slug: string): Anunciante | undefined {
  return anunciantes.find((a) => a.slug === slug);
}

/** SIMULAÇÃO: no sistema real, "aberto agora" sai do horário e a distância, da localização. */
export function situacaoComercio(id: string): { abertoAgora: boolean; distanciaKm: number } | undefined {
  return simulacaoComercios[id];
}

export function listarSlugsAnunciantes(): string[] {
  return anunciantes.map((a) => a.slug);
}

function paraItem(anunciante: Anunciante, patrocinado = false): ItemResultado {
  const categoria = categoriaPorId(anunciante.categoriaId);
  const base = {
    id: anunciante.id,
    slug: anunciante.slug,
    tipo: anunciante.tipo,
    nome: anunciante.nome,
    foto: anunciante.fotoPerfil,
    categoriaNome: categoria?.nome ?? "",
    icone: categoria?.icone ?? "map-pin",
    cor: categoria?.cor ?? "#2563EB",
    selo: planoPorId(anunciante.planoId)?.selo ?? "nenhum",
    fundador: anunciante.fundador,
    patrocinado,
    whatsapp: anunciante.whatsapp,
    telefone: anunciante.telefone,
  };

  if (anunciante.tipo === "profissional") {
    const nomes = anunciante.bairrosAtendidos.map(nomeBairro);
    return {
      ...base,
      local: anunciante.atendeTodaCidade ? "Atende toda a cidade" : `Atende: ${nomes.join(", ")}`,
      bairroIds: anunciante.bairrosAtendidos,
      todaCidade: anunciante.atendeTodaCidade,
    };
  }

  const [principal] = anunciante.enderecos;
  const outras = anunciante.enderecos.length - 1;
  const simulacao = simulacaoComercios[anunciante.id];
  return {
    ...base,
    local:
      `${principal.logradouro}, ${principal.numero} · ${nomeBairro(principal.bairroId)}` +
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
function ordenarSimulado(itens: { anunciante: Anunciante; patrocinado: boolean }[]) {
  return [...itens].sort((a, b) => {
    const nivelA = planoPorId(a.anunciante.planoId)?.nivel ?? 0;
    const nivelB = planoPorId(b.anunciante.planoId)?.nivel ?? 0;
    return nivelB - nivelA || a.anunciante.nome.localeCompare(b.anunciante.nome, "pt-BR");
  });
}

/**
 * Os patrocinados aparecem no topo, marcados, e também na posição do seu
 * plano: o patrocínio é um lugar a mais (decisão de 20/10/2026).
 */
export function buscarPorCategoria(categoriaId: string): ItemResultado[] {
  const encontrados = ordenarSimulado(
    anunciantes
      .filter((a) => a.categoriaId === categoriaId || a.categoriasAdicionais.includes(categoriaId))
      .map((anunciante) => ({
        anunciante,
        patrocinado: linksPatrocinados.some((l) => l.anuncianteId === anunciante.id && l.categoriaId === categoriaId),
      })),
  );
  const topo = encontrados.filter((r) => r.patrocinado).map((r) => paraItem(r.anunciante, true));
  return [...topo, ...encontrados.map((r) => paraItem(r.anunciante))];
}

export function buscarPorTexto(termo: string): { categorias: Categoria[]; resultados: ItemResultado[] } {
  const busca = normalizar(termo);
  if (!busca) {
    const todos = anunciantes.map((anunciante) => ({ anunciante, patrocinado: false }));
    return { categorias: [], resultados: ordenarSimulado(todos).map((r) => paraItem(r.anunciante)) };
  }

  const categoriasEncontradas = categorias.filter((c) =>
    [c.nome, c.nomePlural, ...c.sinonimos].some((texto) => normalizar(texto).includes(busca)),
  );
  const idsCategorias = new Set(categoriasEncontradas.map((c) => c.id));

  const encontrados = anunciantes
    .filter(
      (a) =>
        idsCategorias.has(a.categoriaId) ||
        a.categoriasAdicionais.some((id) => idsCategorias.has(id)) ||
        normalizar(a.nome).includes(busca) ||
        normalizar(a.descricao).includes(busca),
    )
    .map((anunciante) => ({ anunciante, patrocinado: false }));

  return { categorias: categoriasEncontradas, resultados: ordenarSimulado(encontrados).map((r) => paraItem(r.anunciante)) };
}

export function destaqueExclusivo(): { item: ItemResultado; anunciante: Anunciante } | undefined {
  const anunciante = anunciantes.find((a) => a.id === destaqueExclusivoId);
  return anunciante && { item: paraItem(anunciante), anunciante };
}

/** Vitrine dos Fundadores (item 4.16), em ordem alfabética. */
export function listarFundadores(): ItemResultado[] {
  return anunciantes
    .filter((a) => a.fundador)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((a) => paraItem(a));
}

export function superDestaques(): ItemResultado[] {
  return superDestaqueIds
    .map((id) => anunciantes.find((a) => a.id === id))
    .filter((a): a is Anunciante => Boolean(a))
    .map((a) => paraItem(a));
}
