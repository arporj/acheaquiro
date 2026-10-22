import { describe, expect, it } from "vitest";
import {
  ordenarResultados,
  pesoPatrocinio,
  type CandidatoLista,
  type OpcoesOrdenacao,
  type Patrocinio,
} from "./ordenacao";

// Níveis como na tabela de planos dos autônomos: 1 Básico, 2 Profissional,
// 3 Premium, 4 SuperPremium. Os de entrada são 2 (mais caro) e 1.
const padrao: OpcoesOrdenacao = { modo: "padrao", semente: 1, niveisEntrada: { maisCaro: 2, maisBarato: 1 } };
const semEntrada = { maisCaro: -1, maisBarato: -2 };

const cidade: Patrocinio[] = [{ plus: false }];
const cidadePlus: Patrocinio[] = [{ plus: true }];
const bairros = (...bairroIds: string[]): Patrocinio[] => [{ plus: false, bairroIds }];

let contador = 0;
function anunciantes(quantidade: number, nivelPlano: number, extra: Partial<CandidatoLista> = {}): CandidatoLista[] {
  return Array.from({ length: quantidade }, () => ({ id: `a${++contador}`, nivelPlano, ...extra }));
}

function ids(lista: readonly CandidatoLista[]) {
  return lista.map((c) => c.id);
}

/** A lista do plano tem todos os candidatos, cada um uma vez só. */
function listaCompleta(entrada: CandidatoLista[], lista: CandidatoLista[]) {
  expect(lista).toHaveLength(entrada.length);
  expect([...ids(lista)].sort()).toEqual([...ids(entrada)].sort());
}

describe("destacados no topo", () => {
  it("sem destacados, o topo fica vazio e a lista começa pelo maior plano", () => {
    const entrada = [...anunciantes(2, 1), ...anunciantes(2, 4)];
    const { destacados, lista } = ordenarResultados(entrada, padrao);
    expect(destacados).toEqual([]);
    expect(lista.slice(0, 2).every((c) => c.nivelPlano === 4)).toBe(true);
    listaCompleta(entrada, lista);
  });

  it("com 2 destacados da cidade toda, os 2 vão para o topo", () => {
    const destacados = anunciantes(2, 1, { patrocinios: cidade });
    const entrada = [...anunciantes(4, 4), ...destacados];
    const resultado = ordenarResultados(entrada, padrao);
    expect(ids(resultado.destacados).sort()).toEqual(ids(destacados).sort());
  });

  it("o destacado continua também na posição do seu plano", () => {
    const [destacado] = anunciantes(1, 1, { patrocinios: cidade });
    const entrada = [...anunciantes(4, 4), destacado!];
    const { destacados, lista } = ordenarResultados(entrada, padrao);
    expect(ids(destacados)).toEqual([destacado!.id]);
    expect(lista.at(-1)!.id).toBe(destacado!.id);
    listaCompleta(entrada, lista);
  });

  it("com 5 destacados, sorteia 3 para o topo; todos seguem no grupo do plano", () => {
    const destacados = anunciantes(5, 3, { patrocinios: cidade });
    const entrada = [...anunciantes(2, 4), ...destacados, ...anunciantes(2, 1)];
    const resultado = ordenarResultados(entrada, padrao);
    expect(resultado.destacados).toHaveLength(3);
    expect(resultado.lista.map((c) => c.nivelPlano)).toEqual([4, 4, 3, 3, 3, 3, 3, 1, 1]);
    listaCompleta(entrada, resultado.lista);
  });

  it("dá o dobro de chance ao Destacado Plus (10.000 buscas, tolerância de 3 pontos)", () => {
    // 1 Plus + 3 simples disputando 3 vagas: o Plus entra em 90% das buscas e
    // cada simples em 70% (fica de fora só quando saem os 3 simples).
    const [plus] = anunciantes(1, 2, { patrocinios: cidadePlus });
    const simples = anunciantes(3, 2, { patrocinios: cidade });
    const entrada = [plus!, ...simples];
    let plusNoTopo = 0;
    let simplesNoTopo = 0;
    for (let semente = 0; semente < 10_000; semente++) {
      const topo = ids(ordenarResultados(entrada, { ...padrao, semente }).destacados);
      if (topo.includes(plus!.id)) plusNoTopo++;
      if (topo.includes(simples[0]!.id)) simplesNoTopo++;
    }
    expect(Math.abs(plusNoTopo / 10_000 - 0.9)).toBeLessThan(0.03);
    expect(Math.abs(simplesNoTopo / 10_000 - 0.7)).toBeLessThan(0.03);
  });
});

