import { describe, expect, it } from "vitest";
import { calcularPagamentoPlano, periodoDoPagamento, podeDevolver, valorProporcionalUpgrade, type EntradaPagamentoPlano } from "./assinatura";

const regras = {
  escalaDescontoFundador: [{ ateAno: 3, percentual: 50 }, { percentual: 25 }],
  prazoFundador: "2026-11-26",
  toleranciaVencimentoDias: 7,
  aberturaAoPublico: "2026-11-27",
};

describe("periodoDoPagamento", () => {
  const base = { periodicidade: "mensal" as const, aberturaAoPublico: "2026-11-27", toleranciaDias: 7 };
  const anterior = { ancora: "2026-11-27", venceEm: "2026-12-27" };

  it("pago antes da abertura: começa na abertura (anual pago em 10/11 vence em 27/11/2027)", () => {
    expect(periodoDoPagamento({ ...base, periodicidade: "anual", pagoEm: "2026-11-10", anterior: null })).toEqual({
      ancora: "2026-11-27",
      inicio: "2026-11-27",
      venceEm: "2027-11-27",
      renovacao: false,
    });
  });

  it("primeiro pagamento depois da abertura: começa no dia do pagamento", () => {
    expect(periodoDoPagamento({ ...base, pagoEm: "2026-12-05", anterior: null })).toMatchObject({ inicio: "2026-12-05", venceEm: "2027-01-05" });
  });

  it("pago antes do vencimento: o dia não muda", () => {
    expect(periodoDoPagamento({ ...base, pagoEm: "2026-12-20", anterior })).toEqual({
      ancora: "2026-11-27",
      inicio: "2026-12-27",
      venceEm: "2027-01-27",
      renovacao: true,
    });
  });

  it("pago em atraso dentro dos 7 dias: o dia não muda", () => {
    expect(periodoDoPagamento({ ...base, pagoEm: "2027-01-03", anterior })).toMatchObject({ inicio: "2026-12-27", venceEm: "2027-01-27", renovacao: true });
  });

  it("pago depois dos 7 dias: recomeça no dia do pagamento", () => {
    expect(periodoDoPagamento({ ...base, pagoEm: "2027-01-04", anterior })).toEqual({
      ancora: "2027-01-04",
      inicio: "2027-01-04",
      venceEm: "2027-02-04",
      renovacao: false,
    });
  });

  it("assinatura que começou no dia 31 volta ao dia 31 depois de fevereiro", () => {
    const marco = periodoDoPagamento({ ...base, pagoEm: "2027-02-20", anterior: { ancora: "2027-01-31", venceEm: "2027-02-28" } });
    expect(marco.venceEm).toBe("2027-03-31");
  });

  it("troca do mensal para o anual mantém o dia", () => {
    expect(periodoDoPagamento({ ...base, periodicidade: "anual", pagoEm: "2026-12-27", anterior })).toMatchObject({
      inicio: "2026-12-27",
      venceEm: "2027-12-27",
    });
  });
});

describe("podeDevolver", () => {
  it("só o primeiro pagamento, até 7 dias depois dele", () => {
    expect(podeDevolver({ numero: 1, pagoEm: "2026-11-10", hoje: "2026-11-17" })).toBe(true);
    expect(podeDevolver({ numero: 1, pagoEm: "2026-11-10", hoje: "2026-11-18" })).toBe(false);
    expect(podeDevolver({ numero: 2, pagoEm: "2026-11-10", hoje: "2026-11-11" })).toBe(false);
  });
});

