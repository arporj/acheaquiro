import { describe, expect, it } from "vitest";
import { esquemaHorario, horarioParaFormulario, horariosIguais, type DiaHorarioFormulario } from "./horario";

const fechado: DiaHorarioFormulario = { aberto: false };
const semana = (dias: Partial<Record<number, DiaHorarioFormulario>>): DiaHorarioFormulario[] =>
  Array.from({ length: 7 }, (_, i) => dias[i] ?? fechado);
const mensagem = (r: { error?: { issues: { message: string; path: PropertyKey[] }[] } }) => r.error?.issues[0];

describe("horário de atendimento", () => {
  it("semana toda fechada vira lista vazia (horário a combinar)", () => {
    expect(esquemaHorario.parse(semana({}))).toEqual([]);
  });

  it("guarda só os dias abertos, com uma ou duas faixas", () => {
    const r = esquemaHorario.parse(
      semana({
        1: { aberto: true, abre1: "08:00", fecha1: "12:00", abre2: "14:00", fecha2: "18:00" },
        6: { aberto: true, abre1: " 09:00 ", fecha1: "13:00", abre2: "", fecha2: "" },
      }),
    );
    expect(r).toEqual([
      { dia: 1, intervalos: [{ abre: "08:00", fecha: "12:00" }, { abre: "14:00", fecha: "18:00" }] },
      { dia: 6, intervalos: [{ abre: "09:00", fecha: "13:00" }] },
    ]);
  });

  it("dia fechado ignora as horas digitadas", () => {
    expect(esquemaHorario.parse(semana({ 2: { aberto: false, abre1: "99:99" } }))).toEqual([]);
  });

  it("aceita passar da meia-noite e o dia inteiro", () => {
    const r = esquemaHorario.parse(semana({ 5: { aberto: true, abre1: "18:00", fecha1: "02:00" }, 0: { aberto: true, abre1: "00:00", fecha1: "23:59" } }));
    expect(r).toEqual([
      { dia: 0, intervalos: [{ abre: "00:00", fecha: "23:59" }] },
      { dia: 5, intervalos: [{ abre: "18:00", fecha: "02:00" }] },
    ]);
  });

  it("segunda faixa pode passar da meia-noite", () => {
    const r = esquemaHorario.safeParse(semana({ 5: { aberto: true, abre1: "11:00", fecha1: "15:00", abre2: "18:00", fecha2: "01:00" } }));
    expect(r.success).toBe(true);
  });

  it("dia aberto sem horas é recusado, com o nome do dia e o caminho do campo", () => {
    const r = esquemaHorario.safeParse(semana({ 3: { aberto: true, abre1: "08:00" } }));
    expect(mensagem(r)).toMatchObject({ message: "Quarta: informe a hora de abrir e de fechar, ou marque como fechado.", path: [3] });
  });

  it("recusa hora fora do formato", () => {
    expect(mensagem(esquemaHorario.safeParse(semana({ 1: { aberto: true, abre1: "8h", fecha1: "18:00" } })))?.message).toBe(
      "Segunda: hora inválida. Use o formato 08:00.",
    );
    expect(mensagem(esquemaHorario.safeParse(semana({ 1: { aberto: true, abre1: "24:00", fecha1: "18:00" } })))?.message).toBe(
      "Segunda: hora inválida. Use o formato 08:00.",
    );
    expect(
      mensagem(esquemaHorario.safeParse(semana({ 1: { aberto: true, abre1: "08:00", fecha1: "12:00", abre2: "14:00", fecha2: "18:5" } })))?.message,
    ).toBe("Segunda: hora inválida. Use o formato 08:00.");
  });

  it("recusa abrir e fechar na mesma hora, nas duas faixas", () => {
    expect(mensagem(esquemaHorario.safeParse(semana({ 1: { aberto: true, abre1: "08:00", fecha1: "08:00" } })))?.message).toBe(
      "Segunda: a hora de fechar precisa ser diferente da de abrir.",
    );
    expect(
      mensagem(esquemaHorario.safeParse(semana({ 1: { aberto: true, abre1: "08:00", fecha1: "12:00", abre2: "14:00", fecha2: "14:00" } })))?.message,
    ).toBe("Segunda: na segunda faixa, a hora de fechar precisa ser diferente da de abrir.");
  });

  it("segunda faixa pela metade é recusada", () => {
    expect(mensagem(esquemaHorario.safeParse(semana({ 1: { aberto: true, abre1: "08:00", fecha1: "12:00", abre2: "14:00" } })))?.message).toBe(
      "Segunda: preencha as duas horas da segunda faixa, ou deixe as duas vazias.",
    );
  });

  it("segunda faixa precisa começar depois da primeira, que termina no mesmo dia", () => {
    const erro = "Segunda: a segunda faixa precisa começar depois que a primeira termina.";
    expect(mensagem(esquemaHorario.safeParse(semana({ 1: { aberto: true, abre1: "08:00", fecha1: "12:00", abre2: "11:00", fecha2: "18:00" } })))?.message).toBe(erro);
    expect(mensagem(esquemaHorario.safeParse(semana({ 1: { aberto: true, abre1: "20:00", fecha1: "02:00", abre2: "03:00", fecha2: "05:00" } })))?.message).toBe(erro);
  });

  it("exige os 7 dias", () => {
    expect(mensagem(esquemaHorario.safeParse([fechado]))?.message).toBe("Horário incompleto: são 7 dias.");
  });

  it("volta para os campos do formulário", () => {
    const campos = horarioParaFormulario([{ dia: 1, intervalos: [{ abre: "08:00", fecha: "12:00" }, { abre: "14:00", fecha: "18:00" }] }]);
    expect(campos).toHaveLength(7);
    expect(campos[0]).toEqual({ aberto: false, abre1: "", fecha1: "", abre2: "", fecha2: "" });
    expect(campos[1]).toEqual({ aberto: true, abre1: "08:00", fecha1: "12:00", abre2: "14:00", fecha2: "18:00" });
    expect(esquemaHorario.parse(campos)).toEqual([{ dia: 1, intervalos: [{ abre: "08:00", fecha: "12:00" }, { abre: "14:00", fecha: "18:00" }] }]);
  });

  it("compara horários sem depender da ordem", () => {
    const a = [
      { dia: 2 as const, intervalos: [{ abre: "14:00", fecha: "18:00" }, { abre: "08:00", fecha: "12:00" }] },
      { dia: 1 as const, intervalos: [{ abre: "08:00", fecha: "12:00" }] },
    ];
    const b = [
      { dia: 1 as const, intervalos: [{ abre: "08:00", fecha: "12:00" }] },
      { dia: 2 as const, intervalos: [{ abre: "08:00", fecha: "12:00" }, { abre: "14:00", fecha: "18:00" }] },
    ];
    expect(horariosIguais(a, b)).toBe(true);
    expect(horariosIguais(a, [b[0]!])).toBe(false);
  });
});
