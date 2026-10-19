import { describe, expect, it } from "vitest";
import { diaDaSemana, inicioDaSemana, momentoLocal, somarDias, somarMeses } from "./datas";

describe("somarDias", () => {
  it("atravessa a virada de mês e de ano", () => {
    expect(somarDias("2026-11-27", 7)).toBe("2026-12-04");
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("recusa datas inválidas", () => {
    expect(() => somarDias("27/11/2026", 1)).toThrow(RangeError);
    expect(() => somarDias("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("somarMeses", () => {
  it("mantém o dia quando ele existe no mês final", () => {
    expect(somarMeses("2026-11-27", 1)).toBe("2026-12-27");
    expect(somarMeses("2026-11-27", 12)).toBe("2027-11-27");
  });

  it("usa o último dia do mês quando o dia não existe", () => {
    expect(somarMeses("2027-01-31", 1)).toBe("2027-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("semana", () => {
  it("identifica o dia da semana (0 = domingo)", () => {
    expect(diaDaSemana("2026-11-27")).toBe(5); // sexta-feira, Black Friday
  });

  it("começa na segunda-feira", () => {
    expect(inicioDaSemana("2026-11-27")).toBe("2026-11-23");
    expect(inicioDaSemana("2026-11-23")).toBe("2026-11-23");
    expect(inicioDaSemana("2026-11-29")).toBe("2026-11-23"); // domingo fecha a semana
  });
});

describe("momentoLocal", () => {
  it("converte o instante para o horário de Rio das Ostras", () => {
    // 02:30 em UTC = 23:30 do dia anterior em São Paulo (UTC-3)
    expect(momentoLocal(new Date("2026-11-28T02:30:00Z"))).toEqual({ data: "2026-11-27", dia: 5, minutos: 23 * 60 + 30 });
  });
});
