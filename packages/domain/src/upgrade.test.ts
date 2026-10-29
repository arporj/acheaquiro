import { describe, expect, it } from "vitest";
import { calcularPagamentoPlano, calcularPagamentoUpgrade, type EntradaPagamentoPlano, type EntradaPagamentoUpgrade } from "./assinatura";
import { diferencaParaComissao, parcelaDaFaixa, parcelasDoPagamento, type FaixaUpgrade } from "./upgrade";

const regras = {
  escalaDescontoFundador: [{ ateAno: 3, percentual: 50 }, { percentual: 25 }],
  prazoFundador: "2026-11-26",
  toleranciaVencimentoDias: 7,
  aberturaAoPublico: "2026-11-27",
};

// Exemplo do item 4.12: João vendeu o Essencial (R$ 19,90) mensal; no 2º mês, Maria fez o upgrade para o Avançado (R$ 59,90).
const basico = { valorMensalCentavos: 1990, mesesCobradosNoAnual: 10 };
const vitrine = { valorMensalCentavos: 5990, mesesCobradosNoAnual: 10 };
const faixa: FaixaUpgrade = { id: "maria", diferencaMensalCentavos: 4000, parcelasPagas: 0, concluida: false, descontoCentavos: 0 };

describe("diferencaParaComissao", () => {
  it("diferença sobre o maior entre o plano atual e o maior já comissionado", () => {
    expect(diferencaParaComissao({ mensalidadeNovaCentavos: 5990, mensalidadeAtualCentavos: 1990, maiorComissionadaCentavos: 1990 })).toBe(4000);
    // Desceu do Avançado para o Essencial e voltou ao Avançado: nada de comissão nova.
    expect(diferencaParaComissao({ mensalidadeNovaCentavos: 5990, mensalidadeAtualCentavos: 1990, maiorComissionadaCentavos: 5990 })).toBe(0);
    // Subiu sozinho para o Avançado e um representante vende o Premium: só a diferença sobre o Avançado.
    expect(diferencaParaComissao({ mensalidadeNovaCentavos: 9990, mensalidadeAtualCentavos: 5990, maiorComissionadaCentavos: 0 })).toBe(4000);
  });

  it("recusa valores inválidos", () => {
    expect(() => diferencaParaComissao({ mensalidadeNovaCentavos: -1, mensalidadeAtualCentavos: 0, maiorComissionadaCentavos: 0 })).toThrow(RangeError);
  });
});

describe("parcelaDaFaixa", () => {
  const mensal = (f: Partial<FaixaUpgrade>, disponivel = 10000) =>
    parcelaDaFaixa({ faixa: { ...faixa, ...f }, periodicidade: "mensal", percentualFundador: 0, disponivelCentavos: disponivel });

  it("mensal: 100%, 20%, 10% e 5% da diferença, e conclui na 4ª", () => {
    expect([0, 1, 2, 3].map((p) => mensal({ parcelasPagas: p }).comissao?.valorCentavos)).toEqual([4000, 800, 400, 200]);
    expect(mensal({ parcelasPagas: 3 })).toMatchObject({ parcelasPagasDepois: 4, concluida: true });
    expect(mensal({ parcelasPagas: 4 })).toMatchObject({ comissao: null, concluida: true });
  });

  it("S7: espera quando o pagamento não cobre a parcela", () => {
    expect(mensal({}, 3999)).toMatchObject({ comissao: null, parcelasPagasDepois: 0, concluida: false });
  });

  it("faixa concluída não gera nada", () => {
    expect(mensal({ concluida: true })).toMatchObject({ comissao: null, concluida: true });
  });

  it("o desconto sai só na 1ª parcela e até ela", () => {
    expect(mensal({ descontoCentavos: 500 }).descontoCentavos).toBe(500);
    expect(mensal({ descontoCentavos: 9000 }).descontoCentavos).toBe(4000);
    expect(mensal({ parcelasPagas: 1, descontoCentavos: 500 }).descontoCentavos).toBe(0);
  });

  it("anual: 135% de uma vez; depois de parcelas do mensal, completa o que falta", () => {
    const anual = (parcelasPagas: number) =>
      parcelaDaFaixa({ faixa: { ...faixa, parcelasPagas }, periodicidade: "anual", percentualFundador: 0, disponivelCentavos: 99999 });
    expect(anual(0)).toMatchObject({ comissao: { percentual: 135, valorCentavos: 5400 }, concluida: true });
    expect(anual(1)).toMatchObject({ comissao: { percentual: 35, valorCentavos: 1400 }, concluida: true });
    expect(anual(4)).toMatchObject({ comissao: null, concluida: true });
  });

  it("Fundador: a base tem o desconto do ano", () => {
    const r = parcelaDaFaixa({ faixa, periodicidade: "anual", percentualFundador: 50, disponivelCentavos: 99999 });
    expect(r.comissao).toEqual({ baseCentavos: 2000, percentual: 135, valorCentavos: 2700 });
  });

  it("recusa faixa e valores inválidos", () => {
    expect(() => mensal({ diferencaMensalCentavos: 0 })).toThrow(RangeError);
    expect(() => mensal({ parcelasPagas: 5 })).toThrow(RangeError);
    expect(() => mensal({}, -1)).toThrow(RangeError);
  });
});

