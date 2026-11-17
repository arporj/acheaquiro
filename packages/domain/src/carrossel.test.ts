import { describe, expect, it } from "vitest";
import { VAGAS_CARROSSEL, composicaoCarrossel } from "./carrossel";

describe("composicaoCarrossel", () => {
  it("vazio: sequência do Ache Aqui com atalhos e dois convites, ocupando as vagas", () => {
    const vazio = composicaoCarrossel(0);
    expect(vazio).toEqual({ atalhos: 6, convites: 2 });
    expect(vazio.atalhos + vazio.convites).toBe(VAGAS_CARROSSEL);
  });

  it("com vaga sobrando: só um convite, sem atalhos", () => {
    expect(composicaoCarrossel(1)).toEqual({ atalhos: 0, convites: 1 });
    expect(composicaoCarrossel(7)).toEqual({ atalhos: 0, convites: 1 });
  });

  it("cheio: só os anunciantes", () => {
    expect(composicaoCarrossel(8)).toEqual({ atalhos: 0, convites: 0 });
    expect(composicaoCarrossel(9)).toEqual({ atalhos: 0, convites: 0 });
  });

  it("respeita outra quantidade de vagas", () => {
    expect(composicaoCarrossel(0, 4)).toEqual({ atalhos: 2, convites: 2 });
    expect(composicaoCarrossel(4, 4)).toEqual({ atalhos: 0, convites: 0 });
  });

  it("recusa quantidade inválida", () => {
    expect(() => composicaoCarrossel(-1)).toThrow();
    expect(() => composicaoCarrossel(1.5)).toThrow();
  });
});
