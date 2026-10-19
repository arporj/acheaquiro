import { describe, expect, it } from "vitest";
import { ordenarResultados, type CandidatoLista, type OpcoesOrdenacao } from "./ordenacao";

// Níveis como na tabela de planos dos autônomos: 1 Básico, 2 Profissional,
// 3 Premium, 4 SuperPremium. Os de entrada são 2 (mais caro) e 1.
const padrao: OpcoesOrdenacao = { modo: "padrao", semente: 1, niveisEntrada: { maisCaro: 2, maisBarato: 1 } };
const semEntrada = { maisCaro: -1, maisBarato: -2 };

let contador = 0;
function anunciantes(quantidade: number, nivelPlano: number, extra: Partial<CandidatoLista> = {}): CandidatoLista[] {
  return Array.from({ length: quantidade }, () => ({ id: `a${++contador}`, nivelPlano, ...extra }));
}

function ids(lista: CandidatoLista[]) {
  return lista.map((c) => c.id);
}

function semRepeticao(entrada: CandidatoLista[], saida: CandidatoLista[]) {
  expect(saida).toHaveLength(entrada.length);
  expect(new Set(ids(saida)).size).toBe(entrada.length);
  expect([...ids(saida)].sort()).toEqual([...ids(entrada)].sort());
}

describe("patrocinados", () => {
  it("sem patrocinados, começa pelo maior plano", () => {
    const entrada = [...anunciantes(2, 1), ...anunciantes(2, 4)];
    const saida = ordenarResultados(entrada, padrao);
    expect(saida.slice(0, 2).every((c) => c.nivelPlano === 4)).toBe(true);
    semRepeticao(entrada, saida);
  });

  it("com 2 patrocinados, os 2 ficam no topo", () => {
    const patrocinados = anunciantes(2, 1, { patrocinio: "patrocinado" });
    const entrada = [...anunciantes(4, 4), ...patrocinados];
    const saida = ordenarResultados(entrada, padrao);
    expect(ids(saida.slice(0, 2)).sort()).toEqual(ids(patrocinados).sort());
    semRepeticao(entrada, saida);
  });

  it("com 3 patrocinados, os 3 ficam no topo", () => {
    const patrocinados = anunciantes(3, 2, { patrocinio: "patrocinado" });
    const entrada = [...anunciantes(4, 4), ...patrocinados];
    const saida = ordenarResultados(entrada, padrao);
    expect(ids(saida.slice(0, 3)).sort()).toEqual(ids(patrocinados).sort());
  });

  it("com 5 patrocinados, sorteia 3 para o topo e os outros 2 seguem no grupo do plano", () => {
    const patrocinados = anunciantes(5, 3, { patrocinio: "patrocinado" });
    const entrada = [...anunciantes(2, 4), ...patrocinados, ...anunciantes(2, 1)];
    const saida = ordenarResultados(entrada, padrao);
    expect(saida.slice(0, 3).every((c) => c.patrocinio)).toBe(true);
    // depois do topo: SuperPremium, os 2 patrocinados não sorteados (Premium), Básico
    expect(saida.slice(3).map((c) => c.nivelPlano)).toEqual([4, 4, 3, 3, 1, 1]);
    semRepeticao(entrada, saida);
  });

  it("dá o dobro de chance ao Patrocinado Plus (10.000 buscas, tolerância de 3 pontos)", () => {
    // 1 Plus + 3 simples disputando 3 vagas: o Plus entra em 90% das buscas e
    // cada simples em 70% (fica de fora só quando saem os 3 simples).
    const [plus] = anunciantes(1, 2, { patrocinio: "plus" });
    const simples = anunciantes(3, 2, { patrocinio: "patrocinado" });
    const entrada = [plus!, ...simples];
    let plusNoTopo = 0;
    let simplesNoTopo = 0;
    for (let semente = 0; semente < 10_000; semente++) {
      const topo = ids(ordenarResultados(entrada, { ...padrao, semente }).slice(0, 3));
      if (topo.includes(plus!.id)) plusNoTopo++;
      if (topo.includes(simples[0]!.id)) simplesNoTopo++;
    }
    expect(Math.abs(plusNoTopo / 10_000 - 0.9)).toBeLessThan(0.03);
    expect(Math.abs(simplesNoTopo / 10_000 - 0.7)).toBeLessThan(0.03);
  });
});