describe("patrocínio na cidade toda ou em bairros", () => {
  // Exemplo da conversa de 20/10/2026: João patrocina 3 bairros, Pedro a cidade toda.
  const joao = { id: "joao", nivelPlano: 2, patrocinios: bairros("costazul", "recreio", "jardim-marilea") };
  const pedro = { id: "pedro", nivelPlano: 2, patrocinios: cidade };
  const entrada = [joao, pedro, ...anunciantes(3, 4)];

  it("sem bairro escolhido, só a cidade toda disputa o topo", () => {
    expect(ids(ordenarResultados(entrada, padrao).destacados)).toEqual(["pedro"]);
  });

  it("num bairro do pacote, entram o pacote e a cidade toda", () => {
    const topo = ordenarResultados(entrada, { ...padrao, bairro: "costazul" }).destacados;
    expect(ids(topo).sort()).toEqual(["joao", "pedro"]);
  });

  it("num bairro fora do pacote, só a cidade toda", () => {
    expect(ids(ordenarResultados(entrada, { ...padrao, bairro: "centro" }).destacados)).toEqual(["pedro"]);
  });

  it("o pacote de bairros fora do topo continua na lista do plano", () => {
    const { lista } = ordenarResultados(entrada, padrao);
    expect(ids(lista)).toContain("joao");
    listaCompleta(entrada, lista);
  });

  it("calcula o peso pelo melhor patrocínio que vale no bairro", () => {
    const misto: Patrocinio[] = [{ plus: false }, { plus: true, bairroIds: ["costazul"] }];
    expect(pesoPatrocinio(misto, "costazul")).toBe(2);
    expect(pesoPatrocinio(misto, "centro")).toBe(1);
    expect(pesoPatrocinio(misto, undefined)).toBe(1);
    expect(pesoPatrocinio(bairros("costazul"), undefined)).toBe(0);
    expect(pesoPatrocinio(undefined, "costazul")).toBe(0);
  });
});

