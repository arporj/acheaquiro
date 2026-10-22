// Artistas da Agenda (decisão de 22/10/2026): o artista que também é anunciante
// tem perfil completo; o que não é aparece só porque um comércio o cadastrou na
// própria agenda, e então só com o nome e o estilo.
import type { Artista } from "@acheaqui/types";

/**
 * O que o visitante pode ver do artista. Sem anúncio ativo, ficam de fora foto,
 * capa, descrição, formação, tipos de evento, fotos, vídeos, Instagram e
 * WhatsApp: só nome, estilo e os shows.
 */
export function dadosPublicosDoArtista(artista: Artista, anuncianteAtivo: boolean): Artista {
  if (anuncianteAtivo) return artista;
  return {
    id: artista.id,
    slug: artista.slug,
    nome: artista.nome,
    estilo: artista.estilo,
    cor: artista.cor,
    descricao: "",
    atende: [],
    galeria: [],
    videos: [],
  };
}
