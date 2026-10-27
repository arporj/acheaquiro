import { describe, expect, it } from "vitest";
import { calcularPagamentoPlano } from "./assinatura";
import { avisoDePreco, precoDaRenovacao, precoVigenteEm, type PrecoVigente } from "./precos";

// Vitrine: R$ 59,90 desde 01/10/2026; aumento para R$ 69,90 avisado em 01/03/2027.
const vitrine: PrecoVigente[] = [
  { valorMensalCentavos: 6990, mesesCobradosNoAnual: 10, vigenteDesde: "2027-03-01" },
  { valorMensalCentavos: 5990, mesesCobradosNoAnual: 10, vigenteDesde: "2026-10-01" },
];
const antigo = { valorMensalCentavos: 5990, mesesCobradosNoAnual: 10 };
const novo = { valorMensalCentavos: 6990, mesesCobradosNoAnual: 10 };
const escala = [{ ateAno: 3, percentual: 50 }, { percentual: 25 }];

describe("precoVigenteEm", () => {
  it("o último preço que começou até o dia, em qualquer ordem do histórico", () => {
    expect(precoVigenteEm(vitrine, "2027-02-28")).toEqual(antigo);
    expect(precoVigenteEm(vitrine, "2027-03-01")).toEqual(novo);
  });

  it("antes de todos, o mais antigo; histórico vazio é erro", () => {
    expect(precoVigenteEm(vitrine, "2026-01-01")).toEqual(antigo);
    expect(() => precoVigenteEm([], "2027-01-01")).toThrow(RangeError);
  });
});

describe("precoDaRenovacao (aumento só com 30 dias de aviso)", () => {
  const renovar = (inicioPeriodo: string, hoje: string, historico = vitrine, periodicidade: "mensal" | "anual" = "mensal") =>
    precoDaRenovacao({ historico, inicioPeriodo, periodicidade, hoje });

  it("renovação a menos de 30 dias do aviso: preço antigo", () => {
    expect(renovar("2027-03-27", "2027-03-25")).toEqual(antigo);
  });

  it("renovação 30 dias ou mais depois do aviso: preço novo", () => {
    expect(renovar("2027-03-31", "2027-03-30")).toEqual(novo);
    expect(renovar("2027-04-27", "2027-04-20")).toEqual(novo);
  });

  it("pagamento adiantado usa o que se conhece hoje", () => {
    expect(renovar("2027-05-27", "2027-02-20")).toEqual(antigo);
  });

  it("redução vale na hora, mesmo sem 30 dias", () => {
    const reducao: PrecoVigente[] = [
      { valorMensalCentavos: 5990, mesesCobradosNoAnual: 10, vigenteDesde: "2026-10-01" },
      { valorMensalCentavos: 4990, mesesCobradosNoAnual: 10, vigenteDesde: "2027-03-01" },
    ];
    expect(renovar("2027-03-05", "2027-03-03", reducao)).toEqual({ valorMensalCentavos: 4990, mesesCobradosNoAnual: 10 });
  });

  it("no anual, conta o valor do ano: menos meses cobrados é redução", () => {
    const menosMeses: PrecoVigente[] = [
      { valorMensalCentavos: 5990, mesesCobradosNoAnual: 10, vigenteDesde: "2026-10-01" },
      { valorMensalCentavos: 5990, mesesCobradosNoAnual: 9, vigenteDesde: "2027-03-01" },
    ];
    expect(renovar("2027-03-05", "2027-03-03", menosMeses, "anual")).toEqual({ valorMensalCentavos: 5990, mesesCobradosNoAnual: 9 });
  });
});

describe("avisoDePreco (cada assinante com o próprio valor)", () => {
  const base = { antigo, novo, avisadoEm: "2027-03-10", fundadorDesde: null, escalaDescontoFundador: escala };

  it("mensal: a partir do 1º vencimento pelo menos 30 dias depois do aviso", () => {
    expect(avisoDePreco({ ...base, assinatura: { ancora: "2026-11-27", venceEm: "2027-03-27", periodicidade: "mensal" } })).toEqual({
      aPartirDe: "2027-04-27",
      valorCentavos: 6990,
      valorAntigoCentavos: 5990,
    });
  });

  it("anual de Fundador no 2º ano: na próxima renovação, com 50%", () => {
    expect(
      avisoDePreco({ ...base, fundadorDesde: "2026-11-27", assinatura: { ancora: "2026-11-27", venceEm: "2027-11-27", periodicidade: "anual" } }),
    ).toEqual({ aPartirDe: "2027-11-27", valorCentavos: 34950, valorAntigoCentavos: 29950 });
  });

  it("anual de Fundador que entra no 4º ano: com 25%", () => {
    expect(
      avisoDePreco({ ...base, fundadorDesde: "2026-11-27", assinatura: { ancora: "2026-11-27", venceEm: "2029-11-27", periodicidade: "anual" } })
        ?.valorCentavos,
    ).toBe(52425);
  });

  it("assinatura em atraso: o aviso vale para o vencimento seguinte ao prazo", () => {
    expect(avisoDePreco({ ...base, assinatura: { ancora: "2026-11-27", venceEm: "2027-03-05", periodicidade: "mensal" } })?.aPartirDe).toBe("2027-04-27");
  });

  it("redução ou mesmo valor: sem aviso", () => {
    const assinatura = { ancora: "2026-11-27", venceEm: "2027-03-27", periodicidade: "mensal" as const };
    expect(avisoDePreco({ ...base, antigo: novo, novo: antigo, assinatura })).toBeNull();
    expect(avisoDePreco({ ...base, novo: antigo, assinatura })).toBeNull();
  });
});

describe("calcularPagamentoPlano com o histórico de preços", () => {
  const entrada = {
    plano: novo,
    historicoPlano: vitrine,
    periodicidade: "mensal" as const,
    regras: { escalaDescontoFundador: escala, prazoFundador: "2026-11-26", toleranciaVencimentoDias: 7, aberturaAoPublico: "2026-11-27" },
    fundadorDesde: null,
    representanteRecebeComissao: false,
    carteira: null,
  };

  it("renovação logo depois do aviso: ainda o preço antigo", () => {
    const r = calcularPagamentoPlano({
      ...entrada,
      pagoEm: "2027-03-20",
      confirmadoEm: "2027-03-20",
      assinatura: { ancora: "2026-11-27", venceEm: "2027-03-27", pagamentosAnteriores: 4, algumAnual: false },
    });
    expect(r.cobranca.valorDevidoCentavos).toBe(5990);
  });

  it("quem contrata agora paga o preço novo", () => {
    const r = calcularPagamentoPlano({ ...entrada, pagoEm: "2027-03-20", confirmadoEm: "2027-03-20", assinatura: null });
    expect(r.cobranca.valorDevidoCentavos).toBe(6990);
  });
});
