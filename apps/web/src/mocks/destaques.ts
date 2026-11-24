// Destaques fictícios do bloco "Acontece em Rio das Ostras" no site de
// apresentação (decisões J1 a J5 de 24/11/2026): um de cada tipo, sempre no ar.
import type { DestaqueInicio } from "@acheaqui/types";

const sempre = { inicio: "2026-01-01", fim: "2099-12-31", ligado: true, eventoFim: null } as const;

export const destaques: DestaqueInicio[] = [
  {
    ...sempre,
    id: "d1",
    tipo: "evento",
    titulo: "Festival de Inverno da Praça",
    texto: "Um dia inteiro de música, comida e artesanato na Praça São Pedro, com entrada gratuita.",
    imagem: "/mock/fotos/ev1-cartaz.jpg",
    destino: "/agenda/festival-de-inverno-da-praca",
    comercio: null,
    origemEvento: "avulso",
    ordem: 1,
  },
  {
    ...sempre,
    id: "d2",
    tipo: "campanha",
    titulo: "Arrecadação de ração para os abrigos",
    texto: "Leve ração ou areia ao Pet Shop Amigo Fiel até o fim do mês. Tudo vai para os abrigos da cidade.",
    imagem: "/mock/fotos/c01-p1.webp",
    destino: "/perfil/pet-shop-amigo-fiel",
    comercio: "Pet Shop Amigo Fiel",
    origemEvento: null,
    ordem: 2,
  },
  {
    ...sempre,
    id: "d3",
    tipo: "ache_aqui",
    titulo: "Seu negócio também pode estar aqui",
    texto: "Anuncie no Ache Aqui RO e seja encontrado por quem procura na cidade.",
    imagem: "/marca/og-image-1200x630.png",
    destino: "/anuncie",
    comercio: null,
    origemEvento: null,
    ordem: 3,
  },
];
