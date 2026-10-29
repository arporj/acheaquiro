import { describe, expect, it } from "vitest";
import {
  aplicarDescontoRepresentante,
  calcularComissao,
  calcularComissaoCarteira,
  calcularComissaoUpgrade,
  liberacaoDaComissao,
  percentualMensalAcumulado,
  saldoDoRepresentante,
  situacaoComissao,
  type PagamentoComissionavel,
  type UpgradeComissionavel,
} from "./comissao";

// Exemplo do item 4.12: o representante João traz a Padaria Boa Massa,
// que contrata o plano Avançado, de R$ 59,90 por mês.
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
    // Avançado anual de Fundador: R$ 299,50. 135% de R$ 29,95 = R$ 40,4325 → R$ 40,43
    expect(valor({ periodicidade: "anual", valorPagoCentavos: 29950 })).toBe(4043);
  });

  it("arredonda metade para cima com centavos quebrados", () => {
    // Inicial do autônomo, anual de Fundador: R$ 9,95. 135% de R$ 0,995 = R$ 1,34325 → R$ 1,34
    expect(valor({ periodicidade: "anual", valorPagoCentavos: 995 })).toBe(134);
    // Essencial do autônomo, anual de Fundador: R$ 49,50. 135% de R$ 4,95 = R$ 6,6825 → R$ 6,68
    expect(valor({ periodicidade: "anual", valorPagoCentavos: 4950 })).toBe(668);
  });
});

describe("renovação do anual", () => {
  it("não gera nova comissão: os 135% são pagos uma vez", () => {
    expect(valor({ periodicidade: "anual", valorPagoCentavos: 59900, numeroMensalidade: 2 })).toBeNull();
  });
});

