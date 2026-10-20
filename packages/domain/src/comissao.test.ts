import { describe, expect, it } from "vitest";
import { calcularComissao, type PagamentoComissionavel } from "./comissao";

// Exemplo do item 4.12: o representante João traz a Padaria Boa Massa,
// que contrata o plano Vitrine, de R$ 59,90 por mês.
const mensalidade: PagamentoComissionavel = {
  origem: "plano",
  periodicidade: "mensal",
  valorPagoCentavos: 5990,
  numeroMensalidade: 1,
  mesesCobradosNoAnual: 10,
  temRepresentante: true,
  pagamentoConfirmado: true,
};

const valor = (p: Partial<PagamentoComissionavel>) => calcularComissao({ ...mensalidade, ...p })?.valorCentavos ?? null;

describe("plano mensal (Padaria Boa Massa)", () => {
  it("paga 100%, 20%, 10% e 5% das 4 primeiras mensalidades, total de R$ 80,87", () => {
    const parcelas = [1, 2, 3, 4].map((numeroMensalidade) => valor({ numeroMensalidade }));
    expect(parcelas).toEqual([5990, 1198, 599, 300]);
    expect(parcelas.reduce((a, b) => a! + b!, 0)).toBe(8087);
  });

  it("não paga da 5ª mensalidade em diante", () => {
    expect(valor({ numeroMensalidade: 5 })).toBeNull();
    expect(valor({ numeroMensalidade: 12 })).toBeNull();
  });
});

describe("plano anual (Padaria Boa Massa)", () => {
  it("paga 135% de uma mensalidade de uma vez: R$ 80,87", () => {
    expect(calcularComissao({ ...mensalidade, periodicidade: "anual", valorPagoCentavos: 59900 })).toEqual({
      baseCentavos: 59900,
      percentual: 13.5,
      valorCentavos: 8087,
    });
  });
});

describe("Fundador", () => {
  it("calcula sobre o valor pago, já com 50% de desconto, no anual", () => {
    // Vitrine anual de Fundador: R$ 299,50. 135% de R$ 29,95 = R$ 40,4325 → R$ 40,43
    expect(valor({ periodicidade: "anual", valorPagoCentavos: 29950 })).toBe(4043);
  });

  it("arredonda metade para cima com centavos quebrados", () => {
    // Básico do autônomo, anual de Fundador: R$ 9,95. 135% de R$ 0,995 = R$ 1,34325 → R$ 1,34
    expect(valor({ periodicidade: "anual", valorPagoCentavos: 995 })).toBe(134);
    // Profissional anual de Fundador: R$ 49,50. 135% de R$ 4,95 = R$ 6,6825 → R$ 6,68
    expect(valor({ periodicidade: "anual", valorPagoCentavos: 4950 })).toBe(668);
  });
});

describe("renovação do anual", () => {
  it("não gera nova comissão: os 135% são pagos uma vez", () => {
    expect(valor({ periodicidade: "anual", valorPagoCentavos: 59900, numeroMensalidade: 2 })).toBeNull();
  });
});

describe("extras (20% do valor pago na venda, uma vez)", () => {
  it("Super Destaque mensal vendido junto com a assinatura: 20% da 1ª mensalidade", () => {
    expect(calcularComissao({ ...mensalidade, origem: "extra_na_assinatura", valorPagoCentavos: 8990 })).toEqual({
      baseCentavos: 8990,
      percentual: 20,
      valorCentavos: 1798,
    });
  });

  it("não paga nas mensalidades seguintes do extra", () => {
    expect(valor({ origem: "extra_na_assinatura", valorPagoCentavos: 8990, numeroMensalidade: 2 })).toBeNull();
  });

  it("Super Destaque anual: 20% do valor anual", () => {
    expect(valor({ origem: "extra_na_assinatura", periodicidade: "anual", valorPagoCentavos: 89900 })).toBe(17980);
  });

  it("Destaque Exclusivo: 20% da compra de dias (7 dias, R$ 174,30)", () => {
    expect(valor({ origem: "extra_na_assinatura", valorPagoCentavos: 17430 })).toBe(3486);
  });

  it("pacote com desconto de Fundador: 20% do valor pago (R$ 2,45 → R$ 0,49)", () => {
    expect(valor({ origem: "extra_na_assinatura", valorPagoCentavos: 245 })).toBe(49);
  });

  it("o extra contratado depois não gera comissão", () => {
    expect(valor({ origem: "extra_avulso" })).toBeNull();
  });
});

describe("quando não há comissão", () => {
  it("anunciante sem representante", () => {
    expect(valor({ temRepresentante: false })).toBeNull();
  });

  it("pagamento recusado ou ainda não confirmado", () => {
    expect(valor({ pagamentoConfirmado: false })).toBeNull();
  });
});

describe("dados inválidos", () => {
  it.each([
    { valorPagoCentavos: 10.5 },
    { valorPagoCentavos: -1 },
    { numeroMensalidade: 0 },
    { periodicidade: "anual" as const, mesesCobradosNoAnual: 0 },
  ])("recusa %o", (dados) => {
    expect(() => calcularComissao({ ...mensalidade, ...dados })).toThrow(RangeError);
  });
});
