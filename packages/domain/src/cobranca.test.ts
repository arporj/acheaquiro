import { describe, expect, it } from "vitest";
import {
  aplicarPercentual,
  calcularCobrancaExtra,
  calcularCobrancaPlano,
  dataDeVencimento,
  efeitoDoVencimento,
  perdeCondicaoFundador,
  situacaoAssinatura,
  tornaFundador,
  type ValoresExtra,
  type ValoresPlano,
} from "./cobranca";

// Números de exemplo: na aplicação, vêm das tabelas de planos e configurações.
const vitrine: ValoresPlano = { valorMensalCentavos: 5990, mesesCobradosNoAnual: 10 };
const basicoAutonomo: ValoresPlano = { valorMensalCentavos: 199, mesesCobradosNoAnual: 10 };
const semFundador = { fundador: false, percentualFundador: 50 };
const comFundador = { fundador: true, percentualFundador: 50 };

describe("aplicarPercentual", () => {
  it("arredonda metade para cima, como no exemplo do item 4.12", () => {
    expect(aplicarPercentual(5990, 5)).toBe(300); // R$ 2,995 → R$ 3,00
    expect(aplicarPercentual(5990, 20)).toBe(1198);
    expect(aplicarPercentual(5990, 10)).toBe(599);
    expect(aplicarPercentual(5990, 135)).toBe(8087);
  });

  it("recusa valores que não são inteiros ou são negativos", () => {
    expect(() => aplicarPercentual(10.5, 5)).toThrow(RangeError);
    expect(() => aplicarPercentual(100, -5)).toThrow(RangeError);
  });
});

describe("calcularCobrancaPlano", () => {
  it("mensal sem Fundador", () => {
    expect(calcularCobrancaPlano(vitrine, "mensal", semFundador)).toEqual({
      valorCheioCentavos: 5990,
      descontoFundadorCentavos: 0,
      valorDevidoCentavos: 5990,
    });
  });

  it("anual custa 10 mensalidades", () => {
    expect(calcularCobrancaPlano(vitrine, "anual", semFundador).valorDevidoCentavos).toBe(59900);
  });

  it("anual com Fundador tem 50% de desconto", () => {
    expect(calcularCobrancaPlano(vitrine, "anual", comFundador)).toEqual({
      valorCheioCentavos: 59900,
      descontoFundadorCentavos: 29950,
      valorDevidoCentavos: 29950,
    });
    expect(calcularCobrancaPlano(basicoAutonomo, "anual", comFundador).valorDevidoCentavos).toBe(995);
  });

  it("recusa o plano mensal com desconto de Fundador: a renovação do Fundador é anual", () => {
    expect(() => calcularCobrancaPlano(vitrine, "mensal", comFundador)).toThrow(RangeError);
  });
});

describe("calcularCobrancaExtra", () => {
  const pacoteDeFotos: ValoresExtra = {
    valorMensalCentavos: 490,
    mesesCobradosNoAnual: 10,
    aceitaDescontoFundador: true,
    permiteAnual: true,
  };
  const superDestaque: ValoresExtra = { ...pacoteDeFotos, valorMensalCentavos: 8990, aceitaDescontoFundador: false };
  const soMensal: ValoresExtra = { ...superDestaque, permiteAnual: false };

  it("pacote mensal com Fundador tem 50% de desconto", () => {
    expect(calcularCobrancaExtra(pacoteDeFotos, "mensal", comFundador)).toEqual({
      valorCheioCentavos: 490,
      descontoFundadorCentavos: 245,
      valorDevidoCentavos: 245,
    });
  });

  it("pacote sem Fundador paga o valor cheio", () => {
    expect(calcularCobrancaExtra(pacoteDeFotos, "mensal", semFundador).valorDevidoCentavos).toBe(490);
  });

  it("destaque não tem desconto, mesmo para Fundador", () => {
    expect(calcularCobrancaExtra(superDestaque, "mensal", comFundador)).toEqual({
      valorCheioCentavos: 8990,
      descontoFundadorCentavos: 0,
      valorDevidoCentavos: 8990,
    });
  });

  it("vendido junto com a assinatura anual, custa 10 mensalidades", () => {
    expect(calcularCobrancaExtra(pacoteDeFotos, "anual", comFundador).valorDevidoCentavos).toBe(2450);
    expect(calcularCobrancaExtra(superDestaque, "anual", semFundador).valorDevidoCentavos).toBe(89900);
  });

  it("centavos ímpares: arredonda o valor devido e o desconto fecha a conta", () => {
    expect(calcularCobrancaExtra({ ...pacoteDeFotos, valorMensalCentavos: 199 }, "mensal", comFundador)).toEqual({
      valorCheioCentavos: 199,
      descontoFundadorCentavos: 99,
      valorDevidoCentavos: 100,
    });
  });

  it("extra sem venda no anual recusa o anual", () => {
    expect(() => calcularCobrancaExtra(soMensal, "anual", semFundador)).toThrow(RangeError);
    expect(calcularCobrancaExtra(soMensal, "mensal", semFundador).valorDevidoCentavos).toBe(8990);
  });
});

