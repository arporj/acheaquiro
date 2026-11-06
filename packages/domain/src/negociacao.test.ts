import { describe, expect, it } from "vitest";
import { acoesDaFicha, ETAPAS_NEGOCIACAO, proximaAcaoAtrasada, type SituacaoDaFicha } from "./negociacao";

const importadoLivre: SituacaoDaFicha = {
  representante: true,
  temConta: false,
  importado: true,
  cadastro: null,
  naoProcurar: false,
  planoEmDia: false,
  abertas: [],
};

describe("ETAPAS_NEGOCIACAO", () => {
  it("vai do contato à proposta aceita", () => {
    expect(ETAPAS_NEGOCIACAO[0]).toBe("contato");
    expect(ETAPAS_NEGOCIACAO.at(-1)).toBe("proposta_aceita");
  });
});

describe("proximaAcaoAtrasada", () => {
  it("só depois do dia marcado", () => {
    expect(proximaAcaoAtrasada("2026-11-05", "2026-11-06")).toBe(true);
    expect(proximaAcaoAtrasada("2026-11-06", "2026-11-06")).toBe(false);
    expect(proximaAcaoAtrasada("2026-11-07", "2026-11-06")).toBe(false);
  });

  it("sem data, nunca está atrasada", () => {
    expect(proximaAcaoAtrasada(null, "2026-11-06")).toBe(false);
    expect(proximaAcaoAtrasada(undefined, "2026-11-06")).toBe(false);
  });
});

describe("acoesDaFicha", () => {
  it("importado livre: fecha e simula, sem proposta (ele não tem conta)", () => {
    expect(acoesDaFicha(importadoLivre)).toEqual({
      registrarContato: true,
      fechar: true,
      continuarCadastro: false,
      fazerProposta: false,
      simular: true,
      abrir: "assinatura",
    });
  });

  it("importado com cadastro de outro representante: não fecha, mas registra contato", () => {
    const acoes = acoesDaFicha({ ...importadoLivre, cadastro: "de_outro" });
    expect(acoes.fechar).toBe(false);
    expect(acoes.continuarCadastro).toBe(false);
    expect(acoes.registrarContato).toBe(true);
  });

  it("importado com o meu cadastro: continua o cadastro", () => {
    const acoes = acoesDaFicha({ ...importadoLivre, cadastro: "meu" });
    expect(acoes.fechar).toBe(false);
    expect(acoes.continuarCadastro).toBe(true);
  });

  it("com conta e sem plano em dia: faz proposta de assinatura", () => {
    const acoes = acoesDaFicha({ ...importadoLivre, importado: false, temConta: true });
    expect(acoes.fazerProposta).toBe(true);
    expect(acoes.fechar).toBe(false);
    expect(acoes.abrir).toBe("assinatura");
  });

  it("com plano em dia: a negociação nova é de upgrade, e o simulador (de assinatura) sai", () => {
    const acoes = acoesDaFicha({ ...importadoLivre, importado: false, temConta: true, planoEmDia: true });
    expect(acoes.abrir).toBe("upgrade");
    expect(acoes.simular).toBe(false);
  });

  it("com a negociação do tipo já aberta, não abre outra", () => {
    expect(acoesDaFicha({ ...importadoLivre, abertas: ["assinatura"] }).abrir).toBeNull();
    expect(acoesDaFicha({ ...importadoLivre, planoEmDia: true, temConta: true, abertas: ["assinatura"] }).abrir).toBe("upgrade");
  });

  it("quem pediu para não ser procurado: só registra contato", () => {
    const acoes = acoesDaFicha({ ...importadoLivre, naoProcurar: true });
    expect(acoes).toMatchObject({ fechar: false, fazerProposta: false, abrir: null, registrarContato: true });
  });

  it("administrador não fecha nem propõe em nome do representante, mas abre negociação", () => {
    const acoes = acoesDaFicha({ ...importadoLivre, representante: false, temConta: true, cadastro: "meu" });
    expect(acoes).toMatchObject({ fechar: false, continuarCadastro: false, fazerProposta: false, simular: false, abrir: "assinatura" });
  });
});
