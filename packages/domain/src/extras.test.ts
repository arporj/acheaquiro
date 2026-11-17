import { describe, expect, it } from "vitest";
import {
  calcularPagamentoEvento,
  calcularPagamentoExtra,
  datasCabemNosBlocosPagos,
  impedimentoParaContratarExtra,
  podeDevolverEvento,
  prazoParaDesistirDoEvento,
  type EntradaPagamentoEvento,
  type EntradaPagamentoExtra,
} from "./extras";

// Extra Agenda: R$ 39,90 por mês, anual de 10 mensalidades, com desconto de Fundador.
const agenda = { valorMensalCentavos: 3990, mesesCobradosNoAnual: 10, aceitaDescontoFundador: true, permiteAnual: true };

const entradaExtra = (mudar: Partial<EntradaPagamentoExtra> = {}): EntradaPagamentoExtra => ({
  extra: agenda,
  periodicidade: "mensal",
  pagoEm: "2026-12-05",
  confirmadoEm: "2026-12-05",
  regras: { escalaDescontoFundador: [{ ateAno: 1, percentual: 50 }, { percentual: 40 }], toleranciaVencimentoDias: 7, aberturaAoPublico: "2026-11-27" },
  contratacao: null,
  fundadorDesde: null,
  atendimento: null,
  carteira: null,
  ...mudar,
});

describe("impedimentoParaContratarExtra", () => {
  const extra = { ativo: true, cobranca: "mensal" as const, soComercio: true };

  it("comércio sem o extra pode contratar, em qualquer plano (E2)", () => {
    expect(impedimentoParaContratarExtra({ extra, tipoAnunciante: "comercio", jaContratado: false })).toBeNull();
  });

  it("explica cada impedimento", () => {
    expect(impedimentoParaContratarExtra({ extra: { ...extra, ativo: false }, tipoAnunciante: "comercio", jaContratado: false })).toMatch(/desligado/);
    expect(impedimentoParaContratarExtra({ extra: { ...extra, cobranca: "por_evento" }, tipoAnunciante: "comercio", jaContratado: false })).toMatch(/fluxo próprio/);
    expect(impedimentoParaContratarExtra({ extra, tipoAnunciante: "profissional", jaContratado: false })).toMatch(/só para comércios/);
    expect(impedimentoParaContratarExtra({ extra, tipoAnunciante: "comercio", jaContratado: true })).toMatch(/renovação/);
  });

  it("extra para todos aceita o autônomo", () => {
    expect(impedimentoParaContratarExtra({ extra: { ...extra, soComercio: false }, tipoAnunciante: "profissional", jaContratado: false })).toBeNull();
  });
});

