import { describe, expect, it } from "vitest";
import { criarAleatorio, embaralhar, sortearComPeso } from "./sorteio";

describe("criarAleatorio", () => {
  it("produz a mesma sequência com a mesma semente", () => {
    const a = criarAleatorio(42);
    const b = criarAleatorio(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("produz sequências diferentes com sementes diferentes", () => {
    expect(criarAleatorio(1)()).not.toBe(criarAleatorio(2)());
  });

  it("devolve números entre 0 (inclusive) e 1 (exclusive)", () => {
    const aleatorio = criarAleatorio(7);
    for (let i = 0; i < 1000; i++) {
      const n = aleatorio();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe("embaralhar", () => {
  it("mantém os mesmos itens e não altera a lista original", () => {
    const original = [1, 2, 3, 4, 5];
    const embaralhada = embaralhar(original, criarAleatorio(3));
    expect([...embaralhada].sort()).toEqual(original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });

  it("dá o mesmo resultado com a mesma semente", () => {
    const lista = ["a", "b", "c", "d", "e", "f"];
    expect(embaralhar(lista, criarAleatorio(9))).toEqual(embaralhar(lista, criarAleatorio(9)));
  });
});

describe("sortearComPeso", () => {
  it("não repete itens e respeita a quantidade", () => {
    const itens = ["a", "b", "c", "d"].map((item) => ({ item, peso: 1 }));
    const sorteados = sortearComPeso(itens, 3, criarAleatorio(5));
    expect(sorteados).toHaveLength(3);
    expect(new Set(sorteados).size).toBe(3);
  });

  it("devolve todos quando a quantidade é maior que a lista", () => {
    const itens = ["a", "b"].map((item) => ({ item, peso: 1 }));
    expect(sortearComPeso(itens, 5, criarAleatorio(5)).sort()).toEqual(["a", "b"]);
  });

  it("dá o dobro de chance ao item de peso 2 (10.000 sorteios, tolerância de 3 pontos)", () => {
    const aleatorio = criarAleatorio(2026);
    const itens = [
      { item: "peso2", peso: 2 },
      { item: "peso1", peso: 1 },
    ];
    let vezesPeso2 = 0;
    for (let i = 0; i < 10_000; i++) {
      if (sortearComPeso(itens, 1, aleatorio)[0] === "peso2") vezesPeso2++;
    }
    expect(vezesPeso2 / 10_000).toBeCloseTo(2 / 3, 1);
    expect(Math.abs(vezesPeso2 / 10_000 - 2 / 3)).toBeLessThan(0.03);
  });

  it("recusa peso zero ou negativo", () => {
    expect(() => sortearComPeso([{ item: "a", peso: 0 }], 1, criarAleatorio(1))).toThrow(RangeError);
  });

  it("usa o último item quando o arredondamento passa do total", () => {
    const quaseUm = () => 0.9999999999999999;
    expect(sortearComPeso([{ item: "a", peso: 0.1 }, { item: "b", peso: 0.2 }], 1, quaseUm)).toEqual(["b"]);
  });
});