describe("parcelasDoPagamento", () => {
  it("as faixas dividem o que sobra, na ordem da venda", () => {
    const r = parcelasDoPagamento({
      valorCentavos: 6000,
      faixas: [faixa, { ...faixa, id: "g", diferencaMensalCentavos: 3000 }],
      periodicidade: "mensal",
      percentualFundador: 0,
    });
    expect(r.parcelas.map((p) => p.comissao?.valorCentavos ?? null)).toEqual([4000, null]);
    expect(r.disponivelCentavos).toBe(2000);
  });
});

describe("calcularPagamentoPlano com upgrade e desconto do representante", () => {
  const terceiro: EntradaPagamentoPlano = {
    plano: vitrine,
    periodicidade: "mensal",
    pagoEm: "2027-01-20",
    confirmadoEm: "2027-01-20",
    regras,
    assinatura: { ancora: "2026-11-27", venceEm: "2027-01-27", pagamentosAnteriores: 2, algumAnual: false },
    fundadorDesde: null,
    representanteRecebeComissao: true,
    carteira: { percentual: 5 },
    planoVendido: basico,
    faixasUpgrade: [faixa],
  };

  it("S8: João recebe os 10% sobre o Essencial e Maria os 100% da diferença", () => {
    const r = calcularPagamentoPlano(terceiro);
    expect(r.numero).toBe(3);
    expect(r.comissao).toEqual({ baseCentavos: 1990, percentual: 10, valorCentavos: 199 });
    expect(r.parcelasUpgrade).toEqual([
      { faixaId: "maria", comissao: { baseCentavos: 4000, percentual: 100, valorCentavos: 4000 }, descontoCentavos: 0, parcelasPagasDepois: 1, concluida: false },
    ]);
    expect(r.comissaoCarteira).toBeNull();
    expect(r.valorCobradoCentavos).toBe(5990);
    expect(r.comissaoLiberaEm).toBe("2027-01-27");
  });

  it("o desconto prometido por Maria sai na 1ª parcela dela, e ela recebe a comissão menos o desconto", () => {
    const r = calcularPagamentoPlano({ ...terceiro, faixasUpgrade: [{ ...faixa, descontoCentavos: 1000 }] });
    expect(r.parcelasUpgrade[0]).toMatchObject({ comissao: { valorCentavos: 3000 }, descontoCentavos: 1000 });
    expect(r.descontoRepresentanteCentavos).toBe(1000);
    expect(r.valorCobradoCentavos).toBe(4990);
  });

  it("desconto igual à parcela: Maria não recebe nada nesse pagamento, mas a parcela conta", () => {
    const r = calcularPagamentoPlano({ ...terceiro, faixasUpgrade: [{ ...faixa, descontoCentavos: 9000 }] });
    expect(r.parcelasUpgrade[0]).toMatchObject({ comissao: null, descontoCentavos: 4000, parcelasPagasDepois: 1 });
    expect(r.valorCobradoCentavos).toBe(1990);
  });

  it("depois das parcelas da venda e do upgrade, o pagamento entra na carteira", () => {
    const r = calcularPagamentoPlano({
      ...terceiro,
      assinatura: { ...terceiro.assinatura!, pagamentosAnteriores: 6 },
      faixasUpgrade: [{ ...faixa, parcelasPagas: 4, concluida: true }],
    });
    expect(r.comissao).toBeNull();
    expect(r.parcelasUpgrade[0]).toMatchObject({ comissao: null, concluida: true });
    expect(r.comissaoCarteira?.valorCentavos).toBe(300);
  });

  it("no mesmo plano vendido, a base é o valor pago", () => {
    const r = calcularPagamentoPlano({ ...terceiro, plano: basico, planoVendido: null, faixasUpgrade: [] });
    expect(r.comissao?.baseCentavos).toBe(1990);
  });

  it("desconto na venda: só no 1º pagamento e até a comissão", () => {
    const primeiro = { ...terceiro, assinatura: null, planoVendido: null, faixasUpgrade: [], pagoEm: "2026-11-27", confirmadoEm: "2026-11-27" };
    const r = calcularPagamentoPlano({ ...primeiro, descontoVendaCentavos: 2000 });
    expect(r.comissao?.valorCentavos).toBe(3990);
    expect(r.valorCobradoCentavos).toBe(3990);
    expect(() => calcularPagamentoPlano({ ...primeiro, descontoVendaCentavos: 6000 })).toThrow(RangeError);
    expect(() => calcularPagamentoPlano({ ...primeiro, representanteRecebeComissao: false, descontoVendaCentavos: 100 })).toThrow(RangeError);
    expect(() => calcularPagamentoPlano({ ...terceiro, descontoVendaCentavos: 100 })).toThrow(RangeError);
  });
});

