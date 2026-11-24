import { describe, expect, it } from "vitest";
import { LIMITE_DIARIO_DE_EMAILS, TETO_AVISOS_POR_DIA, previsaoDoAvisoEmMassa } from "./avisos";

describe("previsaoDoAvisoEmMassa", () => {
  it("poucos e-mails saem no mesmo dia e quase tudo sobra para o login", () => {
    expect(previsaoDoAvisoEmMassa(12)).toEqual({ total: 12, dias: 1, sobraParaOLogin: 288 });
  });

  it("soma o que já está na fila", () => {
    expect(previsaoDoAvisoEmMassa(100, 50)).toEqual({ total: 150, dias: 1, sobraParaOLogin: 150 });
  });

  it("acima do teto, a fila leva mais de um dia e o login fica só com a sobra", () => {
    expect(previsaoDoAvisoEmMassa(600)).toEqual({ total: 600, dias: 3, sobraParaOLogin: LIMITE_DIARIO_DE_EMAILS - TETO_AVISOS_POR_DIA });
  });

  it("exatamente o teto cabe num dia", () => {
    expect(previsaoDoAvisoEmMassa(TETO_AVISOS_POR_DIA).dias).toBe(1);
  });

  it("nada para enviar: zero dias", () => {
    expect(previsaoDoAvisoEmMassa(0)).toEqual({ total: 0, dias: 0, sobraParaOLogin: LIMITE_DIARIO_DE_EMAILS });
  });

  it("valores inválidos contam como zero e frações são cortadas", () => {
    expect(previsaoDoAvisoEmMassa(Number.NaN, -3)).toEqual({ total: 0, dias: 0, sobraParaOLogin: LIMITE_DIARIO_DE_EMAILS });
    expect(previsaoDoAvisoEmMassa(2.7).total).toBe(2);
  });
});
