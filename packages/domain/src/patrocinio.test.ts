import { describe, expect, it } from "vitest";
import {
  diasASomarPorSiteForaDoAr,
  fimDoPatrocinio,
  impedimentoParaEntrarNoAr,
  novaVagaAPartirDe,
  valorDoPatrocinio,
  type PatrocinioParaRegra,
} from "./patrocinio";

describe("fimDoPatrocinio", () => {
  it("dura 12 meses a partir da entrada no ar", () => {
    expect(fimDoPatrocinio("2026-11-27")).toBe("2027-11-26");
  });
  it("soma os dias de site fora do ar", () => {
    expect(fimDoPatrocinio("2026-11-27", 5)).toBe("2027-12-01");
  });
  it("entrada em 29/02 termina na véspera de 28/02 do ano seguinte", () => {
    expect(fimDoPatrocinio("2028-02-29")).toBe("2029-02-27");
  });
  it("recusa dias somados negativos", () => {
    expect(() => fimDoPatrocinio("2026-11-27", -1)).toThrow(RangeError);
  });
});

describe("diasASomarPorSiteForaDoAr", () => {
  it("não soma até 3 dias seguidos", () => {
    expect(diasASomarPorSiteForaDoAr([{ inicio: "2027-01-10", fim: "2027-01-12" }])).toBe(0);
  });
  it("com mais de 3 dias seguidos, soma o período inteiro", () => {
    expect(diasASomarPorSiteForaDoAr([{ inicio: "2027-01-10", fim: "2027-01-13" }])).toBe(4);
  });
  it("soma só os períodos longos, virando o mês", () => {
    const periodos = [
      { inicio: "2027-01-30", fim: "2027-02-03" },
      { inicio: "2027-03-01", fim: "2027-03-02" },
    ];
    expect(diasASomarPorSiteForaDoAr(periodos)).toBe(5);
  });
  it("recusa período com fim antes do início", () => {
    expect(() => diasASomarPorSiteForaDoAr([{ inicio: "2027-01-10", fim: "2027-01-09" }])).toThrow(RangeError);
  });
});

describe("valorDoPatrocinio", () => {
  const cota = { valorCentavos: 490000, valorFundadorCentavos: 400000 };
  it("até o prazo, inclusive, vale o preço de Fundador", () => {
    expect(valorDoPatrocinio(cota, "2026-11-26", "2026-11-26")).toEqual({ valorCentavos: 400000, precoFundador: true });
  });
  it("depois do prazo, vale o preço cheio", () => {
    expect(valorDoPatrocinio(cota, "2026-11-27", "2026-11-26")).toEqual({ valorCentavos: 490000, precoFundador: false });
  });
});

describe("novaVagaAPartirDe", () => {
  it("abre no dia seguinte ao fim do contrato que vence primeiro", () => {
    expect(novaVagaAPartirDe(["2027-12-01", "2027-11-26"])).toBe("2027-11-27");
  });
  it("sem contratos, não há data", () => {
    expect(novaVagaAPartirDe([])).toBeUndefined();
  });
});

describe("impedimentoParaEntrarNoAr", () => {
  const ouro = (id: string, ramo: string): PatrocinioParaRegra => ({ id, cota: "ouro", ramo });

  it("deixa entrar com vaga livre e ramo novo", () => {
    expect(impedimentoParaEntrarNoAr(ouro("n", "Imobiliária"), [ouro("a", "Banco")], 3)).toBeNull();
  });
  it("recusa quando as vagas acabaram", () => {
    const noAr = [ouro("a", "Banco"), ouro("b", "Internet"), ouro("c", "Clínica")];
    expect(impedimentoParaEntrarNoAr(ouro("n", "Autoescola"), noAr, 3)).toMatch(/3 vagas ocupadas/);
  });
  it("recusa outra empresa do mesmo ramo, sem diferença de acento, maiúsculas e espaços", () => {
    expect(impedimentoParaEntrarNoAr(ouro("n", "IMOBILIARIA "), [ouro("a", "Imobiliária")], 3)).toMatch(/ramo/);
  });
  it("no Apoio, aceita empresas do mesmo ramo", () => {
    const apoio = (id: string): PatrocinioParaRegra => ({ id, cota: "apoio", ramo: "Clínica" });
    expect(impedimentoParaEntrarNoAr(apoio("n"), [apoio("a")], 6)).toBeNull();
  });
  it("o mesmo patrocínio, ao ser salvo de novo, não conta contra si", () => {
    expect(impedimentoParaEntrarNoAr(ouro("a", "Banco"), [ouro("a", "Banco")], 1)).toBeNull();
  });
  it("ramo igual em outra cota não impede", () => {
    expect(impedimentoParaEntrarNoAr({ cota: "master", ramo: "Banco" }, [ouro("a", "Banco")], 1)).toBeNull();
  });
  it("uma empresa por grupo", () => {
    const grupo = (id: string, g: string, ramo: string): PatrocinioParaRegra => ({ id, cota: "grupo", grupo: g, ramo });
    expect(impedimentoParaEntrarNoAr(grupo("n", "Comércios", "Ferragens"), [grupo("a", "Comércios", "Depósito")], null)).toMatch(/grupo/);
    expect(impedimentoParaEntrarNoAr(grupo("n", "Saúde", "Ferragens"), [grupo("a", "Comércios", "Depósito")], null)).toBeNull();
  });
  it("uma empresa por categoria", () => {
    const cat = (id: string, c: string, ramo: string): PatrocinioParaRegra => ({ id, cota: "categoria", categoriaId: c, ramo });
    expect(impedimentoParaEntrarNoAr(cat("n", "pizzaria", "Laticínios"), [cat("a", "pizzaria", "Bebidas")], null)).toMatch(/categoria/);
  });
});
