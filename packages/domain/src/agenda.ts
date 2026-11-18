// Regras da Agenda de shows e eventos (decisões de 21, 22 e 29/10/2026 e de
// 17/11/2026). O banco repete as travas de datas e de quem aparece na Agenda
// (migration da Agenda); mudou uma regra aqui, mude lá.
import type { OrigemEvento } from "@acheaqui/types";
import { compararNomes } from "./categorias";
import { diasEntre, somarDias, somarMeses, type DataISO } from "./datas";

/** O evento avulso é cobrado por bloco de 7 dias, do primeiro ao último dia (decisão 8). */
export const DIAS_POR_BLOCO_EVENTO = 7;

/** Eventos cadastrados até 12 meses à frente (decisão 8). */
export const MESES_DE_ANTECEDENCIA_AGENDA = 12;

/** Dias de duração, contando o primeiro e o último (27 a 29 = 3 dias). */
export function diasDoEvento(inicio: DataISO, fim: DataISO): number {
  const dias = diasEntre(inicio, fim) + 1;
  if (dias < 1) throw new RangeError(`O último dia (${fim}) vem antes do primeiro (${inicio}).`);
  return dias;
}

/** Blocos de 7 dias do evento avulso: 5 dias = 1 bloco; 14 = 2; 30 = 5. */
export function blocosDoEventoAvulso(inicio: DataISO, fim: DataISO): number {
  return Math.ceil(diasDoEvento(inicio, fim) / DIAS_POR_BLOCO_EVENTO);
}

/** Preço do evento avulso, sem desconto de Fundador (decisão 8). */
export function precoEventoAvulso(inicio: DataISO, fim: DataISO, valorBlocoCentavos: number): { blocos: number; valorCentavos: number } {
  if (!Number.isInteger(valorBlocoCentavos) || valorBlocoCentavos <= 0) {
    throw new RangeError(`Valor do bloco inválido: ${valorBlocoCentavos}.`);
  }
  const blocos = blocosDoEventoAvulso(inicio, fim);
  return { blocos, valorCentavos: blocos * valorBlocoCentavos };
}

/** Último dia em que um evento pode começar, cadastrado hoje. */
export function ultimoDiaParaComecar(hoje: DataISO): DataISO {
  return somarMeses(hoje, MESES_DE_ANTECEDENCIA_AGENDA);
}

/**
 * Confere as datas de um evento novo ou alterado. Devolve a mensagem para a
 * tela, ou null se as datas servem. Evento que já terminou não é cadastrado.
 */
export function problemaNasDatasDoEvento(entrada: { inicio: DataISO; fim: DataISO; hoje: DataISO }): string | null {
  const { inicio, fim, hoje } = entrada;
  if (diasEntre(inicio, fim) < 0) return "O último dia não pode vir antes do primeiro.";
  if (diasEntre(hoje, fim) < 0) return "Este evento já terminou.";
  if (diasEntre(ultimoDiaParaComecar(hoje), inicio) > 0) {
    return `A Agenda aceita eventos que começam até ${MESES_DE_ANTECEDENCIA_AGENDA} meses à frente.`;
  }
  return null;
}

/** O dia da programação precisa estar entre o primeiro e o último dia do evento. */
export function diaDentroDoEvento(dia: DataISO, evento: { inicio: DataISO; fim: DataISO }): boolean {
  return diasEntre(evento.inicio, dia) >= 0 && diasEntre(dia, evento.fim) >= 0;
}

/** O que decide se um evento publicado aparece na Agenda (o banco repete em interno.evento_liberado). */
export interface EventoParaLiberar {
  origem: OrigemEvento;
  /** comercio e artista: o anúncio está publicado. */
  anuncioNoAr?: boolean;
  /** comercio: o plano em vigor inclui a Agenda (Premium de comércio). */
  planoIncluiAgenda?: boolean;
  /** comercio: o extra Agenda está contratado e em dia. */
  extraAgendaEmDia?: boolean;
  /** artista: o anúncio é da categoria "Músicos e bandas". */
  anuncioDeArtista?: boolean;
  /** avulso: os blocos de 7 dias do evento estão todos pagos (pagamentos não devolvidos). */
  pago?: boolean;
  /** avulso: a administração deu o evento como cortesia, com motivo (decisão C1 de 17/11/2026). */
  cortesia?: boolean;
}

/** Por que o evento não aparece na Agenda, ou null se aparece. */
export function impedimentoParaAparecerNaAgenda(evento: EventoParaLiberar): string | null {
  switch (evento.origem) {
    case "comercio":
      if (!evento.anuncioNoAr) return "O anúncio do comércio não está no ar.";
      if (!evento.planoIncluiAgenda && !evento.extraAgendaEmDia) return "O comércio precisa do extra Agenda em dia ou de um plano que inclua a Agenda.";
      return null;
    case "artista":
      if (!evento.anuncioNoAr) return "O anúncio do artista não está no ar.";
      if (!evento.anuncioDeArtista) return "Só o anúncio da categoria Músicos e bandas cadastra shows sem o extra Agenda.";
      return null;
    case "avulso":
      return evento.pago || evento.cortesia ? null : "O evento avulso aparece com todos os blocos de 7 dias pagos ou com a cortesia.";
    case "orgao_publico":
      return null;
  }
}

