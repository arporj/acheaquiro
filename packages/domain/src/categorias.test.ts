import { describe, expect, it } from "vitest";
import { agruparCategorias, categoriaCombinaComBusca, compararNomes, formasDaProfissao, nomeDaCategoriaPara, nomesDaCategoria } from "./categorias";

const cat = (nome: string, grupo: string) => ({ nome, grupo });
const nomes = (lista: { nome: string }[]) => lista.map((c) => c.nome);

describe("categoriaCombinaComBusca", () => {
  const corretor = ["Corretor de imóveis", "Corretores de imóveis", "CRECI", "Serviços profissionais"];

  it("acha pelo começo, pelo meio e pelo plural", () => {
    expect(categoriaCombinaComBusca(corretor, "corr")).toBe(true);
    expect(categoriaCombinaComBusca(corretor, "imov")).toBe(true);
    expect(categoriaCombinaComBusca(corretor, "corretores")).toBe(true);
  });

  it("não diferencia acento, maiúscula nem espaços repetidos", () => {
    expect(categoriaCombinaComBusca(corretor, "  CORRETOR   DE IMÓVEIS ")).toBe(true);
    expect(categoriaCombinaComBusca(["Ótica"], "otica")).toBe(true);
  });

  it("acha pelo sinônimo e pelo grupo", () => {
    expect(categoriaCombinaComBusca(corretor, "creci")).toBe(true);
    expect(categoriaCombinaComBusca(corretor, "profissionais")).toBe(true);
  });

  it("busca vazia combina com tudo", () => {
    expect(categoriaCombinaComBusca(corretor, "")).toBe(true);
    expect(categoriaCombinaComBusca(corretor, "   ")).toBe(true);
  });

  it("não acha o que nenhum texto contém", () => {
    expect(categoriaCombinaComBusca(corretor, "pizza")).toBe(false);
    expect(categoriaCombinaComBusca([], "corretor")).toBe(false);
  });
});

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

  it("com gruposEmOrdemAlfabetica, põe também os grupos em ordem alfabética (formulários e listas internas)", () => {
    const lista = [cat("Pizzarias", "Comer e beber"), cat("Eletricistas", "Serviços para casa"), cat("Academias", "Beleza e saúde"), cat("Ótica", "Áreas comerciais")];
    const grupos = agruparCategorias(lista, (c) => c.nome, { gruposEmOrdemAlfabetica: true });
    expect(grupos.map((g) => g.grupo)).toEqual(["Áreas comerciais", "Beleza e saúde", "Comer e beber", "Serviços para casa"]);
    expect(agruparCategorias(lista, (c) => c.nome).map((g) => g.grupo)).toEqual(["Comer e beber", "Serviços para casa", "Beleza e saúde", "Áreas comerciais"]);
  });

  it("não altera a lista recebida e devolve vazio sem categorias", () => {
    const lista = [cat("B", "G"), cat("A", "G")];
    agruparCategorias(lista, (c) => c.nome);
    expect(nomes(lista)).toEqual(["B", "A"]);
    expect(agruparCategorias([], (c: { grupo: string }) => c.grupo)).toEqual([]);
  });
});

describe("forma da profissão", () => {
  const advogado = { nome: "Advogado", nomeFeminino: "Advogada" };
  const costureira = { nome: "Costureira", nomeMasculino: "Costureiro" };
  const dentista = { nome: "Dentista" };

  it("dá as duas formas quando a categoria tem a do outro gênero", () => {
    expect(formasDaProfissao(advogado)).toEqual({ masculino: "Advogado", feminino: "Advogada" });
    expect(formasDaProfissao(costureira)).toEqual({ masculino: "Costureiro", feminino: "Costureira" });
  });

  it("não dá escolha quando o nome serve aos dois", () => {
    expect(formasDaProfissao(dentista)).toBeNull();
  });

  it("mostra a forma escolhida", () => {
    expect(nomeDaCategoriaPara(advogado, "feminino")).toBe("Advogada");
    expect(nomeDaCategoriaPara(advogado, "masculino")).toBe("Advogado");
    expect(nomeDaCategoriaPara(costureira, "masculino")).toBe("Costureiro");
    expect(nomeDaCategoriaPara(costureira, "feminino")).toBe("Costureira");
  });

  it("sem escolha, ou sem a outra forma, mostra o nome principal", () => {
    expect(nomeDaCategoriaPara(advogado)).toBe("Advogado");
    expect(nomeDaCategoriaPara(advogado, null)).toBe("Advogado");
    expect(nomeDaCategoriaPara(costureira)).toBe("Costureira");
    expect(nomeDaCategoriaPara(dentista, "feminino")).toBe("Dentista");
  });

  it("lista todos os nomes no singular para a busca", () => {
    expect(nomesDaCategoria(advogado)).toEqual(["Advogado", "Advogada"]);
    expect(nomesDaCategoria(costureira)).toEqual(["Costureira", "Costureiro"]);
    expect(nomesDaCategoria(dentista)).toEqual(["Dentista"]);
    expect(categoriaCombinaComBusca(nomesDaCategoria(advogado), "advogada")).toBe(true);
  });
});
