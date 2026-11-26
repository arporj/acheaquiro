// Como virar Fundador hoje, para as páginas de venda (decisões de 26/11/2026):
// até o prazo, quem paga a assinatura, mensal ou anual, sem limite; depois,
// os primeiros que pagarem, enquanto houver vaga (vagas_fundador_depois_do_prazo).
// A regra de quem vira Fundador fica em packages/domain (tornaFundador); aqui,
// só o texto, num lugar só.
import { somarDias, vagasFundadorRestantes, type VagasFundador } from "@acheaqui/domain";
import type { RegrasCobranca } from "@acheaqui/types";
import { formatarData } from "./texto";

export type OfertaFundador =
  | { tipo: "prazo"; prazo: string }
  /** total e restantes ficam vazios se o banco não respondeu: a página não promete número. */
  | { tipo: "vagas"; inicio: string; total: number | null; restantes: number | null }
  | { tipo: "esgotada" };

export function ofertaFundador(regras: Pick<RegrasCobranca, "prazoFundador">, hoje: string, vagas: VagasFundador | null): OfertaFundador {
  if (hoje <= regras.prazoFundador) return { tipo: "prazo", prazo: formatarData(regras.prazoFundador) };
  const inicio = formatarData(somarDias(regras.prazoFundador, 1));
  if (!vagas) return { tipo: "vagas", inicio, total: null, restantes: null };
  const restantes = vagasFundadorRestantes(vagas);
  return restantes > 0 ? { tipo: "vagas", inicio, total: vagas.total, restantes } : { tipo: "esgotada" };
}

export function textoVagasRestantes(restantes: number): string {
  return restantes === 1 ? "Resta 1 vaga" : `Restam ${restantes.toLocaleString("pt-BR")} vagas`;
}

/** Frase de como virar Fundador, para o topo das páginas e a prévia dos links. */
export function textoComoVirarFundador(oferta: OfertaFundador): string {
  if (oferta.tipo === "prazo") return `Pague a assinatura de um plano pago, mensal ou anual, até ${oferta.prazo}.`;
  if (oferta.tipo === "esgotada") return "As vagas de Fundador acabaram.";
  const quem = oferta.total === null ? "Os primeiros anunciantes" : `Os primeiros ${oferta.total.toLocaleString("pt-BR")} anunciantes`;
  const restam = oferta.restantes === null ? " enquanto houver vaga" : `. ${textoVagasRestantes(oferta.restantes)}`;
  return `${quem} que pagarem um plano pago, mensal ou anual, a partir de ${oferta.inicio} viram Fundadores${restam}.`;
}