describe("tornaFundador", () => {
  const anualNoPrazo = {
    periodicidade: "anual" as const,
    valorMensalPlanoCentavos: 5990,
    comprovanteEnviadoEm: "2026-11-26",
    prazoFundador: "2026-11-26",
  };

  it("vira Fundador com o anual pago até o último dia do prazo", () => {
    expect(tornaFundador(anualNoPrazo)).toBe(true);
  });

  it("não vira Fundador no plano mensal", () => {
    expect(tornaFundador({ ...anualNoPrazo, periodicidade: "mensal" })).toBe(false);
  });

  it("não vira Fundador depois do prazo", () => {
    expect(tornaFundador({ ...anualNoPrazo, comprovanteEnviadoEm: "2026-11-27" })).toBe(false);
  });

  it("não vira Fundador no plano Gratuito do comércio", () => {
    expect(tornaFundador({ ...anualNoPrazo, valorMensalPlanoCentavos: 0 })).toBe(false);
  });
});

describe("vencimento", () => {
  it("mensal vence 1 mês depois e anual, 12 meses depois", () => {
    expect(dataDeVencimento("2026-11-27", "mensal")).toBe("2026-12-27");
    expect(dataDeVencimento("2026-11-27", "anual")).toBe("2027-11-27");
  });

  it("aguarda pagamento enquanto a equipe não confirma o Pix", () => {
    expect(situacaoAssinatura({ pagamentoConfirmado: false, venceEm: "2026-12-27", hoje: "2026-11-27" })).toBe(
      "aguardando_pagamento",
    );
  });

  it("fica ativa até o fim do dia do vencimento e vence no dia seguinte", () => {
    expect(situacaoAssinatura({ pagamentoConfirmado: true, venceEm: "2026-12-27", hoje: "2026-12-27" })).toBe("ativa");
    expect(situacaoAssinatura({ pagamentoConfirmado: true, venceEm: "2026-12-27", hoje: "2026-12-28" })).toBe("vencida");
  });

  it("esconde o autônomo e passa o comércio para o Gratuito", () => {
    expect(efeitoDoVencimento("profissional")).toBe("escondido_por_vencimento");
    expect(efeitoDoVencimento("comercio")).toBe("plano_gratuito");
  });
});

describe("perdeCondicaoFundador", () => {
  const base = { venceuEm: "2026-12-27", toleranciaDias: 7 };

  it("mantém quando a renovação é paga dentro de 7 dias", () => {
    expect(perdeCondicaoFundador({ ...base, renovadaEm: "2027-01-03", hoje: "2027-01-10" })).toBe(false);
  });

  it("perde quando a renovação é paga depois de 7 dias", () => {
    expect(perdeCondicaoFundador({ ...base, renovadaEm: "2027-01-04", hoje: "2027-01-04" })).toBe(true);
  });

  it("mantém enquanto ainda está dentro da tolerância, sem pagamento", () => {
    expect(perdeCondicaoFundador({ ...base, hoje: "2027-01-03" })).toBe(false);
  });

  it("perde quando a tolerância acaba sem pagamento", () => {
    expect(perdeCondicaoFundador({ ...base, hoje: "2027-01-04" })).toBe(true);
  });

  it("mantém quando renova no anual, dentro do prazo", () => {
    expect(
      perdeCondicaoFundador({ ...base, renovadaEm: "2026-12-20", periodicidadeRenovacao: "anual", hoje: "2026-12-20" }),
    ).toBe(false);
  });

  it("perde quando renova no mensal, mesmo pagando em dia", () => {
    expect(
      perdeCondicaoFundador({ ...base, renovadaEm: "2026-12-20", periodicidadeRenovacao: "mensal", hoje: "2026-12-20" }),
    ).toBe(true);
  });
});