describe("calcularPagamentoExtra", () => {
  it("1º pagamento sem atendimento: vencimento próprio, sem comissão de venda e com a carteira desde já", () => {
    const r = calcularPagamentoExtra(entradaExtra({ carteira: { percentual: 5 } }));
    expect(r.periodo).toEqual({ ancora: "2026-12-05", inicio: "2026-12-05", venceEm: "2027-01-05", renovacao: false });
    expect(r.numero).toBe(1);
    expect(r.cobranca).toEqual({ valorCheioCentavos: 3990, descontoFundadorCentavos: 0, valorDevidoCentavos: 3990 });
    expect(r.comissao).toBeNull();
    // 5% de R$ 39,90 = 199,5 centavos → R$ 2,00.
    expect(r.comissaoCarteira).toEqual({ baseCentavos: 3990, percentual: 5, valorCentavos: 200 });
    expect(r.comissaoLiberaEm).toBe("2026-12-12");
  });

  it("sem carteira nem atendimento, nada de comissão", () => {
    const r = calcularPagamentoExtra(entradaExtra());
    expect(r.comissao).toBeNull();
    expect(r.comissaoCarteira).toBeNull();
    expect(r.comissaoLiberaEm).toBeNull();
  });

  it("1º pagamento com atendimento: 20% para quem atendeu e nada de carteira", () => {
    const r = calcularPagamentoExtra(entradaExtra({ atendimento: { recebeComissao: true }, carteira: { percentual: 5 } }));
    expect(r.comissao).toEqual({ baseCentavos: 3990, percentual: 20, valorCentavos: 798 });
    expect(r.comissaoCarteira).toBeNull();
    expect(r.valorCobradoCentavos).toBe(3990);
  });

  it("atendimento do sócio: sem comissão de venda, e o pagamento continua sendo a venda (sem carteira)", () => {
    const r = calcularPagamentoExtra(entradaExtra({ atendimento: { recebeComissao: false }, carteira: { percentual: 5 } }));
    expect(r.comissao).toBeNull();
    expect(r.comissaoCarteira).toBeNull();
  });

  it("desconto do representante sai da comissão e do valor cobrado", () => {
    const r = calcularPagamentoExtra(entradaExtra({ atendimento: { recebeComissao: true }, descontoVendaCentavos: 300 }));
    expect(r.valorCobradoCentavos).toBe(3690);
    expect(r.descontoRepresentanteCentavos).toBe(300);
    expect(r.comissao?.valorCentavos).toBe(498);
  });

  it("desconto igual à comissão: o representante não recebe nada", () => {
    const r = calcularPagamentoExtra(entradaExtra({ atendimento: { recebeComissao: true }, descontoVendaCentavos: 798 }));
    expect(r.comissao).toBeNull();
    expect(r.valorCobradoCentavos).toBe(3192);
  });

  it("desconto sem comissão de venda é recusado", () => {
    expect(() => calcularPagamentoExtra(entradaExtra({ descontoVendaCentavos: 100 }))).toThrow(/desconto/);
  });

  it("renovação dentro da tolerância: mesmo dia, 2º pagamento, sem venda e com carteira", () => {
    const r = calcularPagamentoExtra(
      entradaExtra({
        pagoEm: "2027-01-09",
        confirmadoEm: "2027-01-09",
        contratacao: { ancora: "2026-12-05", venceEm: "2027-01-05", pagamentosAnteriores: 1 },
        atendimento: { recebeComissao: true },
        carteira: { percentual: 5 },
      }),
    );
    expect(r.periodo).toEqual({ ancora: "2026-12-05", inicio: "2027-01-05", venceEm: "2027-02-05", renovacao: true });
    expect(r.numero).toBe(2);
    expect(r.comissao).toBeNull();
    expect(r.comissaoCarteira?.valorCentavos).toBe(200);
  });

  it("depois da tolerância, a contratação recomeça: 1º pagamento, novo dia de vencimento", () => {
    const r = calcularPagamentoExtra(
      entradaExtra({ pagoEm: "2027-01-20", confirmadoEm: "2027-01-20", contratacao: { ancora: "2026-12-05", venceEm: "2027-01-05", pagamentosAnteriores: 1 } }),
    );
    expect(r.numero).toBe(1);
    expect(r.periodo).toMatchObject({ ancora: "2027-01-20", venceEm: "2027-02-20", renovacao: false });
  });

  it("pago antes da abertura: o período começa na abertura", () => {
    const r = calcularPagamentoExtra(entradaExtra({ pagoEm: "2026-11-18", confirmadoEm: "2026-11-18" }));
    expect(r.periodo).toMatchObject({ inicio: "2026-11-27", venceEm: "2026-12-27" });
  });

  it("Fundador no anual: desconto do ano sobre as 10 mensalidades, e a comissão sobre o valor pago", () => {
    const r = calcularPagamentoExtra(entradaExtra({ periodicidade: "anual", fundadorDesde: "2026-11-27", atendimento: { recebeComissao: true } }));
    expect(r.cobranca).toEqual({ valorCheioCentavos: 39900, descontoFundadorCentavos: 19950, valorDevidoCentavos: 19950 });
    expect(r.periodo.venceEm).toBe("2027-12-05");
    expect(r.comissao?.valorCentavos).toBe(3990);
  });

  it("extra sem desconto de Fundador cobra o valor cheio do Fundador", () => {
    const r = calcularPagamentoExtra(entradaExtra({ extra: { ...agenda, aceitaDescontoFundador: false }, fundadorDesde: "2026-11-27" }));
    expect(r.cobranca.descontoFundadorCentavos).toBe(0);
  });

  it("na renovação, o aumento não avisado com 30 dias não vale", () => {
    const r = calcularPagamentoExtra(
      entradaExtra({
        extra: { ...agenda, valorMensalCentavos: 4990 },
        historicoExtra: [
          { vigenteDesde: "2026-10-01", valorMensalCentavos: 3990, mesesCobradosNoAnual: 10 },
          { vigenteDesde: "2026-12-20", valorMensalCentavos: 4990, mesesCobradosNoAnual: 10 },
        ],
        pagoEm: "2027-01-05",
        confirmadoEm: "2027-01-05",
        contratacao: { ancora: "2026-12-05", venceEm: "2027-01-05", pagamentosAnteriores: 1 },
      }),
    );
    expect(r.cobranca.valorDevidoCentavos).toBe(3990);
  });

  it("recusa extra sem valor e confirmação antes do pagamento", () => {
    expect(() => calcularPagamentoExtra(entradaExtra({ extra: { ...agenda, valorMensalCentavos: 0 } }))).toThrow(/sem valor/);
    expect(() => calcularPagamentoExtra(entradaExtra({ confirmadoEm: "2026-12-04" }))).toThrow(/confirmado/);
  });
});

const entradaEvento = (mudar: Partial<EntradaPagamentoEvento> = {}): EntradaPagamentoEvento => ({
  inicio: "2026-12-10",
  fim: "2026-12-12",
  valorBlocoCentavos: 4990,
  blocosJaPagos: 0,
  pagoEm: "2026-12-01",
  confirmadoEm: "2026-12-01",
  atendimento: null,
  carteira: null,
  ...mudar,
});