describe("extras com o atendimento do representante, junto com a assinatura ou depois (20%, uma vez)", () => {
  it("Carrossel mensal vendido junto com a assinatura: 20% da 1ª mensalidade", () => {
    expect(calcularComissao({ ...mensalidade, origem: "extra", valorPagoCentavos: 8990 })).toEqual({
      baseCentavos: 8990,
      percentual: 20,
      valorCentavos: 1798,
    });
  });

  it("não paga nas mensalidades seguintes do extra", () => {
    expect(valor({ origem: "extra", valorPagoCentavos: 8990, numeroMensalidade: 2 })).toBeNull();
  });

  it("Carrossel anual: 20% do valor anual", () => {
    expect(valor({ origem: "extra", periodicidade: "anual", valorPagoCentavos: 89900 })).toBe(17980);
  });

  it("Banner Exclusivo: 20% da compra de dias (7 dias, R$ 174,30)", () => {
    expect(valor({ origem: "extra", valorPagoCentavos: 17430 })).toBe(3486);
  });

  it("pacote com desconto de Fundador: 20% do valor pago (R$ 2,45 → R$ 0,49)", () => {
    expect(valor({ origem: "extra", valorPagoCentavos: 245 })).toBe(49);
  });

  it("o extra contratado pelo anunciante sozinho não gera comissão", () => {
    expect(valor({ origem: "extra", temRepresentante: false })).toBeNull();
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

describe("patrocínio (20% do valor pago no contrato, de uma vez)", () => {
  it("cota Ouro de R$ 1.800,00: R$ 360,00", () => {
    expect(valor({ origem: "patrocinio", periodicidade: "anual", valorPagoCentavos: 180000 })).toBe(36000);
  });

  it("troca de cota no meio do contrato: 20% da diferença paga", () => {
    expect(valor({ origem: "patrocinio", periodicidade: "anual", valorPagoCentavos: 120000 })).toBe(24000);
  });

  it("um novo pagamento do mesmo contrato não gera comissão", () => {
    expect(valor({ origem: "patrocinio", numeroMensalidade: 2 })).toBeNull();
  });
});

// Exemplo do item 4.12: Maria vende o Essencial (R$ 19,90) e depois a mudança para o Avançado (R$ 59,90).
describe("mudança para um plano maior", () => {
  const upgrade: UpgradeComissionavel = {
    mensalidadeNovaCentavos: 5990,
    maiorMensalidadeComissionadaCentavos: 1990,
    periodicidade: "mensal",
    numeroMensalidade: 1,
    temRepresentante: true,
    pagamentoConfirmado: true,
  };
  const valorUpgrade = (p: Partial<UpgradeComissionavel>) => calcularComissaoUpgrade({ ...upgrade, ...p })?.valorCentavos ?? null;

  it("mensal: 100%, 20%, 10% e 5% da diferença de R$ 40,00, total de R$ 54,00", () => {
    expect([1, 2, 3, 4, 5].map((numeroMensalidade) => valorUpgrade({ numeroMensalidade }))).toEqual([4000, 800, 400, 200, null]);
  });

  it("anual: 135% da diferença de uma vez, R$ 54,00, e nada na renovação", () => {
    expect(calcularComissaoUpgrade({ ...upgrade, periodicidade: "anual" })).toEqual({ baseCentavos: 4000, percentual: 135, valorCentavos: 5400 });
    expect(valorUpgrade({ periodicidade: "anual", numeroMensalidade: 2 })).toBeNull();
  });

  it("somado ao Essencial, dá o mesmo que vender o Avançado desde o início (R$ 80,87)", () => {
    expect(calcularComissao({ ...mensalidade, periodicidade: "anual", valorPagoCentavos: 19900 })!.valorCentavos + 5400).toBe(8087);
  });

  it("conta a partir do maior plano já comissionado: descer e subir de novo não gera comissão", () => {
    expect(valorUpgrade({ maiorMensalidadeComissionadaCentavos: 5990 })).toBeNull();
    expect(valorUpgrade({ mensalidadeNovaCentavos: 3990, maiorMensalidadeComissionadaCentavos: 5990 })).toBeNull();
  });

  it("anunciante que entrou sem representante: a diferença é sobre zero", () => {
    expect(valorUpgrade({ maiorMensalidadeComissionadaCentavos: 0 })).toBe(5990);
  });

  it("sem atendimento ou sem pagamento confirmado, nada", () => {
    expect(valorUpgrade({ temRepresentante: false })).toBeNull();
    expect(valorUpgrade({ pagamentoConfirmado: false })).toBeNull();
  });

  it("recusa valores inválidos", () => {
    expect(() => valorUpgrade({ mensalidadeNovaCentavos: 10.5 })).toThrow(RangeError);
    expect(() => valorUpgrade({ maiorMensalidadeComissionadaCentavos: -1 })).toThrow(RangeError);
    expect(() => valorUpgrade({ numeroMensalidade: 0 })).toThrow(RangeError);
  });
});

describe("desconto dado pelo representante", () => {
  it("exemplo do item 4.12: R$ 20,00 de desconto num plano de R$ 100,00 com comissão de R$ 20,00", () => {
    expect(aplicarDescontoRepresentante({ valorCentavos: 10000, comissaoCentavos: 2000, descontoCentavos: 2000 })).toEqual({
      valorCobradoCentavos: 8000,
      comissaoCentavos: 0,
    });
  });

  it("desconto menor que a comissão: o representante recebe a diferença", () => {
    expect(aplicarDescontoRepresentante({ valorCentavos: 5990, comissaoCentavos: 5990, descontoCentavos: 1000 })).toEqual({
      valorCobradoCentavos: 4990,
      comissaoCentavos: 4990,
    });
  });

  it("recusa desconto maior que a comissão ou valores inválidos", () => {
    expect(() => aplicarDescontoRepresentante({ valorCentavos: 10000, comissaoCentavos: 2000, descontoCentavos: 2001 })).toThrow(RangeError);
    expect(() => aplicarDescontoRepresentante({ valorCentavos: 10000, comissaoCentavos: 2000, descontoCentavos: -1 })).toThrow(RangeError);
    expect(() => aplicarDescontoRepresentante({ valorCentavos: 1.5, comissaoCentavos: 0, descontoCentavos: 0 })).toThrow(RangeError);
  });
});

describe("espera de 7 dias", () => {
  it("libera 7 dias depois da confirmação do pagamento", () => {
    expect(liberacaoDaComissao("2026-11-10")).toBe("2026-11-17");
  });

  it("aguardando até a véspera, liberada no dia; paga e cancelada valem sobre a data", () => {
    const base = { liberaEm: "2026-11-17", cancelada: false, paga: false };
    expect(situacaoComissao({ ...base, hoje: "2026-11-16" })).toBe("aguardando");
    expect(situacaoComissao({ ...base, hoje: "2026-11-17" })).toBe("liberada");
    expect(situacaoComissao({ ...base, hoje: "2026-11-20", paga: true })).toBe("paga");
    expect(situacaoComissao({ ...base, hoje: "2026-11-12", cancelada: true })).toBe("cancelada");
  });
});

describe("troca do mensal para o anual (decisão M1)", () => {
  const anual = (mensalidadesComissionadasAntes: number, numeroMensalidade = mensalidadesComissionadasAntes + 1) =>
    valor({ periodicidade: "anual", valorPagoCentavos: 59900, numeroMensalidade, mensalidadesComissionadasAntes });

  it("depois de 1 mensalidade (100%), o anual completa os 35%: R$ 20,97, total de R$ 80,87", () => {
    expect(anual(1)).toBe(2097);
    expect(5990 + anual(1)!).toBe(8087);
  });

  it("depois de 2 mensalidades (120%), completa 15%; depois de 4, nada", () => {
    expect(anual(2)).toBe(899);
    expect(anual(4)).toBeNull();
    expect(anual(7)).toBeNull();
  });

  it("renovação do anual (sem mensal antes) continua sem comissão", () => {
    expect(anual(0, 2)).toBeNull();
  });

  it("percentual acumulado do mensal: 0, 100, 120, 130, 135 e 135", () => {
    expect([0, 1, 2, 3, 4, 5].map(percentualMensalAcumulado)).toEqual([0, 100, 120, 130, 135, 135]);
    expect(() => percentualMensalAcumulado(-1)).toThrow(RangeError);
    expect(() => percentualMensalAcumulado(1.5)).toThrow(RangeError);
  });
});

describe("carteira (decisões N1 a N3)", () => {
  it("5% sobre o pagamento fora da fase de venda, arredondando metade para cima", () => {
    expect(calcularComissaoCarteira({ valorPagoCentavos: 5990, percentual: 5, faseDeVenda: false })).toEqual({
      baseCentavos: 5990,
      percentual: 5,
      valorCentavos: 300,
    });
  });

  it("extra: 20% na venda (1º mês) e 5% de carteira depois", () => {
    expect(valor({ origem: "extra", valorPagoCentavos: 8990 })).toBe(1798);
    expect(calcularComissaoCarteira({ valorPagoCentavos: 8990, percentual: 5, faseDeVenda: true })).toBeNull();
    expect(calcularComissaoCarteira({ valorPagoCentavos: 8990, percentual: 5, faseDeVenda: false })?.valorCentavos).toBe(450);
  });

  it("sem carteira com percentual zero ou valor que arredonda para zero", () => {
    expect(calcularComissaoCarteira({ valorPagoCentavos: 5990, percentual: 0, faseDeVenda: false })).toBeNull();
    expect(calcularComissaoCarteira({ valorPagoCentavos: 9, percentual: 5, faseDeVenda: false })).toBeNull();
  });

  it("recusa percentual ou valor inválidos", () => {
    expect(() => calcularComissaoCarteira({ valorPagoCentavos: 100, percentual: 5.5, faseDeVenda: false })).toThrow(RangeError);
    expect(() => calcularComissaoCarteira({ valorPagoCentavos: 100, percentual: 101, faseDeVenda: false })).toThrow(RangeError);
    expect(() => calcularComissaoCarteira({ valorPagoCentavos: -1, percentual: 5, faseDeVenda: false })).toThrow(RangeError);
  });
});

describe("saldo do representante (pagamento do saldo inteiro, decisão P2)", () => {
  const c = (id: string, valorCentavos: number, liberaEm: string, extra: { cancelada?: boolean; paga?: boolean } = {}) => ({
    id,
    valorCentavos,
    liberaEm,
    cancelada: extra.cancelada ?? false,
    paga: extra.paga ?? false,
  });

  it("separa aguardando, liberado e pago; cancelada não conta", () => {
    const saldo = saldoDoRepresentante(
      [c("a", 5990, "2026-11-20"), c("b", 4043, "2026-11-10"), c("c", 1198, "2026-11-01", { paga: true }), c("d", 300, "2026-11-01", { cancelada: true })],
      "2026-11-15",
    );
    expect(saldo).toEqual({ aguardandoCentavos: 5990, liberadoCentavos: 4043, pagoCentavos: 1198, aPagar: ["b"] });
  });

  it("o desconto de contestação entra no próximo pagamento", () => {
    const saldo = saldoDoRepresentante([c("a", 4043, "2026-11-10"), c("b", -1000, "2026-11-12")], "2026-11-15");
    expect(saldo.liberadoCentavos).toBe(3043);
    expect(saldo.aPagar).toEqual(["a", "b"]);
  });

  it("desconto maior que o liberado deixa o saldo negativo, sem nada a pagar", () => {
    expect(saldoDoRepresentante([c("b", -1000, "2026-11-12")], "2026-11-15").liberadoCentavos).toBe(-1000);
  });
});
