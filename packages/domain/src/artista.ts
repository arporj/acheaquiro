// Artistas da Agenda (decisão de 22/10/2026): o artista que também é anunciante
// tem perfil completo; o que não é aparece só porque um comércio o cadastrou na
// própria agenda, e então só com o nome e o estilo.
import type { Artista } from "@acheaqui/types";
import { compararNomes, normalizarBusca } from "./categorias";

/**
 * O que o visitante pode ver do artista. Sem anúncio ativo, ficam de fora foto,
 * capa, descrição, formação, tipos de evento, fotos, vídeos, Instagram e
 * WhatsApp: só nome, estilos e os shows.
 */
export function dadosPublicosDoArtista(artista: Artista, anuncianteAtivo: boolean): Artista {
  if (anuncianteAtivo) return artista;
  return {
    id: artista.id,
    slug: artista.slug,
    nome: artista.nome,
    estilos: artista.estilos,
    cor: artista.cor,
    descricao: "",
    atende: [],
    galeria: [],
    videos: [],
  };
}

// ---------------------------------------------------------------------------
// Escolha do artista na programação (decisões de 26/11/2026): quem monta a
// programação digita o nome e vê os artistas cadastrados que combinam; sem
// artista com o mesmo nome, pode usar só o nome. O nome sem cadastro de cliente
// ou representante vai para "Artistas a cadastrar" na administração.
// ---------------------------------------------------------------------------

/** Quantos artistas a busca mostra de cada vez. */
export const LIMITE_SUGESTOES_ARTISTA = 8;

/**
 * Artistas cujo nome contém o que foi digitado (sem diferenciar acento,
 * maiúscula nem espaços repetidos): primeiro os que começam com o texto, depois
 * os outros, cada parte em ordem alfabética. Busca vazia não mostra nada.
 */
export function artistasQueCombinam<T extends { nome: string }>(artistas: readonly T[], busca: string, limite = LIMITE_SUGESTOES_ARTISTA): T[] {
  const procurado = normalizarBusca(busca);
  if (!procurado) return [];
  const comPosicao = artistas
    .map((artista) => ({ artista, posicao: normalizarBusca(artista.nome).indexOf(procurado) }))
    .filter((a) => a.posicao >= 0);
  return comPosicao
    .sort((a, b) => Number(a.posicao > 0) - Number(b.posicao > 0) || compararNomes(a.artista.nome, b.artista.nome))
    .slice(0, limite)
    .map((a) => a.artista);
}

/** O artista cadastrado com o mesmo nome (sem diferenciar acento, maiúscula nem espaços), se houver. */
export function artistaComOMesmoNome<T extends { nome: string }>(artistas: readonly T[], nome: string): T | undefined {
  const procurado = normalizarBusca(nome);
  if (!procurado) return undefined;
  return artistas.find((a) => normalizarBusca(a.nome) === procurado);
}

/**
 * "Artistas a cadastrar": os horários com nome sem cadastro agrupados pelo nome
 * (o mesmo artista em eventos diferentes é resolvido de uma vez), em ordem
 * alfabética. O nome mostrado é o do horário mais antigo da lista recebida.
 */
export function agruparArtistasACadastrar<T extends { artistaNome: string }>(itens: readonly T[]): { nome: string; itens: T[] }[] {
  const grupos = new Map<string, { nome: string; itens: T[] }>();
  for (const item of itens) {
    const chave = normalizarBusca(item.artistaNome);
    if (!chave) continue;
    const grupo = grupos.get(chave);
    if (grupo) grupo.itens.push(item);
    else grupos.set(chave, { nome: item.artistaNome.trim().replace(/\s+/g, " "), itens: [item] });
  }
  return [...grupos.values()].sort((a, b) => compararNomes(a.nome, b.nome));
}