describe("grupos de plano", () => {
  it("ordena os grupos do maior para o menor nível", () => {
    const entrada = [...anunciantes(2, 1), ...anunciantes(2, 3), ...anunciantes(2, 2), ...anunciantes(2, 4)];
    const { lista } = ordenarResultados(entrada, padrao);
    expect(lista.map((c) => c.nivelPlano)).toEqual([4, 4, 3, 3, 2, 2, 1, 1]);
  });

  it("alterna a ordem dentro do grupo conforme a semente", () => {
    const entrada = anunciantes(6, 4);
    const ordens = new Set(
      Array.from({ length: 20 }, (_, semente) => ids(ordenarResultados(entrada, { ...padrao, semente }).lista).join()),
    );
    expect(ordens.size).toBeGreaterThan(1);
  });

  it("produz a mesma lista com a mesma semente", () => {
    const entrada = [...anunciantes(8, 4), ...anunciantes(6, 2), ...anunciantes(4, 1, { patrocinios: cidadePlus })];
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
    const { lista } = ordenarResultados(entrada, padrao);
    expect(lista[9]!.nivelPlano).toBe(2);
    expect(lista[10]!.nivelPlano).toBe(4);
    listaCompleta(entrada, lista);
  });

  it("conta as posições da página, com os destacados do topo", () => {
    // 2 no topo + lista: a 10ª posição da página é a 8ª da lista.
    const entrada = [...anunciantes(2, 3, { patrocinios: cidade }), ...anunciantes(10, 4), ...anunciantes(1, 1)];
    const { destacados, lista } = ordenarResultados(entrada, padrao);
    expect(destacados).toHaveLength(2);
    expect(lista[7]!.nivelPlano).toBe(1);
    listaCompleta(entrada, lista);
  });

  it("com 25 anunciantes, ocupa a 10ª e a 20ª posições", () => {
    const entrada = [...anunciantes(20, 4), ...anunciantes(3, 2), ...anunciantes(2, 1)];
    const { lista } = ordenarResultados(entrada, padrao);
    expect([lista[9]!.nivelPlano, lista[19]!.nivelPlano].every((n) => n <= 2)).toBe(true);
    expect(lista.slice(0, 9).every((c) => c.nivelPlano === 4)).toBe(true);
    listaCompleta(entrada, lista);
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
    const { lista } = ordenarResultados(entrada, padrao);
    expect(lista.map((c) => c.nivelPlano)).toEqual([4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("dá o dobro de chance ao mais caro dos dois planos de entrada (10.000 buscas)", () => {
    const entrada = [...anunciantes(10, 4), ...anunciantes(1, 2), ...anunciantes(1, 1)];
    let maisCaroNaVaga = 0;
    for (let semente = 0; semente < 10_000; semente++) {
      if (ordenarResultados(entrada, { ...padrao, semente }).lista[9]!.nivelPlano === 2) maisCaroNaVaga++;
    }
    expect(Math.abs(maisCaroNaVaga / 10_000 - 2 / 3)).toBeLessThan(0.03);
  });
});

describe("comércios com bairro escolhido", () => {
  // Decisão de 20/10/2026: ninguém sai da lista; o bairro escolhido vem primeiro.
  const opcoes: OpcoesOrdenacao = { ...padrao, bairro: "costazul", priorizarBairro: true };
  const noBairro = (id: string, nivelPlano: number, distanciaKm: number) => ({
    id,
    nivelPlano,
    distanciaKm,
    bairroIds: ["costazul"],
  });
  const fora = (id: string, nivelPlano: number, distanciaKm: number) => ({
    id,
    nivelPlano,
    distanciaKm,
    bairroIds: ["centro"],
  });
  const entrada = [
    fora("centro-premium-longe", 4, 9),
    noBairro("costazul-basico-longe", 2, 5),
    fora("centro-gratuito-perto", 1, 0.3),
    noBairro("costazul-premium-perto", 4, 0.5),
    fora("centro-vitrine-meio", 3, 2),
  ];

  it("põe os do bairro primeiro, pela regra dos planos, mesmo os mais longe", () => {
    const { lista, noBairro: quantidade } = ordenarResultados(entrada, opcoes);
    expect(quantidade).toBe(2);
    expect(ids(lista.slice(0, 2))).toEqual(["costazul-premium-perto", "costazul-basico-longe"]);
    listaCompleta(entrada, lista);
  });

  it("sem a localização do visitante, os de outros bairros seguem a regra dos planos", () => {
    const { lista } = ordenarResultados(entrada, opcoes);
    expect(ids(lista.slice(2))).toEqual(["centro-premium-longe", "centro-vitrine-meio", "centro-gratuito-perto"]);
  });

  it("com a localização, os de outros bairros vão do mais perto ao mais longe", () => {
    const { lista } = ordenarResultados(entrada, { ...opcoes, outrosBairrosPorDistancia: true });
    expect(ids(lista.slice(2))).toEqual(["centro-gratuito-perto", "centro-vitrine-meio", "centro-premium-longe"]);
  });

  it("o destacado da cidade toda de outro bairro vai para o topo e continua no seu grupo", () => {
    const destacado = { ...fora("centro-destacado", 2, 7), patrocinios: cidade };
    const { destacados, lista } = ordenarResultados([...entrada, destacado], opcoes);
    expect(ids(destacados)).toEqual(["centro-destacado"]);
    expect(ids(lista.slice(2))).toContain("centro-destacado");
  });

  it("aplica a vaga rotativa dentro do bairro", () => {
    const doBairro = [
      ...anunciantes(10, 4, { bairroIds: ["costazul"] }),
      ...anunciantes(1, 2, { bairroIds: ["costazul"] }),
    ];
    const { lista } = ordenarResultados([...doBairro, ...anunciantes(3, 4, { bairroIds: ["centro"] })], opcoes);
    expect(lista[9]!.nivelPlano).toBe(2);
  });

  it("não desmancha a ordem por distância dos outros bairros com a vaga rotativa", () => {
    const outros = Array.from({ length: 12 }, (_, i) => ({
      id: `fora${i}`,
      nivelPlano: i === 11 ? 1 : 4,
      distanciaKm: i + 1,
      bairroIds: ["centro"],
    }));
    const entradaGrande = [noBairro("costazul-1", 4, 20), ...outros];
    const { lista } = ordenarResultados(entradaGrande, { ...opcoes, outrosBairrosPorDistancia: true });
    expect(ids(lista.slice(1))).toEqual(outros.map((o) => o.id));
  });

  it("no \"Mais perto de mim\", ignora o bairro e ordena todos pela distância", () => {
    const { lista } = ordenarResultados(entrada, { ...opcoes, modo: "distancia" });
    expect(ids(lista)[0]).toBe("centro-gratuito-perto");
  });

  it("sem bairro escolhido, nada muda", () => {
    const comPrioridade = ordenarResultados(entrada, { ...padrao, priorizarBairro: true });
    expect(comPrioridade).toEqual(ordenarResultados(entrada, padrao));
    expect(comPrioridade.noBairro).toBeUndefined();
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
    expect(ids(ordenarResultados(entrada, distancia).lista)).toEqual(["perto", "meio", "longe", "sem"]);
  });

  it("mantém os destacados no topo, mesmo mais longe, e também na posição da distância", () => {
    const entrada = [
      { id: "perto", nivelPlano: 4, distanciaKm: 0.1 },
      { id: "destacado-longe", nivelPlano: 1, distanciaKm: 9, patrocinios: cidade },
      { id: "meio", nivelPlano: 2, distanciaKm: 3 },
    ];
    const { destacados, lista } = ordenarResultados(entrada, distancia);
    expect(ids(destacados)).toEqual(["destacado-longe"]);
    expect(ids(lista)).toEqual(["perto", "meio", "destacado-longe"]);
  });

  it("não aplica a vaga rotativa", () => {
    const entrada = [
      ...Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, nivelPlano: 4, distanciaKm: i })),
      { id: "entrada", nivelPlano: 2, distanciaKm: 50 },
    ];
    const { lista } = ordenarResultados(entrada, distancia);
    expect(lista[9]!.id).toBe("s9");
    expect(lista.at(-1)!.id).toBe("entrada");
  });
});