describe("calcularPagamentoEvento", () => {
  it("3 dias: 1 bloco, sem comissão sem atendimento", () => {
    const r = calcularPagamentoEvento(entradaEvento());
    expect(r).toMatchObject({ blocos: 1, blocosPagos: 1, valorCentavos: 4990, valorCobradoCentavos: 4990, comissao: null, comissaoCarteira: null, comissaoLiberaEm: null });
  });

  it("com atendimento: 20% do valor pago", () => {
    const r = calcularPagamentoEvento(entradaEvento({ fim: "2026-12-23", atendimento: { recebeComissao: true } }));
    expect(r.blocos).toBe(2);
    expect(r.comissao).toEqual({ baseCentavos: 9980, percentual: 20, valorCentavos: 1996 });
    expect(r.comissaoLiberaEm).toBe("2026-12-08");
  });

  it("pagamento complementar cobra só os blocos que faltam (E3)", () => {
    const r = calcularPagamentoEvento(entradaEvento({ fim: "2026-12-19", blocosJaPagos: 1 }));
    expect(r).toMatchObject({ blocos: 2, blocosPagos: 1, valorCentavos: 4990 });
  });

  it("evento já pago não tem novo pagamento", () => {
    expect(() => calcularPagamentoEvento(entradaEvento({ blocosJaPagos: 1 }))).toThrow(/já estão pagos/);
  });

  it("anunciante trazido por representante, sem atendimento: carteira", () => {
    const r = calcularPagamentoEvento(entradaEvento({ carteira: { percentual: 5 } }));
    expect(r.comissaoCarteira?.valorCentavos).toBe(250);
  });

  it("com atendimento, a carteira não entra", () => {
    const r = calcularPagamentoEvento(entradaEvento({ atendimento: { recebeComissao: true }, carteira: { percentual: 5 } }));
    expect(r.comissaoCarteira).toBeNull();
  });

  it("desconto do representante", () => {
    const r = calcularPagamentoEvento(entradaEvento({ atendimento: { recebeComissao: true }, descontoVendaCentavos: 500 }));
    expect(r).toMatchObject({ valorCobradoCentavos: 4490, descontoRepresentanteCentavos: 500 });
    expect(r.comissao?.valorCentavos).toBe(498);
  });

  it("recusa valores inválidos", () => {
    expect(() => calcularPagamentoEvento(entradaEvento({ descontoVendaCentavos: 100 }))).toThrow(/desconto/);
    expect(() => calcularPagamentoEvento(entradaEvento({ valorBlocoCentavos: 0 }))).toThrow(/bloco/);
    expect(() => calcularPagamentoEvento(entradaEvento({ blocosJaPagos: -1 }))).toThrow(/Blocos/);
    expect(() => calcularPagamentoEvento(entradaEvento({ confirmadoEm: "2026-11-30" }))).toThrow(/confirmado/);
  });
});

describe("datasCabemNosBlocosPagos", () => {
  it("só dentro dos blocos pagos; sem pagamento, qualquer data", () => {
    expect(datasCabemNosBlocosPagos({ inicio: "2026-12-10", fim: "2026-12-16", blocosPagos: 1 })).toBe(true);
    expect(datasCabemNosBlocosPagos({ inicio: "2026-12-10", fim: "2026-12-17", blocosPagos: 1 })).toBe(false);
    expect(datasCabemNosBlocosPagos({ inicio: "2026-12-10", fim: "2027-01-30", blocosPagos: 0 })).toBe(true);
  });
});

describe("devolução do evento avulso (E1)", () => {
  it("evento longe: 7 dias depois do pagamento", () => {
    expect(prazoParaDesistirDoEvento("2026-11-01", "2026-11-27")).toBe("2026-11-08");
  });

  it("evento dentro dos 7 dias: até a véspera do primeiro dia", () => {
    expect(prazoParaDesistirDoEvento("2026-11-20", "2026-11-23")).toBe("2026-11-22");
    expect(podeDevolverEvento({ pagoEm: "2026-11-20", inicioDoEvento: "2026-11-23", hoje: "2026-11-22" })).toBe(true);
    expect(podeDevolverEvento({ pagoEm: "2026-11-20", inicioDoEvento: "2026-11-23", hoje: "2026-11-23" })).toBe(false);
  });

  it("pago no dia do evento: sem devolução", () => {
    expect(podeDevolverEvento({ pagoEm: "2026-11-27", inicioDoEvento: "2026-11-27", hoje: "2026-11-27" })).toBe(false);
  });

  it("depois dos 7 dias: sem devolução", () => {
    expect(podeDevolverEvento({ pagoEm: "2026-11-01", inicioDoEvento: "2026-12-27", hoje: "2026-11-09" })).toBe(false);
  });
});
