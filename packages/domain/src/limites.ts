// Limites do plano somados aos pacotes extras (itens 6.2, 6.3 e 6.4;
// Especificação Técnica, seção 8.2). Os números vêm das tabelas planos e extras.
import type { Resultado } from "@acheaqui/types";
import type { DataISO } from "./datas";

export type Recurso = "fotos" | "categoriasAdicionais" | "encartesSemana" | "produtos" | "enderecos";

export type LimitesPlano = Record<Recurso, number>;

export interface ExtraDeLimite {
  recurso: Recurso;
  quantidade: number;
  inicio: DataISO;
  fim: DataISO;
}

/** Um par de "antes e depois" usa 2 fotos do limite (item 4.3). */
export const FOTOS_POR_PAR_ANTES_DEPOIS = 2;

const nomes: Record<Recurso, string> = {
  fotos: "fotos",
  categoriasAdicionais: "categorias adicionais",
  encartesSemana: "encartes por semana",
  produtos: "produtos",
  enderecos: "endereços",
};

export function extraAtivo(extra: ExtraDeLimite, hoje: DataISO): boolean {
  return extra.inicio <= hoje && hoje <= extra.fim;
}

export function limiteEfetivo(
  plano: LimitesPlano,
  extras: readonly ExtraDeLimite[],
  recurso: Recurso,
  hoje: DataISO,
): number {
  return extras
    .filter((e) => e.recurso === recurso && extraAtivo(e, hoje))
    .reduce((total, e) => total + e.quantidade, plano[recurso]);
}

export function podeAdicionar(
  recurso: Recurso,
  usoAtual: number,
  quantidade: number,
  limite: number,
): Resultado<{ restante: number }> {
  if (!Number.isInteger(quantidade) || quantidade <= 0 || !Number.isInteger(usoAtual) || usoAtual < 0) {
    return { ok: false, erro: { codigo: "DADOS_INVALIDOS", mensagem: "Quantidade inválida." } };
  }
  if (usoAtual + quantidade > limite) {
    return {
      ok: false,
      erro: {
        codigo: "LIMITE_DO_PLANO",
        mensagem: `Seu plano permite até ${limite} ${nomes[recurso]}. Para adicionar mais, mude de plano ou contrate um pacote extra.`,
      },
    };
  }
  return { ok: true, dados: { restante: limite - usoAtual - quantidade } };
}

/**
 * Quantos itens ficam acima do limite depois de uma redução de plano. O
 * excesso fica oculto, sem ser apagado, até o anunciante escolher o que manter.
 */
export function excedente(usoAtual: number, limite: number): number {
  return Math.max(0, usoAtual - limite);
}
