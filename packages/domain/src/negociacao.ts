// Negociações (decisões N1 a N6 de 06/11/2026): a ordem das etapas, a próxima
// ação atrasada e o que cada pessoa pode fazer na ficha do cliente em cada
// situação. O banco calcula a etapa (interno.etapa_da_negociacao) e confere as
// permissões de novo; aqui fica a regra que decide o que a tela oferece.
import type { DataISO } from "./datas";

export const ETAPAS_NEGOCIACAO = ["contato", "em_cadastro", "convite_enviado", "aceitou", "proposta_enviada", "proposta_aceita"] as const;
export type EtapaNegociacao = (typeof ETAPAS_NEGOCIACAO)[number];
export type TipoNegociacao = "assinatura" | "upgrade";
export type SituacaoNegociacao = "aberta" | "ganha" | "perdida";

/** Próxima ação com a data vencida: pede atenção na lista. O dia de hoje ainda não está atrasado. */
export function proximaAcaoAtrasada(dia: DataISO | null | undefined, hoje: DataISO): boolean {
  return Boolean(dia) && dia! < hoje;
}

export interface SituacaoDaFicha {
  /** Quem está vendo é representante (o administrador não fecha nem propõe em nome de um). */
  representante: boolean;
  temConta: boolean;
  /** Comércio importado da Receita, ainda sem dono. */
  importado: boolean;
  /** Cadastro em andamento (cópia do "Fechei"): de quem está vendo, de outra pessoa, ou nenhum. */
  cadastro: "meu" | "de_outro" | null;
  naoProcurar: boolean;
  planoEmDia: boolean;
  /** Tipos com negociação aberta. */
  abertas: readonly TipoNegociacao[];
}

export interface AcoesDaFicha {
  registrarContato: boolean;
  fechar: boolean;
  continuarCadastro: boolean;
  fazerProposta: boolean;
  simular: boolean;
  /** Tipo que pode ser aberto à mão; vazio quando já há negociação aberta ou o cliente não pode ser procurado. */
  abrir: TipoNegociacao | null;
}

/**
 * O que a ficha oferece. Proposta só para quem tem conta (decisão de 23/10/2026)
 * e "Fechei" só para o importado livre: quem não tem conta passa pelo cadastro.
 */
export function acoesDaFicha(s: SituacaoDaFicha): AcoesDaFicha {
  const podeProcurar = !s.naoProcurar;
  const tipoNovo: TipoNegociacao = s.planoEmDia ? "upgrade" : "assinatura";
  return {
    registrarContato: true,
    fechar: s.representante && podeProcurar && s.importado && !s.temConta && s.cadastro === null,
    continuarCadastro: s.representante && s.cadastro === "meu",
    fazerProposta: s.representante && podeProcurar && s.temConta,
    simular: s.representante && !s.planoEmDia,
    abrir: podeProcurar && !s.abertas.includes(tipoNovo) ? tipoNovo : null,
  };
}