export type SituacaoDoEvento = "rascunho" | "publicado" | "cancelado";

/** O que o cliente e o representante sabem do evento (o banco calcula em public.situacao_do_evento). */
export interface EventoParaOCliente {
  origem: OrigemEvento;
  situacao: SituacaoDoEvento;
  /** Aparece na Agenda quando publicado (interno.evento_liberado). */
  liberado: boolean;
  /** avulso: blocos de 7 dias do evento e os já pagos. */
  blocos: number;
  blocosPagos: number;
}

const plural = (n: number, singular: string, varios: string) => `${n} ${n === 1 ? singular : varios}`;

/** O que falta para o evento aparecer na Agenda, em texto para quem não é da equipe; null se nada falta. */
function faltaParaAparecer(e: EventoParaOCliente): string | null {
  if (e.liberado) return null;
  switch (e.origem) {
    case "avulso": {
      const faltam = Math.max(1, e.blocos - e.blocosPagos);
      return `aparece no site depois do pagamento de ${plural(faltam, "bloco", "blocos")} de 7 dias. Fale com a equipe para pagar.`;
    }
    case "comercio":
      return "aparece na Agenda só com o anúncio do comércio no ar e o extra Agenda ou um plano que inclua a Agenda.";
    case "artista":
      return "aparece na Agenda só com o anúncio do artista no ar, na categoria Músicos e bandas.";
    case "orgao_publico":
      return null;
  }
}

/**
 * Situação do evento para o cliente e o representante (decisões K1 e K2 de
 * 17/11/2026): o evento publicado vai direto para o site quando está liberado.
 */
export function situacaoParaOCliente(e: EventoParaOCliente): string {
  const falta = faltaParaAparecer(e);
  if (e.situacao === "cancelado") return "Cancelado: não aparece no site.";
  if (e.situacao === "rascunho") return `Rascunho: ainda não aparece no site.${falta ? ` Publicado, ${falta}` : " Publique quando estiver pronto."}`;
  return falta ? `Publicado, mas ${falta}` : "Publicado e no site.";
}

/** O representante edita o evento que cadastrou enquanto é rascunho e o cliente ainda não o publicou (decisão K3). */
export function representantePodeEditarEvento(e: { situacao: SituacaoDoEvento; publicadoEm: string | null }): boolean {
  return e.situacao === "rascunho" && e.publicadoEm === null;
}

export interface EstiloMusical {
  id: string;
  nome: string;
}

/** Estilos do evento: os dos artistas da programação, sem repetir, em ordem alfabética (decisão 10). */
export function estilosDoEvento(artistas: readonly { estilos: readonly EstiloMusical[] }[]): EstiloMusical[] {
  const porId = new Map<string, EstiloMusical>();
  for (const artista of artistas) for (const estilo of artista.estilos) porId.set(estilo.id, estilo);
  return [...porId.values()].sort((a, b) => compararNomes(a.nome, b.nome));
}

/** Primeiro e último dia de um mês AAAA-MM. */
function limitesDoMes(mes: string): { de: DataISO; ate: DataISO } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new RangeError(`Mês inválido: "${mes}". Use o formato AAAA-MM.`);
  const de = `${mes}-01`;
  return { de, ate: somarDias(somarMeses(de, 1), -1) };
}

/**
 * Dias do evento dentro de um período, em ordem. Usado para o evento de vários
 * dias aparecer em cada dia (e em cada mês) em que acontece (decisão 11).
 */
export function diasDoEventoNoPeriodo(evento: { inicio: DataISO; fim: DataISO }, de: DataISO, ate: DataISO): DataISO[] {
  const primeiro = diasEntre(de, evento.inicio) > 0 ? evento.inicio : de;
  const ultimo = diasEntre(evento.fim, ate) > 0 ? evento.fim : ate;
  const dias: DataISO[] = [];
  for (let dia = primeiro; diasEntre(dia, ultimo) >= 0; dia = somarDias(dia, 1)) dias.push(dia);
  return dias;
}

/** O evento tem pelo menos um dia no mês AAAA-MM (decisão 11). */
export function eventoNoMes(evento: { inicio: DataISO; fim: DataISO }, mes: string): boolean {
  const { de, ate } = limitesDoMes(mes);
  return diasEntre(evento.inicio, ate) >= 0 && diasEntre(de, evento.fim) >= 0;
}