// Padaria Boa Massa, plano Vitrine de R$ 59,90 (exemplos do item 4.12).
describe("calcularPagamentoPlano", () => {
  const entrada: EntradaPagamentoPlano = {
    plano: { valorMensalCentavos: 5990, mesesCobradosNoAnual: 10 },
    periodicidade: "anual",
    pagoEm: "2026-11-10",
    confirmadoEm: "2026-11-11",
    regras,
    assinatura: null,
    fundadorDesde: null,
    representanteRecebeComissao: true,
    carteira: { percentual: 5 },
  };
  const calcular = (p: Partial<EntradaPagamentoPlano>) => calcularPagamentoPlano({ ...entrada, ...p });

  it("Fundador no pré-cadastro: anual com 50%, ano contado da abertura, comissão liberada 7 dias depois da confirmação", () => {
    expect(calcular({})).toEqual({
      periodo: { ancora: "2026-11-27", inicio: "2026-11-27", venceEm: "2027-11-27", renovacao: false },
      numero: 1,
      cobranca: { valorCheioCentavos: 59900, descontoFundadorCentavos: 29950, valorDevidoCentavos: 29950 },
      fundador: { fundador: true, fundadorDesde: "2026-11-27", tornou: true, perdeu: false },
      comissao: { baseCentavos: 29950, percentual: 13.5, valorCentavos: 4043 },
      comissaoCarteira: null,
      comissaoLiberaEm: "2026-11-18",
    });
  });

  it("anual pago depois do prazo: sem Fundador, preço cheio e 135% de uma mensalidade", () => {
    const r = calcular({ pagoEm: "2026-11-27", confirmadoEm: "2026-11-27" });
    expect(r.fundador).toEqual({ fundador: false, fundadorDesde: null, tornou: false, perdeu: false });
    expect(r.cobranca.valorDevidoCentavos).toBe(59900);
    expect(r.comissao?.valorCentavos).toBe(8087);
  });

  it("mensal no pré-cadastro: não vira Fundador e a 1ª mensalidade rende 100%", () => {
    const r = calcular({ periodicidade: "mensal" });
    expect(r.fundador.fundador).toBe(false);
    expect(r.periodo.venceEm).toBe("2026-12-27");
    expect(r.comissao?.valorCentavos).toBe(5990);
  });

  it("3ª mensalidade rende 10%", () => {
    const r = calcular({
      periodicidade: "mensal",
      pagoEm: "2027-01-25",
      confirmadoEm: "2027-01-25",
      assinatura: { ancora: "2026-11-27", venceEm: "2027-01-27", pagamentosAnteriores: 2, algumAnual: false },
    });
    expect(r.numero).toBe(3);
    expect(r.periodo).toMatchObject({ inicio: "2027-01-27", venceEm: "2027-02-27" });
    expect(r.comissao?.valorCentavos).toBe(599);
  });

  it("mensal e depois anual: o anual completa os 135% (decisão M1)", () => {
    const r = calcular({
      pagoEm: "2026-12-20",
      confirmadoEm: "2026-12-20",
      assinatura: { ancora: "2026-11-27", venceEm: "2026-12-27", pagamentosAnteriores: 1, algumAnual: false },
    });
    expect(r.numero).toBe(2);
    expect(r.cobranca.valorDevidoCentavos).toBe(59900);
    expect(r.comissao?.valorCentavos).toBe(2097);
  });

  it("renovação do Fundador no 2º ano: 50%, sem comissão; no 4º ano: 25%", () => {
    const renovar = (venceEm: string, pagoEm: string) =>
      calcular({
        pagoEm,
        confirmadoEm: pagoEm,
        fundadorDesde: "2026-11-27",
        assinatura: { ancora: "2026-11-27", venceEm, pagamentosAnteriores: 1, algumAnual: true },
      });
    const segundo = renovar("2027-11-27", "2027-11-20");
    expect(segundo.cobranca.valorDevidoCentavos).toBe(29950);
    expect(segundo.fundador).toEqual({ fundador: true, fundadorDesde: "2026-11-27", tornou: false, perdeu: false });
    expect(segundo.comissao).toBeNull();
    expect(renovar("2029-11-27", "2029-12-01").cobranca.valorDevidoCentavos).toBe(44925);
  });

  it("Fundador que renova no mensal deixa de ser Fundador e não gera parcelas de comissão", () => {
    const r = calcular({
      periodicidade: "mensal",
      pagoEm: "2027-11-20",
      confirmadoEm: "2027-11-20",
      fundadorDesde: "2026-11-27",
      assinatura: { ancora: "2026-11-27", venceEm: "2027-11-27", pagamentosAnteriores: 1, algumAnual: true },
    });
    expect(r.fundador).toEqual({ fundador: false, fundadorDesde: null, tornou: false, perdeu: true });
    expect(r.cobranca.valorDevidoCentavos).toBe(5990);
    expect(r.comissao).toBeNull();
  });

  it("Fundador que paga depois dos 7 dias perde a condição", () => {
    const r = calcular({
      pagoEm: "2027-12-05",
      confirmadoEm: "2027-12-05",
      fundadorDesde: "2026-11-27",
      assinatura: { ancora: "2026-11-27", venceEm: "2027-11-27", pagamentosAnteriores: 1, algumAnual: true },
    });
    expect(r.fundador.perdeu).toBe(true);
    expect(r.cobranca.valorDevidoCentavos).toBe(59900);
    expect(r.periodo.inicio).toBe("2027-12-05");
  });

  it("Fundador sem assinatura (pagamento devolvido) não continua Fundador", () => {
    expect(calcular({ pagoEm: "2027-01-10", confirmadoEm: "2027-01-10", fundadorDesde: "2026-11-27" }).fundador.perdeu).toBe(true);
  });

  describe("carteira de 5% depois da fase de venda (decisões N1 a N3)", () => {
    const depois = (p: Partial<EntradaPagamentoPlano>) =>
      calcular({ pagoEm: "2027-03-20", confirmadoEm: "2027-03-20", periodicidade: "mensal", ...p });

    it("5ª mensalidade: sem comissão de venda e 5% de carteira (R$ 3,00), liberada em 7 dias", () => {
      const r = depois({ assinatura: { ancora: "2026-11-27", venceEm: "2027-03-27", pagamentosAnteriores: 4, algumAnual: false } });
      expect(r.comissao).toBeNull();
      expect(r.comissaoCarteira).toEqual({ baseCentavos: 5990, percentual: 5, valorCentavos: 300 });
      expect(r.comissaoLiberaEm).toBe("2027-03-27");
    });

    it("2ª a 4ª mensalidade ficam só com a comissão de venda", () => {
      const r = depois({ assinatura: { ancora: "2026-11-27", venceEm: "2027-03-27", pagamentosAnteriores: 3, algumAnual: false } });
      expect(r.comissao?.valorCentavos).toBe(300);
      expect(r.comissaoCarteira).toBeNull();
    });

    it("renovação do anual do Fundador: 5% do valor pago (R$ 14,98)", () => {
      const r = calcular({
        pagoEm: "2027-11-20",
        confirmadoEm: "2027-11-20",
        fundadorDesde: "2026-11-27",
        assinatura: { ancora: "2026-11-27", venceEm: "2027-11-27", pagamentosAnteriores: 1, algumAnual: true },
      });
      expect(r.comissao).toBeNull();
      expect(r.comissaoCarteira?.valorCentavos).toBe(1498);
    });

    it("a fase de venda bloqueia a carteira mesmo quando quem vendeu não recebe (sócio)", () => {
      const r = depois({
        representanteRecebeComissao: false,
        assinatura: { ancora: "2026-11-27", venceEm: "2027-03-27", pagamentosAnteriores: 1, algumAnual: false },
      });
      expect(r.comissao).toBeNull();
      expect(r.comissaoCarteira).toBeNull();
      expect(r.comissaoLiberaEm).toBeNull();
    });

    it("sem carteira (representante saiu ou anunciante sem representante): nada", () => {
      const r = depois({ carteira: null, assinatura: { ancora: "2026-11-27", venceEm: "2027-03-27", pagamentosAnteriores: 4, algumAnual: false } });
      expect(r.comissaoCarteira).toBeNull();
    });
  });

  it("sócio ou venda sem representante: sem comissão", () => {
    const r = calcular({ representanteRecebeComissao: false, carteira: null });
    expect(r.comissao).toBeNull();
    expect(r.comissaoLiberaEm).toBeNull();
  });

  it("recusa plano gratuito e confirmação antes do pagamento", () => {
    expect(() => calcular({ plano: { valorMensalCentavos: 0, mesesCobradosNoAnual: 10 } })).toThrow(RangeError);
    expect(() => calcular({ confirmadoEm: "2026-11-09" })).toThrow(RangeError);
  });
});

