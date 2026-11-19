// Horário de atendimento (autônomo) ou de funcionamento (comércio), no
// formulário do anunciante. Cada dia da semana fica fechado ou aberto com uma
// ou duas faixas (manhã e tarde, por exemplo). Fechamento menor que a abertura
// passa da meia-noite (bar até as 02:00), como na tabela horarios
// (migration 20261022100000_perfis_anunciantes.sql); 00:00 às 23:59 é 24 horas.
import type { HorarioDia, IntervaloHorario } from "@acheaqui/types";
import { z } from "zod";

export const NOMES_DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const hora = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim());

/** Um dia como chega do formulário: aberto ou não, e as horas das duas faixas. */
const esquemaDiaFormulario = z.object({
  aberto: z.boolean(),
  abre1: hora,
  fecha1: hora,
  abre2: hora,
  fecha2: hora,
});
export type DiaHorarioFormulario = z.input<typeof esquemaDiaFormulario>;

function problemaDoDia(dia: z.output<typeof esquemaDiaFormulario>, nome: string): string | null {
  if (!dia.aberto) return null;
  if (!dia.abre1 || !dia.fecha1) return `${nome}: informe a hora de abrir e de fechar, ou marque como fechado.`;
  if (!HORA.test(dia.abre1) || !HORA.test(dia.fecha1)) return `${nome}: hora inválida. Use o formato 08:00.`;
  if (dia.abre1 === dia.fecha1) return `${nome}: a hora de fechar precisa ser diferente da de abrir.`;
  const segunda = dia.abre2 || dia.fecha2;
  if (!segunda) return null;
  if (!dia.abre2 || !dia.fecha2) return `${nome}: preencha as duas horas da segunda faixa, ou deixe as duas vazias.`;
  if (!HORA.test(dia.abre2) || !HORA.test(dia.fecha2)) return `${nome}: hora inválida. Use o formato 08:00.`;
  if (dia.abre2 === dia.fecha2) return `${nome}: na segunda faixa, a hora de fechar precisa ser diferente da de abrir.`;
  // Com duas faixas, a primeira termina no mesmo dia e a segunda começa depois dela.
  if (dia.fecha1 < dia.abre1 || dia.abre2 < dia.fecha1) return `${nome}: a segunda faixa precisa começar depois que a primeira termina.`;
  return null;
}

/** Os 7 dias, de domingo (0) a sábado (6). Sai só a lista dos dias abertos, com as faixas em ordem. */
export const esquemaHorario = z
  .array(esquemaDiaFormulario)
  .length(7, "Horário incompleto: são 7 dias.")
  .superRefine((dias, contexto) => {
    dias.forEach((dia, i) => {
      const problema = problemaDoDia(dia, NOMES_DIAS[i]!);
      if (problema) contexto.addIssue({ code: "custom", message: problema, path: [i] });
    });
  })
  .transform((dias): HorarioDia[] =>
    dias.flatMap((dia, i) => {
      if (!dia.aberto) return [];
      const intervalos: IntervaloHorario[] = [{ abre: dia.abre1, fecha: dia.fecha1 }];
      if (dia.abre2 && dia.fecha2) intervalos.push({ abre: dia.abre2, fecha: dia.fecha2 });
      return [{ dia: i as HorarioDia["dia"], intervalos }];
    }),
  );

/** Do horário gravado para os campos do formulário (dia sem faixa = fechado). */
export function horarioParaFormulario(horario: HorarioDia[]): Required<DiaHorarioFormulario>[] {
  return NOMES_DIAS.map((_, i) => {
    const intervalos = horario.find((d) => d.dia === i)?.intervalos ?? [];
    return {
      aberto: intervalos.length > 0,
      abre1: intervalos[0]?.abre ?? "",
      fecha1: intervalos[0]?.fecha ?? "",
      abre2: intervalos[1]?.abre ?? "",
      fecha2: intervalos[1]?.fecha ?? "",
    };
  });
}

/** Mesmo horário, na mesma ordem: serve para gravar só quando mudou. */
export function horariosIguais(a: HorarioDia[], b: HorarioDia[]): boolean {
  const texto = (h: HorarioDia[]) =>
    JSON.stringify([...h].sort((x, y) => x.dia - y.dia).map((d) => [d.dia, [...d.intervalos].sort((x, y) => x.abre.localeCompare(y.abre))]));
  return texto(a) === texto(b);
}
