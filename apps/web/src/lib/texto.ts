/** Remove acentos e passa para minúsculas, para comparar textos na busca. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function paraSlug(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "2026-11-26" → "26/11/2026". */
export function formatarData(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function dataUTC(dataISO: string): Date {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** "2026-10-24" → "sábado, 24 de outubro". */
export function dataLonga(dataISO: string): string {
  return dataUTC(dataISO).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** "2026-10-24" → "sáb., 24/10". */
export function dataCurtaComSemana(dataISO: string): string {
  return dataUTC(dataISO).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/** Dia da semana de 0 (domingo) a 6 (sábado). */
export function diaDaSemana(dataISO: string): number {
  return dataUTC(dataISO).getUTCDay();
}