describe("calcularPagamentoUpgrade", () => {
  const mensal: EntradaPagamentoUpgrade = {
    planoAtual: basico,
    planoNovo: vitrine,
    periodicidade: "mensal",
    periodo: { inicio: "2026-12-27", venceEm: "2027-01-27" },
    pagoEm: "2027-01-17",
    confirmadoEm: "2027-01-17",
    percentualFundador: 0,
    faixa,
    carteira: { percentual: 5 },
  };

  it("S7, mensal a 10 dias do vencimento: o proporcional não cobre os 100% e a parcela espera a próxima mensalidade", () => {
    const r = calcularPagamentoUpgrade(mensal);
    expect(r.valorCentavos).toBe(1290);
    expect(r.parcela).toMatchObject({ comissao: null, parcelasPagasDepois: 0, concluida: false });
    expect(r.comissaoCarteira?.valorCentavos).toBe(65);
    expect(r.valorCobradoCentavos).toBe(1290);
  });

  const anual: EntradaPagamentoUpgrade = {
    ...mensal,
    periodicidade: "anual",
    periodo: { inicio: "2026-11-27", venceEm: "2027-11-27" },
    pagoEm: "2027-05-28",
    confirmadoEm: "2027-05-28",
  };

  it("anual na metade do ano: os 135% da diferença vão no proporcional, com o desconto prometido", () => {
    const r = calcularPagamentoUpgrade({ ...anual, faixa: { ...faixa, descontoCentavos: 400 } });
    expect(r.valorCentavos).toBe(20055);
    expect(r.parcela).toMatchObject({ comissao: { valorCentavos: 5000 }, descontoCentavos: 400, concluida: true });
    expect(r.valorCobradoCentavos).toBe(19655);
    expect(r.comissaoCarteira).toBeNull();
    expect(r.comissaoLiberaEm).toBe("2027-06-04");
  });

  it("anual a 20 dias da renovação: não cobre, os 135% vão na renovação", () => {
    const r = calcularPagamentoUpgrade({ ...anual, pagoEm: "2027-11-07", confirmadoEm: "2027-11-07" });
    expect(r.valorCentavos).toBe(2192);
    expect(r.parcela?.comissao).toBeNull();
  });

  it("Fundador: diferença e proporcional com o desconto do ano", () => {
    const r = calcularPagamentoUpgrade({ ...anual, percentualFundador: 50, faixa: null, carteira: null });
    expect(r.valorCentavos).toBe(10027);
    expect(r.parcela).toBeNull();
    expect(r.comissaoLiberaEm).toBeNull();
  });

  it("recusa o dia do vencimento e a confirmação antes do pagamento", () => {
    expect(() => calcularPagamentoUpgrade({ ...mensal, pagoEm: "2027-01-27", confirmadoEm: "2027-01-27" })).toThrow(RangeError);
    expect(() => calcularPagamentoUpgrade({ ...mensal, confirmadoEm: "2027-01-16" })).toThrow(RangeError);
  });
});
