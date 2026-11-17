import type { Artista } from "@acheaqui/types";
import { describe, expect, it } from "vitest";
import { dadosPublicosDoArtista } from "./artista";

const completo: Artista = {
  id: "ar1",
  slug: "banda-mare-alta",
  nome: "Banda Maré Alta",
  estilos: ["Pop", "Rock"],
  descricao: "Clássicos do pop rock.",
  cor: "#2563EB",
  foto: { id: "f1", url: "https://arquivos.example/f1.jpg" },
  capa: { id: "c1" },
  instagram: "bandamarealta",
  whatsapp: "5522999990000",
  formacao: "Voz, guitarra, baixo e bateria",
  atende: ["Bares e quiosques"],
  galeria: [{ id: "g1" }],
  videos: [{ titulo: "Ao vivo", url: "https://www.youtube.com/watch?v=x" }],
  anuncianteId: "a20",
};

describe("dadosPublicosDoArtista", () => {
  it("com anúncio no ar, mostra o perfil inteiro", () => {
    expect(dadosPublicosDoArtista(completo, true)).toBe(completo);
  });
  it("sem anúncio, só nome, estilos e cor (os shows vêm da Agenda)", () => {
    expect(dadosPublicosDoArtista(completo, false)).toEqual({
      id: "ar1",
      slug: "banda-mare-alta",
      nome: "Banda Maré Alta",
      estilos: ["Pop", "Rock"],
      cor: "#2563EB",
      descricao: "",
      atende: [],
      galeria: [],
      videos: [],
    });
  });
});
