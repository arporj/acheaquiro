import { describe, expect, it } from "vitest";
import { agruparCategorias, compararNomes } from "./categorias";

const cat = (nome: string, grupo: string) => ({ nome, grupo });
const nomes = (lista: { nome: string }[]) => lista.map((c) => c.nome);

describe("compararNomes", () => {
  it("ordena como no português, sem pôr os acentos no fim", () => {
    const lista = ["Água e gás", "Zeladoria", "Açougues", "Academias", "Óticas", "Oficinas"];
    expect([...lista].sort(compararNomes)).toEqual(["Academias", "Açougues", "Água e gás", "Oficinas", "Óticas", "Zeladoria"]);
  });

  it("não diferencia maiúscula de minúscula", () => {
    expect(compararNomes("pizzarias", "Pizzarias")).toBe(0);
  });

  it("compara os números pelo valor", () => {
    expect(["Pacote 10", "Pacote 2"].sort(compararNomes)).toEqual(["Pacote 2", "Pacote 10"]);
  });
});

describe("agruparCategorias", () => {
  it("mantém a ordem dos grupos e põe as categorias de cada grupo em ordem alfabética", () => {
    const grupos = agruparCategorias(
      [cat("Pizzarias", "Comer e beber"), cat("Eletricistas", "Serviços para casa"), cat("Açaí", "Comer e beber"), cat("Bombeiros", "Serviços para casa")],
      (c) => c.nome,
    );
    expect(grupos.map((g) => g.grupo)).toEqual(["Comer e beber", "Serviços para casa"]);
    expect(grupos.map((g) => nomes(g.categorias))).toEqual([["Açaí", "Pizzarias"], ["Bombeiros", "Eletricistas"]]);
  });

  it("busca por \"diarista\": um grupo só, o da categoria encontrada", () => {
    const grupos = agruparCategorias([cat("Diarista", "Limpeza e cuidados com a casa")], (c) => c.nome);
    expect(grupos).toEqual([{ grupo: "Limpeza e cuidados com a casa", categorias: [cat("Diarista", "Limpeza e cuidados com a casa")] }]);
  });

  it("busca com categorias de grupos diferentes: um grupo para cada", () => {
    const grupos = agruparCategorias(
      [cat("Eletricista", "Serviços para casa"), cat("Material elétrico", "Construção e reforma"), cat("Eletricista de autos", "Veículos")],
      (c) => c.nome,
    );
    expect(grupos.map((g) => g.grupo)).toEqual(["Serviços para casa", "Construção e reforma", "Veículos"]);
  });

  it("ordena pelo nome que a tela mostra", () => {
    const lista = [{ nome: "B", plural: "Z", grupo: "G" }, { nome: "Z", plural: "A", grupo: "G" }];
    expect(agruparCategorias(lista, (c) => c.plural)[0]!.categorias.map((c) => c.nome)).toEqual(["Z", "B"]);
  });

  it("não altera a lista recebida e devolve vazio sem categorias", () => {
    const lista = [cat("B", "G"), cat("A", "G")];
    agruparCategorias(lista, (c) => c.nome);
    expect(nomes(lista)).toEqual(["B", "A"]);
    expect(agruparCategorias([], (c: { grupo: string }) => c.grupo)).toEqual([]);
  });
});
