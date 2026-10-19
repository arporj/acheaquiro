import { describe, expect, it } from "vitest";
import {
  FOTOS_POR_PAR_ANTES_DEPOIS,
  excedente,
  limiteEfetivo,
  podeAdicionar,
  type ExtraDeLimite,
  type LimitesPlano,
} from "./limites";

// Números de exemplo: na aplicação, vêm da tabela de planos.
const vitrine: LimitesPlano = { fotos: 15, categoriasAdicionais: 3, encartesSemana: 4, produtos: 30, enderecos: 1 };
const hoje = "2026-12-10";

describe("limiteEfetivo", () => {
  it("é o limite do plano quando não há extras", () => {
    expect(limiteEfetivo(vitrine, [], "fotos", hoje)).toBe(15);
  });

  it("soma os pacotes extras ativos do mesmo recurso", () => {
    const extras: ExtraDeLimite[] = [
      { recurso: "fotos", quantidade: 10, inicio: "2026-12-01", fim: "2026-12-31" },
      { recurso: "fotos", quantidade: 10, inicio: "2026-12-10", fim: "2026-12-10" },
      { recurso: "produtos", quantidade: 50, inicio: "2026-12-01", fim: "2026-12-31" },
    ];
    expect(limiteEfetivo(vitrine, extras, "fotos", hoje)).toBe(35);
    expect(limiteEfetivo(vitrine, extras, "produtos", hoje)).toBe(80);
  });

  it("não soma extra vencido nem extra que ainda não começou", () => {
    const extras: ExtraDeLimite[] = [
      { recurso: "fotos", quantidade: 10, inicio: "2026-11-01", fim: "2026-12-09" },
      { recurso: "fotos", quantidade: 10, inicio: "2026-12-11", fim: "2027-01-10" },
    ];
    expect(limiteEfetivo(vitrine, extras, "fotos", hoje)).toBe(15);
  });

  it("soma um endereço adicional ao endereço do plano", () => {
    const extras: ExtraDeLimite[] = [{ recurso: "enderecos", quantidade: 1, inicio: "2026-12-01", fim: "2026-12-31" }];
    expect(limiteEfetivo(vitrine, extras, "enderecos", hoje)).toBe(2);
  });
});

describe("podeAdicionar", () => {
  it("aceita até o limite", () => {
    expect(podeAdicionar("fotos", 14, 1, 15)).toEqual({ ok: true, dados: { restante: 0 } });
  });

  it("recusa uma unidade acima do limite, com mensagem para o anunciante", () => {
    const resultado = podeAdicionar("produtos", 30, 1, 30);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro.codigo).toBe("LIMITE_DO_PLANO");
      expect(resultado.erro.mensagem).toContain("30 produtos");
    }
  });

  it("recusa um par de antes e depois quando resta só 1 foto", () => {
    const resultado = podeAdicionar("fotos", 14, FOTOS_POR_PAR_ANTES_DEPOIS, 15);
    expect(resultado.ok).toBe(false);
  });

  it("aceita um par de antes e depois quando restam 2 fotos", () => {
    expect(podeAdicionar("fotos", 13, FOTOS_POR_PAR_ANTES_DEPOIS, 15).ok).toBe(true);
  });

  it.each([
    [0, 0],
    [-1, 0],
    [1.5, 0],
    [1, -1],
  ])("recusa quantidade %s com uso %s", (quantidade, uso) => {
    const resultado = podeAdicionar("fotos", uso, quantidade, 15);
    expect(resultado.ok === false && resultado.erro.codigo).toBe("DADOS_INVALIDOS");
  });
});

describe("excedente", () => {
  it("conta o que passou do novo limite depois de reduzir o plano", () => {
    expect(excedente(15, 5)).toBe(10);
  });

  it("é zero quando o uso cabe no limite", () => {
    expect(excedente(3, 5)).toBe(0);
  });
});
