// Datas como texto AAAA-MM-DD, já no fuso de Rio das Ostras (America/Sao_Paulo).
// As contas são feitas em UTC, onde não existe horário de verão.
import type { DiaSemana } from "@acheaqui/types";

export type DataISO = string;

export const FUSO_HORARIO = "America/Sao_Paulo";

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

function paraUTC(data: DataISO): Date {
  const valor = new Date(`${data}T00:00:00Z`);
  if (!FORMATO_DATA.test(data) || Number.isNaN(valor.getTime()) || valor.toISOString().slice(0, 10) !== data) {
    throw new RangeError(`Data inválida: "${data}". Use o formato AAAA-MM-DD.`);
  }
  return valor;
}

function paraISO(valor: Date): DataISO {
  return valor.toISOString().slice(0, 10);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  const valor = paraUTC(data);
  valor.setUTCDate(valor.getUTCDate() + dias);
  return paraISO(valor);
}

/** Soma meses; quando o dia não existe no mês final (31/01 + 1 mês), usa o último dia. */
export function somarMeses(data: DataISO, meses: number): DataISO {
  const valor = paraUTC(data);
  const dia = valor.getUTCDate();
  valor.setUTCDate(1);
  valor.setUTCMonth(valor.getUTCMonth() + meses);
  const ultimoDia = new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth() + 1, 0)).getUTCDate();
  valor.setUTCDate(Math.min(dia, ultimoDia));
  return paraISO(valor);
}

export function diaDaSemana(data: DataISO): DiaSemana {
  return paraUTC(data).getUTCDay() as DiaSemana;
}

/** Segunda-feira da semana da data (as semanas vão de segunda a domingo). */
export function inicioDaSemana(data: DataISO): DataISO {
  const dia = diaDaSemana(data);
  return somarDias(data, dia === 0 ? -6 : 1 - dia);
}

/** Data, dia da semana e minutos desde a meia-noite em Rio das Ostras. */
export function momentoLocal(instante: Date): { data: DataISO; dia: DiaSemana; minutos: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO_HORARIO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  const data = `${partes.year}-${partes.month}-${partes.day}`;
  return { data, dia: diaDaSemana(data), minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}
