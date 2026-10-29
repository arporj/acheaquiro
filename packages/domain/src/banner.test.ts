import { describe, expect, it } from "vitest";
import {
  calcularPrecoBanner,
  diasPerdidosNaConfirmacao,
  proximosDiasLivres,
  sequenciasDeDias,
  validarReservaBanner,
  type RegrasBannerExclusivo,
} from "./banner";
import { somarDias } from "./datas";

// Valores decididos em 20/10/2026; na aplicação, vêm de extras.regras.
const regras: RegrasBannerExclusivo = {
  diariaCentavos: 2490,
  valorBlocoCentavos: 50000,
  diasPorBloco: 30,
  minimoDiasParaBloco: 21,
  antecedenciaDias: 2,
};

/** `quantidade` dias seguidos a partir de `inicio`. */
function seguidos(inicio: string, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => somarDias(inicio, i));
}

const preco = (dias: string[]) => calcularPrecoBanner(dias, regras);

describe("sequenciasDeDias", () => {
  it("agrupa dias seguidos, mesmo fora de ordem e virando o mês", () => {
    expect(sequenciasDeDias(["2026-12-01", "2026-11-30", "2026-12-05"])).toEqual([
      ["2026-11-30", "2026-12-01"],
      ["2026-12-05"],
    ]);
  });
});

describe("preço", () => {
  it("dias avulsos pagam a diária: 3 dias = R$ 74,70", () => {
    expect(preco(seguidos("2026-12-10", 3))).toEqual({ valorCentavos: 7470, blocosACompletar: [] });
  });

  it("dias soltos também pagam diária: 4 sábados = R$ 99,60", () => {
    expect(preco(["2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26"]).valorCentavos).toBe(9960);
  });

  it("20 dias seguidos ainda pagam diária: R$ 498,00", () => {
    expect(preco(seguidos("2026-12-01", 20))).toEqual({ valorCentavos: 49800, blocosACompletar: [] });
  });

  it("30 dias seguidos, começando em qualquer dia (13/11 a 12/12): R$ 500,00", () => {
    expect(preco(seguidos("2026-11-13", 30))).toEqual({ valorCentavos: 50000, blocosACompletar: [] });
  });

  it("21 dias seguidos pagam o bloco e recebem mais 9 dias depois da sequência", () => {
    expect(preco(seguidos("2026-12-01", 21))).toEqual({
      valorCentavos: 50000,
      blocosACompletar: [{ aposDia: "2026-12-21", dias: 9 }],
    });
  });

  it("25 dias seguidos: R$ 500,00 e 5 dias a completar", () => {
    expect(preco(seguidos("2026-12-01", 25)).blocosACompletar).toEqual([{ aposDia: "2026-12-25", dias: 5 }]);
  });

  it("40 dias seguidos: um bloco e 10 diárias = R$ 749,00", () => {
    expect(preco(seguidos("2026-12-01", 40))).toEqual({ valorCentavos: 74900, blocosACompletar: [] });
  });

  it("51 dias seguidos: dois blocos, o segundo com 9 dias a completar", () => {
    expect(preco(seguidos("2026-12-01", 51))).toEqual({
      valorCentavos: 100000,
      blocosACompletar: [{ aposDia: somarDias("2026-12-01", 50), dias: 9 }],
    });
  });

  it("soma sequências separadas, cada uma com a sua regra", () => {
    const dias = [...seguidos("2026-12-01", 30), ...seguidos("2027-01-10", 2)];
    expect(preco(dias).valorCentavos).toBe(50000 + 2 * 2490);
  });

  it("recusa dias repetidos e regras inválidas", () => {
    expect(() => preco(["2026-12-01", "2026-12-01"])).toThrow(RangeError);
    expect(() => calcularPrecoBanner(["2026-12-01"], { ...regras, minimoDiasParaBloco: 31 })).toThrow(RangeError);
    expect(() => calcularPrecoBanner(["2026-12-01"], { ...regras, diariaCentavos: 24.9 })).toThrow(RangeError);
  });
});

describe("validarReservaBanner", () => {
  const contexto = { hoje: "2026-12-01", ocupados: new Set(["2026-12-10"]), regras };

  it("aceita dias livres a partir de 2 dias depois de hoje e devolve o preço", () => {
    expect(validarReservaBanner(["2026-12-03", "2026-12-04"], contexto)).toEqual({
      ok: true,
      dados: { valorCentavos: 4980, blocosACompletar: [] },
    });
  });

  it("recusa dias antes da antecedência mínima", () => {
    const resultado = validarReservaBanner(["2026-12-02"], contexto);
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: "DADOS_INVALIDOS" } });
    expect(!resultado.ok && resultado.erro.mensagem).toContain("03/12/2026");
  });

  it("recusa dia já reservado", () => {
    expect(validarReservaBanner(["2026-12-10"], contexto)).toMatchObject({ ok: false, erro: { codigo: "CONFLITO" } });
  });

  it("recusa escolha vazia ou com dias repetidos", () => {
    expect(validarReservaBanner([], contexto).ok).toBe(false);
    expect(validarReservaBanner(["2026-12-05", "2026-12-05"], contexto).ok).toBe(false);
  });
});

describe("proximosDiasLivres", () => {
  it("pula os dias ocupados por outros anunciantes", () => {
    const ocupados = new Set(["2026-12-26", "2026-12-28"]);
    expect(proximosDiasLivres("2026-12-25", 3, ocupados)).toEqual(["2026-12-27", "2026-12-29", "2026-12-30"]);
  });

  it("não entra em laço quando o calendário está todo ocupado", () => {
    const ocupados = new Set(seguidos("2026-12-02", 800));
    expect(() => proximosDiasLivres("2026-12-01", 1, ocupados)).toThrow(RangeError);
  });
});

describe("diasPerdidosNaConfirmacao", () => {
  it("perde os dias até a data da confirmação; vale a partir do dia seguinte", () => {
    const dias = ["2026-12-05", "2026-12-03", "2026-12-04"];
    expect(diasPerdidosNaConfirmacao(dias, "2026-12-04")).toEqual(["2026-12-03", "2026-12-04"]);
    expect(diasPerdidosNaConfirmacao(dias, "2026-12-02")).toEqual([]);
  });
});
