// Banner Exclusivo vendido por dia (Especificação Funcional, item 6.4;
// decisões de 20/10/2026). Um anunciante por dia; os dias são escolhidos num
// calendário, entre os livres. Os números vêm de extras.regras.
import type { Resultado } from "@acheaqui/types";
import { somarDias, type DataISO } from "./datas";

export interface RegrasBannerExclusivo {
  /** Valor de cada dia avulso (hoje, R$ 24,90). */
  diariaCentavos: number;
  /** Valor de um bloco de dias seguidos (hoje, R$ 500,00 por 30 dias). */
  valorBlocoCentavos: number;
  diasPorBloco: number;
  /** A partir de quantos dias seguidos o anunciante paga o bloco e recebe os dias do bloco (hoje, 21). */
  minimoDiasParaBloco: number;
  /** O primeiro dia escolhido fica pelo menos estes dias depois do envio do comprovante (hoje, 2). */
  antecedenciaDias: number;
}

/** Bloco pago com menos dias seguidos do que tem: o que falta vai para os próximos dias livres. */
export interface BlocoACompletar {
  /** Último dia da sequência escolhida; os dias que faltam vêm depois dele. */
  aposDia: DataISO;
  dias: number;
}

export interface PrecoBanner {
  valorCentavos: number;
  blocosACompletar: BlocoACompletar[];
}

/** Separa os dias em sequências de dias seguidos, em ordem. */
export function sequenciasDeDias(dias: readonly DataISO[]): DataISO[][] {
  const ordenados = [...dias].sort();
  const sequencias: DataISO[][] = [];
  for (const dia of ordenados) {
    const atual = sequencias.at(-1);
    if (atual && somarDias(atual.at(-1)!, 1) === dia) atual.push(dia);
    else sequencias.push([dia]);
  }
  return sequencias;
}

/**
 * Cada sequência de dias seguidos paga diária por dia. A cada bloco de 30 dias
 * seguidos, paga o valor do bloco. Uma sobra de 21 dias ou mais também paga o
 * bloco, e os dias que faltam para completá-lo ficam para os próximos dias
 * livres depois da sequência. Dias soltos pagam sempre a diária.
 */
export function calcularPrecoBanner(dias: readonly DataISO[], regras: RegrasBannerExclusivo): PrecoBanner {
  validarRegras(regras);
  if (new Set(dias).size !== dias.length) throw new RangeError("Há dias repetidos na escolha.");

  let valorCentavos = 0;
  const blocosACompletar: BlocoACompletar[] = [];
  for (const sequencia of sequenciasDeDias(dias)) {
    const blocosInteiros = Math.floor(sequencia.length / regras.diasPorBloco);
    const sobra = sequencia.length % regras.diasPorBloco;
    valorCentavos += blocosInteiros * regras.valorBlocoCentavos;
    if (sobra >= regras.minimoDiasParaBloco) {
      valorCentavos += regras.valorBlocoCentavos;
      blocosACompletar.push({ aposDia: sequencia.at(-1)!, dias: regras.diasPorBloco - sobra });
    } else {
      valorCentavos += sobra * regras.diariaCentavos;
    }
  }
  return { valorCentavos, blocosACompletar };
}

/** Confere a escolha de dias antes de mostrar o valor e receber o comprovante. */
export function validarReservaBanner(
  dias: readonly DataISO[],
  contexto: { hoje: DataISO; ocupados: ReadonlySet<DataISO>; regras: RegrasBannerExclusivo },
): Resultado<PrecoBanner> {
  if (dias.length === 0) {
    return { ok: false, erro: { codigo: "DADOS_INVALIDOS", mensagem: "Escolha pelo menos um dia." } };
  }
  if (new Set(dias).size !== dias.length) {
    return { ok: false, erro: { codigo: "DADOS_INVALIDOS", mensagem: "Há dias repetidos na escolha." } };
  }
  const primeiroPermitido = somarDias(contexto.hoje, contexto.regras.antecedenciaDias);
  if (dias.some((dia) => dia < primeiroPermitido)) {
    const [ano, mes, dia] = primeiroPermitido.split("-");
    return {
      ok: false,
      erro: { codigo: "DADOS_INVALIDOS", mensagem: `Escolha dias a partir de ${dia}/${mes}/${ano}.` },
    };
  }
  if (dias.some((dia) => contexto.ocupados.has(dia))) {
    return {
      ok: false,
      erro: { codigo: "CONFLITO", mensagem: "Algum dos dias escolhidos acabou de ser reservado. Escolha outro." },
    };
  }
  return { ok: true, dados: calcularPrecoBanner(dias, contexto.regras) };
}

/** Os próximos dias livres depois de uma data, para completar um bloco pago. */
export function proximosDiasLivres(aposDia: DataISO, quantidade: number, ocupados: ReadonlySet<DataISO>): DataISO[] {
  const livres: DataISO[] = [];
  // Um limite folgado evita laço infinito com um calendário todo ocupado.
  for (let passo = 1; livres.length < quantidade; passo++) {
    if (passo > 731) throw new RangeError("Não há dias livres suficientes nos próximos 2 anos.");
    const dia = somarDias(aposDia, passo);
    if (!ocupados.has(dia)) livres.push(dia);
  }
  return livres;
}

/**
 * Dias pré-reservados que passaram antes de a equipe confirmar o Pix. O banner
 * vale a partir do dia seguinte à confirmação; esses dias são trocados por
 * outros dias livres, escolhidos pelo anunciante, sem devolução em dinheiro.
 */
export function diasPerdidosNaConfirmacao(dias: readonly DataISO[], confirmadoEm: DataISO): DataISO[] {
  return dias.filter((dia) => dia <= confirmadoEm).sort();
}

function validarRegras(regras: RegrasBannerExclusivo): void {
  const numeros = Object.values(regras);
  if (numeros.some((n) => !Number.isInteger(n) || n < 0) || regras.diasPorBloco < 1) {
    throw new RangeError("Regras do Banner Exclusivo inválidas.");
  }
  if (regras.minimoDiasParaBloco < 1 || regras.minimoDiasParaBloco > regras.diasPorBloco) {
    throw new RangeError("O mínimo de dias para o bloco precisa estar entre 1 e os dias do bloco.");
  }
}
