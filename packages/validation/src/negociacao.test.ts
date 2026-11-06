import { describe, expect, it } from "vitest";
import { esquemaCodigoIndicacao, esquemaMotivoPerda, esquemaNegociacaoPerdida, esquemaProximaAcao } from "./negociacao";

describe("esquemaProximaAcao", () => {
  it("aceita dia e texto, limpando os espaços", () => {
    expect(esquemaProximaAcao.parse({ dia: "2026-11-10", texto: "  Ligar   de manhã " })).toEqual({ dia: "2026-11-10", texto: "Ligar de manhã" });
  });

  it("tudo vazio apaga a próxima ação", () => {
    expect(esquemaProximaAcao.parse({})).toEqual({ dia: "", texto: "" });
  });

  it("recusa texto sem dia e dia inválido", () => {
    expect(esquemaProximaAcao.safeParse({ dia: "", texto: "Ligar" }).success).toBe(false);
    expect(esquemaProximaAcao.safeParse({ dia: "10/11/2026", texto: "" }).success).toBe(false);
  });

  it("recusa texto acima de 200 letras", () => {
    expect(esquemaProximaAcao.safeParse({ dia: "2026-11-10", texto: "a".repeat(201) }).success).toBe(false);
  });
});

describe("esquemaNegociacaoPerdida", () => {
  const motivoId = "6f1c7c2e-8a55-4c5e-9f39-0d7a1e2b3c4d";

  it("exige o motivo", () => {
    expect(esquemaNegociacaoPerdida.safeParse({ motivoId: "" }).success).toBe(false);
    expect(esquemaNegociacaoPerdida.parse({ motivoId })).toEqual({ motivoId, observacao: "" });
  });

  it("recusa observação acima de 300 letras", () => {
    expect(esquemaNegociacaoPerdida.safeParse({ motivoId, observacao: "a".repeat(301) }).success).toBe(false);
  });
});

describe("esquemaMotivoPerda", () => {
  it("limpa o nome e confere o tamanho", () => {
    expect(esquemaMotivoPerda.parse({ nome: "  Sem   verba " })).toEqual({ nome: "Sem verba" });
    expect(esquemaMotivoPerda.safeParse({ nome: "a" }).success).toBe(false);
    expect(esquemaMotivoPerda.safeParse({ nome: "a".repeat(61) }).success).toBe(false);
    expect(esquemaMotivoPerda.safeParse({}).success).toBe(false);
  });
});

describe("esquemaCodigoIndicacao", () => {
  it("vazio vira nulo", () => {
    expect(esquemaCodigoIndicacao.parse(undefined)).toBeNull();
    expect(esquemaCodigoIndicacao.parse("   ")).toBeNull();
  });

  it("aceita o código em qualquer caixa", () => {
    expect(esquemaCodigoIndicacao.parse(" Joao-Silva ")).toBe("joao-silva");
  });

  it("recusa formato inválido", () => {
    for (const codigo of ["ab", "joão", "joao silva", "-joao", "a".repeat(31)]) {
      expect(esquemaCodigoIndicacao.safeParse(codigo).success).toBe(false);
    }
  });
});