describe("grupos de plano", () => {
  it("ordena os grupos do maior para o menor nível", () => {
    const entrada = [...anunciantes(2, 1), ...anunciantes(2, 3), ...anunciantes(2, 2), ...anunciantes(2, 4)];
    const saida = ordenarResultados(entrada, padrao);
    expect(saida.map((c) => c.nivelPlano)).toEqual([4, 4, 3, 3, 2, 2, 1, 1]);
  });

  it("alterna a ordem dentro do grupo conforme a semente", () => {
    const entrada = anunciantes(6, 4);
    const ordens = new Set(
      Array.from({ length: 20 }, (_, semente) => ids(ordenarResultados(entrada, { ...padrao, semente })).join()),
    );
    expect(ordens.size).toBeGreaterThan(1);
  });

  it("produz a mesma lista com a mesma semente", () => {
    const entrada = [...anunciantes(8, 4), ...anunciantes(6, 2), ...anunciantes(4, 1, { patrocinio: "plus" })];
    expect(ordenarResultados(entrada, { ...padrao, semente: 77 })).toEqual(
      ordenarResultados(entrada, { ...padrao, semente: 77 }),
    );
  });
});

describe("vaga rotativa", () => {
  it.each([9, 10])("não existe com %i anunciantes", (quantidade) => {
    const entrada = [...anunciantes(quantidade - 2, 4), ...anunciantes(2, 1)];
    const comRegra = ordenarResultados(entrada, padrao);
    const semRegra = ordenarResultados(entrada, { ...padrao, niveisEntrada: semEntrada });
    expect(comRegra).toEqual(semRegra);
  });

  it("com 11 anunciantes, leva um plano de entrada para a 10ª posição", () => {
    const entrada = [...anunciantes(10, 4), ...anunciantes(1, 2)];
    const saida = ordenarResultados(entrada, padrao);
    expect(saida[9]!.nivelPlano).toBe(2);
    expect(saida[10]!.nivelPlano).toBe(4);
    semRepeticao(entrada, saida);
  });

  it("com 25 anunciantes, ocupa a 10ª e a 20ª posições", () => {
    const entrada = [...anunciantes(20, 4), ...anunciantes(3, 2), ...anunciantes(2, 1)];
    const saida = ordenarResultados(entrada, padrao);
    expect([saida[9]!.nivelPlano, saida[19]!.nivelPlano].every((n) => n <= 2)).toBe(true);
    expect(saida.slice(0, 9).every((c) => c.nivelPlano === 4)).toBe(true);
    semRepeticao(entrada, saida);
  });

  it("não acontece quando não há anunciantes dos planos de entrada", () => {
    const entrada = [...anunciantes(10, 4), ...anunciantes(4, 3)];
    const comRegra = ordenarResultados(entrada, padrao);
    const semRegra = ordenarResultados(entrada, { ...padrao, niveisEntrada: semEntrada });
    expect(comRegra).toEqual(semRegra);
  });

  it("não puxa para baixo quem já está acima da vaga", () => {
    // Só 2 planos acima: os de entrada já estão nas primeiras posições.
    const entrada = [...anunciantes(2, 4), ...anunciantes(9, 1)];
    const saida = ordenarResultados(entrada, padrao);
    expect(saida.map((c) => c.nivelPlano)).toEqual([4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("dá o dobro de chance ao mais caro dos dois planos de entrada (10.000 buscas)", () => {
    const entrada = [...anunciantes(10, 4), ...anunciantes(1, 2), ...anunciantes(1, 1)];
    let maisCaroNaVaga = 0;
    for (let semente = 0; semente < 10_000; semente++) {
      if (ordenarResultados(entrada, { ...padrao, semente })[9]!.nivelPlano === 2) maisCaroNaVaga++;
    }
    expect(Math.abs(maisCaroNaVaga / 10_000 - 2 / 3)).toBeLessThan(0.03);
  });
});

describe("Mais perto de mim", () => {
  const distancia: OpcoesOrdenacao = { ...padrao, modo: "distancia" };

  it("ordena do mais perto para o mais longe, com quem não tem distância no fim", () => {
    const entrada = [
      { id: "longe", nivelPlano: 4, distanciaKm: 5 },
      { id: "sem", nivelPlano: 4 },
      { id: "perto", nivelPlano: 1, distanciaKm: 0.4 },
      { id: "meio", nivelPlano: 2, distanciaKm: 2 },
    ];
    expect(ids(ordenarResultados(entrada, distancia))).toEqual(["perto", "meio", "longe", "sem"]);
  });

  it("mantém os patrocinados no topo, mesmo mais longe", () => {
    const entrada = [
      { id: "perto", nivelPlano: 4, distanciaKm: 0.1 },
      { id: "patrocinado-longe", nivelPlano: 1, distanciaKm: 9, patrocinio: "patrocinado" as const },
      { id: "meio", nivelPlano: 2, distanciaKm: 3 },
    ];
    expect(ids(ordenarResultados(entrada, distancia))).toEqual(["patrocinado-longe", "perto", "meio"]);
  });

  it("não aplica a vaga rotativa", () => {
    const entrada = [
      ...Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, nivelPlano: 4, distanciaKm: i })),
      { id: "entrada", nivelPlano: 2, distanciaKm: 50 },
    ];
    const saida = ordenarResultados(entrada, distancia);
    expect(saida[9]!.id).toBe("s9");
    expect(saida.at(-1)!.id).toBe("entrada");
  });
});
