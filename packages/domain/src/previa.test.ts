import { describe, expect, it } from "vitest";
import { fotoParaPrevia, LIMITE_TEXTO_PREVIA, resumirTexto } from "./previa";

describe("resumirTexto", () => {
  it("devolve o texto inteiro quando cabe no limite", () => {
    expect(resumirTexto("Eletricista há 15 anos.")).toBe("Eletricista há 15 anos.");
    const exato = "a".repeat(LIMITE_TEXTO_PREVIA);
    expect(resumirTexto(exato)).toBe(exato);
  });

  it("junta espaços e quebras de linha antes de medir", () => {
    expect(resumirTexto("  Pizza\n\nno   forno a lenha  ")).toBe("Pizza no forno a lenha");
  });

  it("corta na última palavra inteira e termina com reticências", () => {
    expect(resumirTexto("Instalação de chuveiro e tomada", 20)).toBe("Instalação de…");
  });

  it("aproveita a palavra que termina bem no ponto do corte", () => {
    // "Troca de quadro" tem 15 letras; o espaço vem logo depois.
    expect(resumirTexto("Troca de quadro de luz", 16)).toBe("Troca de quadro…");
  });

  it("tira a pontuação solta antes das reticências", () => {
    expect(resumirTexto("Rações, petiscos, acessórios e farmácia", 19)).toBe("Rações, petiscos…");
    expect(resumirTexto("Atendo à noite. Também aos sábados", 17)).toBe("Atendo à noite…");
  });

  it("nunca passa do limite, com as reticências", () => {
    const longo =
      "Eletricista há 15 anos em Rio das Ostras. Instalação e troca de quadro de luz, tomadas, chuveiros, iluminação de LED e padrão da Enel. Faço também instalação de ar-condicionado split.";
    const resumo = resumirTexto(longo);
    expect(resumo.length).toBeLessThanOrEqual(LIMITE_TEXTO_PREVIA);
    expect(resumo.endsWith("…")).toBe(true);
    expect(longo.startsWith(resumo.slice(0, -1))).toBe(true);
  });

  it("corta no meio uma palavra só, maior que o limite", () => {
    expect(resumirTexto("abcdefghijklmnop", 10)).toBe("abcdefghi…");
  });

  it("devolve vazio para texto vazio", () => {
    expect(resumirTexto("   ")).toBe("");
  });
});

describe("fotoParaPrevia", () => {
  it("aceita JPEG, com ou sem parâmetros no endereço", () => {
    expect(fotoParaPrevia("https://arquivos.acheaquiro.com.br/fotos/1/abc-800.jpg")).toBe(
      "https://arquivos.acheaquiro.com.br/fotos/1/abc-800.jpg",
    );
    expect(fotoParaPrevia("/mock/fotos/a01-perfil.JPEG?v=2")).toBe("/mock/fotos/a01-perfil.JPEG?v=2");
    expect(fotoParaPrevia("/foto.jpg#topo")).toBe("/foto.jpg#topo");
  });

  it("recusa outros formatos e foto ausente", () => {
    expect(fotoParaPrevia("/mock/fotos/a01-perfil.webp")).toBeUndefined();
    expect(fotoParaPrevia("/foto.webp?x=.jpg")).toBeUndefined();
    expect(fotoParaPrevia("")).toBeUndefined();
    expect(fotoParaPrevia(undefined)).toBeUndefined();
  });
});
