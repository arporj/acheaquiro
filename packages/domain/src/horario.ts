// "Aberto agora" (item 4.2; Especificação Técnica, seção 8.5), a partir dos
// horários do anunciante e do momento atual em Rio das Ostras (ver momentoLocal).
import type { DiaSemana, HorarioDia } from "@acheaqui/types";

const MINUTOS_NO_DIA = 24 * 60;
const FORMATO_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutos(hora: string): number {
  const partes = FORMATO_HORA.exec(hora);
  if (!partes) throw new RangeError(`Horário inválido: "${hora}". Use o formato HH:MM.`);
  return Number(partes[1]) * 60 + Number(partes[2]);
}

/**
 * Converte o fechamento para minutos. "00:00" e "23:59" no fechamento
 * significam "até o fim do dia".
 */
function minutosFechamento(hora: string): number {
  return hora === "00:00" || hora === "23:59" ? MINUTOS_NO_DIA : minutos(hora);
}

export function estaAberto(horario: readonly HorarioDia[], agora: { dia: DiaSemana; minutos: number }): boolean {
  const ontem = ((agora.dia + 6) % 7) as DiaSemana;

  return horario.some(({ dia, intervalos }) =>
    intervalos.some(({ abre, fecha }) => {
      const inicio = minutos(abre);
      const fim = minutosFechamento(fecha);
      const passaDaMeiaNoite = fim < inicio;
      if (dia === agora.dia) {
        return agora.minutos >= inicio && (passaDaMeiaNoite || agora.minutos < fim);
      }
      // Intervalo de ontem que passou da meia-noite (ex.: 22:00 às 02:00).
      return dia === ontem && passaDaMeiaNoite && agora.minutos < fim;
    }),
  );
}
