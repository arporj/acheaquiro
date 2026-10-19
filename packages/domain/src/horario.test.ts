import { describe, expect, it } from "vitest";
import type { DiaSemana, HorarioDia } from "@acheaqui/types";
import { estaAberto } from "./horario";

const h = (hora: number, minuto = 0) => hora * 60 + minuto;
const em = (dia: DiaSemana, minutos: number) => ({ dia, minutos });

// Segunda a sexta 08:00–18:00, sábado 08:00–12:00, domingo fechado.
const comercial: HorarioDia[] = [
  ...([1, 2, 3, 4, 5] as DiaSemana[]).map((dia) => ({ dia, intervalos: [{ abre: "08:00", fecha: "18:00" }] })),
  { dia: 6, intervalos: [{ abre: "08:00", fecha: "12:00" }] },
  { dia: 0, intervalos: [] },
];

describe("estaAberto", () => {
  it("abre no horário de abertura e fecha no de fechamento", () => {
    expect(estaAberto(comercial, em(1, h(7, 59)))).toBe(false);
    expect(estaAberto(comercial, em(1, h(8)))).toBe(true);
    expect(estaAberto(comercial, em(1, h(17, 59)))).toBe(true);
    expect(estaAberto(comercial, em(1, h(18)))).toBe(false);
  });

  it("respeita o dia fechado", () => {
    expect(estaAberto(comercial, em(0, h(10)))).toBe(false);
  });

  it("considera mais de um intervalo no dia (almoço e jantar)", () => {
    const restaurante: HorarioDia[] = [
      { dia: 5, intervalos: [{ abre: "11:30", fecha: "15:00" }, { abre: "18:30", fecha: "23:00" }] },
    ];
    expect(estaAberto(restaurante, em(5, h(12)))).toBe(true);
    expect(estaAberto(restaurante, em(5, h(16)))).toBe(false);
    expect(estaAberto(restaurante, em(5, h(20)))).toBe(true);
  });

  it("atravessa a meia-noite (sexta 22:00 às 02:00 de sábado)", () => {
    const bar: HorarioDia[] = [{ dia: 5, intervalos: [{ abre: "22:00", fecha: "02:00" }] }];
    expect(estaAberto(bar, em(5, h(23)))).toBe(true);
    expect(estaAberto(bar, em(6, h(1, 30)))).toBe(true);
    expect(estaAberto(bar, em(6, h(2)))).toBe(false);
    expect(estaAberto(bar, em(5, h(1)))).toBe(false); // madrugada de sexta é de quinta
  });

  it("atravessa a meia-noite de sábado para domingo", () => {
    const bar: HorarioDia[] = [{ dia: 6, intervalos: [{ abre: "20:00", fecha: "03:00" }] }];
    expect(estaAberto(bar, em(0, h(2)))).toBe(true);
  });

  it("entende 00:00 e 23:59 no fechamento como fim do dia", () => {
    const pizzaria: HorarioDia[] = [{ dia: 6, intervalos: [{ abre: "18:00", fecha: "00:00" }] }];
    expect(estaAberto(pizzaria, em(6, h(23, 59)))).toBe(true);
    expect(estaAberto(pizzaria, em(0, h(0, 30)))).toBe(false);

    const vinteQuatroHoras: HorarioDia[] = [{ dia: 2, intervalos: [{ abre: "00:00", fecha: "23:59" }] }];
    expect(estaAberto(vinteQuatroHoras, em(2, h(0)))).toBe(true);
    expect(estaAberto(vinteQuatroHoras, em(2, h(23, 59)))).toBe(true);
  });

  it("recusa horário em formato inválido", () => {
    const errado: HorarioDia[] = [{ dia: 1, intervalos: [{ abre: "8h", fecha: "18:00" }] }];
    expect(() => estaAberto(errado, em(1, h(9)))).toThrow(RangeError);
  });
});