describe("valorProporcionalUpgrade", () => {
  const base = { valorPeriodoAtualCentavos: 1990, valorPeriodoNovoCentavos: 5990, inicio: "2026-12-01", venceEm: "2026-12-31" };

  it("mensal, na metade do período: metade da diferença", () => {
    expect(valorProporcionalUpgrade({ ...base, hoje: "2026-12-16" })).toBe(2000);
  });

  it("anual: diferença inteira no primeiro dia e nada no vencimento", () => {
    const anual = { valorPeriodoAtualCentavos: 19900, valorPeriodoNovoCentavos: 59900, inicio: "2026-11-27", venceEm: "2027-11-27" };
    expect(valorProporcionalUpgrade({ ...anual, hoje: "2026-11-27" })).toBe(40000);
    expect(valorProporcionalUpgrade({ ...anual, hoje: "2027-11-27" })).toBe(0);
  });

  it("arredonda metade para cima", () => {
    const tres = { valorPeriodoAtualCentavos: 0, valorPeriodoNovoCentavos: 1000, inicio: "2026-12-01", venceEm: "2026-12-04" };
    expect(valorProporcionalUpgrade({ ...tres, hoje: "2026-12-03" })).toBe(333);
    expect(valorProporcionalUpgrade({ ...tres, hoje: "2026-12-02" })).toBe(667);
    const dois = { valorPeriodoAtualCentavos: 0, valorPeriodoNovoCentavos: 1, inicio: "2026-12-01", venceEm: "2026-12-03" };
    expect(valorProporcionalUpgrade({ ...dois, hoje: "2026-12-02" })).toBe(1);
  });

  it("recusa plano menor ou igual e data fora do período", () => {
    expect(() => valorProporcionalUpgrade({ ...base, valorPeriodoNovoCentavos: 1990, hoje: "2026-12-10" })).toThrow(RangeError);
    expect(() => valorProporcionalUpgrade({ ...base, valorPeriodoAtualCentavos: 1.5, hoje: "2026-12-10" })).toThrow(RangeError);
    expect(() => valorProporcionalUpgrade({ ...base, hoje: "2027-01-01" })).toThrow(RangeError);
    expect(() => valorProporcionalUpgrade({ ...base, hoje: "2026-11-30" })).toThrow(RangeError);
    expect(() => valorProporcionalUpgrade({ ...base, venceEm: "2026-12-01", hoje: "2026-12-01" })).toThrow(RangeError);
  });
});
