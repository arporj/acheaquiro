import { describe, expect, it } from "vitest";
import {
  anoComoFundador,
  aplicarPercentual,
  calcularCobrancaExtra,
  calcularCobrancaPlano,
  efeitoDoVencimento,
  perdeCondicaoFundador,
  percentualFundadorNoAno,
  situacaoCobranca,
  vencimentoSeguinte,
  tornaFundador,
  validarEscalaFundador,
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
    expect(vencimentoSeguinte("2026-11-27", "2026-11-27", "mensal")).toBe("2026-12-27");
    expect(vencimentoSeguinte("2026-11-27", "2026-11-27", "anual")).toBe("2027-11-27");
  });

  it("volta ao dia da âncora depois de um mês mais curto", () => {
    expect(vencimentoSeguinte("2027-01-31", "2027-01-31", "mensal")).toBe("2027-02-28");
    expect(vencimentoSeguinte("2027-01-31", "2027-02-28", "mensal")).toBe("2027-03-31");
    expect(vencimentoSeguinte("2027-01-31", "2027-03-31", "anual")).toBe("2028-03-31");
    expect(vencimentoSeguinte("2028-02-29", "2028-02-29", "anual")).toBe("2029-02-28");
  });

  it("recusa vencimento antes da âncora", () => {
    expect(() => vencimentoSeguinte("2027-01-31", "2027-01-30", "mensal")).toThrow(RangeError);
  });

  it("em dia até o fim do dia do vencimento, em atraso por 7 dias e depois vencida", () => {
    const situacao = (hoje: string) => situacaoCobranca({ venceEm: "2026-12-27", hoje, toleranciaDias: 7 });
    expect(situacao("2026-12-27")).toBe("em_dia");
    expect(situacao("2026-12-28")).toBe("em_atraso");
    expect(situacao("2027-01-03")).toBe("em_atraso");
    expect(situacao("2027-01-04")).toBe("vencida");
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

// Decisão de 21/10/2026: 50% nos 3 primeiros anos de assinatura e 25% do 4º em diante.
const escalaFundador = [{ ateAno: 3, percentual: 50 }, { percentual: 25 }];

describe("percentualFundadorNoAno", () => {
  it("50% nos 3 primeiros anos e 25% do 4º em diante", () => {
    expect([1, 2, 3, 4, 5, 10, 30].map((ano) => percentualFundadorNoAno(escalaFundador, ano))).toEqual([
      50, 50, 50, 25, 25, 25, 25,
    ]);
  });

  it("aceita escala com mais degraus, editada pela administração", () => {
    const escada = [{ ateAno: 3, percentual: 50 }, { ateAno: 4, percentual: 40 }, { ateAno: 5, percentual: 30 }, { percentual: 25 }];
    expect([1, 3, 4, 5, 6].map((ano) => percentualFundadorNoAno(escada, ano))).toEqual([50, 50, 40, 30, 25]);
  });

  it("aceita escala de um degrau só (o mesmo percentual para sempre)", () => {
    expect(percentualFundadorNoAno([{ percentual: 50 }], 8)).toBe(50);
  });

  it("recusa ano menor que 1 ou fracionado", () => {
    expect(() => percentualFundadorNoAno(escalaFundador, 0)).toThrow(RangeError);
    expect(() => percentualFundadorNoAno(escalaFundador, 1.5)).toThrow(RangeError);
  });

  it("em 10 anos no Premium de autônomo, o Fundador paga R$ 2.018,25 (com 50% para sempre, pagaria R$ 1.495,00)", () => {
    const premium: ValoresPlano = { valorMensalCentavos: 2990, mesesCobradosNoAnual: 10 };
    const total = (escala: typeof escalaFundador) =>
      Array.from({ length: 10 }, (_, i) => i + 1).reduce(
        (soma, ano) =>
          soma +
          calcularCobrancaPlano(premium, "anual", { fundador: true, percentualFundador: percentualFundadorNoAno(escala, ano) })
            .valorDevidoCentavos,
        0,
      );
    expect(total(escalaFundador)).toBe(201825);
    expect(total([{ percentual: 50 }])).toBe(149500);
  });
});

describe("validarEscalaFundador", () => {
  it("aceita a escala decidida", () => {
    expect(() => validarEscalaFundador(escalaFundador)).not.toThrow();
  });

  it("recusa escala vazia", () => {
    expect(() => validarEscalaFundador([])).toThrow(RangeError);
  });

  it("recusa último degrau com ano final (o desconto ficaria sem regra depois dele)", () => {
    expect(() => validarEscalaFundador([{ ateAno: 3, percentual: 50 }])).toThrow(RangeError);
  });

  it("recusa degrau do meio sem ano final", () => {
    expect(() => validarEscalaFundador([{ percentual: 50 }, { percentual: 25 }])).toThrow(RangeError);
  });

  it("recusa anos fora de ordem, repetidos, zero ou fracionados", () => {
    expect(() => validarEscalaFundador([{ ateAno: 3, percentual: 50 }, { ateAno: 2, percentual: 40 }, { percentual: 25 }])).toThrow(RangeError);
    expect(() => validarEscalaFundador([{ ateAno: 3, percentual: 50 }, { ateAno: 3, percentual: 40 }, { percentual: 25 }])).toThrow(RangeError);
    expect(() => validarEscalaFundador([{ ateAno: 0, percentual: 50 }, { percentual: 25 }])).toThrow(RangeError);
    expect(() => validarEscalaFundador([{ ateAno: 2.5, percentual: 50 }, { percentual: 25 }])).toThrow(RangeError);
  });

  it("recusa percentual fora de 0 a 100 ou fracionado", () => {
    expect(() => validarEscalaFundador([{ percentual: 101 }])).toThrow(RangeError);
    expect(() => validarEscalaFundador([{ percentual: -1 }])).toThrow(RangeError);
    expect(() => validarEscalaFundador([{ percentual: 12.5 }])).toThrow(RangeError);
  });
});

describe("anoComoFundador", () => {
  it("o primeiro ano vai do primeiro pagamento até a véspera do 1º aniversário", () => {
    expect(anoComoFundador("2026-11-20", "2026-11-20")).toBe(1);
    expect(anoComoFundador("2026-11-20", "2027-11-19")).toBe(1);
  });

  it("a renovação que começa no aniversário já é o ano seguinte", () => {
    expect(anoComoFundador("2026-11-20", "2027-11-20")).toBe(2);
    expect(anoComoFundador("2026-11-20", "2029-11-20")).toBe(4);
  });

  it("4ª renovação (5º ano) com 25% de desconto", () => {
    expect(percentualFundadorNoAno(escalaFundador, anoComoFundador("2026-11-20", "2030-11-20"))).toBe(25);
  });

  it("aniversário em 29/02 conta no último dia de fevereiro", () => {
    expect(anoComoFundador("2028-02-29", "2029-02-28")).toBe(2);
  });

  it("recusa período antes de virar Fundador", () => {
    expect(() => anoComoFundador("2026-11-20", "2026-11-19")).toThrow(RangeError);
  });
});
