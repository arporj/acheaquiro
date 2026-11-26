import type { Artista } from "@acheaqui/types";
import { describe, expect, it } from "vitest";
import { agruparArtistasACadastrar, artistaComOMesmoNome, artistasQueCombinam, dadosPublicosDoArtista } from "./artista";

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

describe("escolha do artista na programação", () => {
  const cadastrados = [
    { id: "1", nome: "Señor José" },
    { id: "2", nome: "Maré 22" },
    { id: "3", nome: "Jac Esteves" },
    { id: "4", nome: "Black Doze" },
    { id: "5", nome: "Dynossaurus du Rock" },
    { id: "6", nome: "Don Sepúlveda" },
  ];

  it("acha pelo nome sem diferenciar acento, maiúscula nem espaços", () => {
    expect(artistasQueCombinam(cadastrados, "senor").map((a) => a.id)).toEqual(["1"]);
    expect(artistasQueCombinam(cadastrados, "  MARE   22 ").map((a) => a.id)).toEqual(["2"]);
  });

  it("mostra primeiro os que começam com o texto e depois os que o contêm, em ordem alfabética", () => {
    expect(artistasQueCombinam(cadastrados, "d").map((a) => a.nome)).toEqual(["Don Sepúlveda", "Dynossaurus du Rock", "Black Doze"]);
  });

  it("não mostra nada com a busca vazia ou sem artista que combine", () => {
    expect(artistasQueCombinam(cadastrados, "   ")).toEqual([]);
    expect(artistasQueCombinam(cadastrados, "Uns e Outros")).toEqual([]);
  });

  it("respeita o limite de sugestões", () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({ nome: `Banda ${String(i).padStart(2, "0")}` }));
    expect(artistasQueCombinam(muitos, "banda")).toHaveLength(8);
    expect(artistasQueCombinam(muitos, "banda", 3).map((a) => a.nome)).toEqual(["Banda 00", "Banda 01", "Banda 02"]);
  });

  it("acha o artista com o mesmo nome, e só ele", () => {
    expect(artistaComOMesmoNome(cadastrados, "señor  josé")?.id).toBe("1");
    expect(artistaComOMesmoNome(cadastrados, "Señor")).toBeUndefined();
    expect(artistaComOMesmoNome(cadastrados, "")).toBeUndefined();
  });

  it("agrupa os nomes sem cadastro pelo nome, em ordem alfabética", () => {
    const grupos = agruparArtistasACadastrar([
      { id: "a", artistaNome: "Uns e  Outros" },
      { id: "b", artistaNome: "Banda Nova" },
      { id: "c", artistaNome: "uns e outros" },
      { id: "d", artistaNome: "   " },
    ]);
    expect(grupos.map((g) => g.nome)).toEqual(["Banda Nova", "Uns e Outros"]);
    expect(grupos[1].itens.map((i) => i.id)).toEqual(["a", "c"]);
  });
});
