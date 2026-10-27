import { describe, expect, it } from "vitest";
import { esquemaConfiguracoesGerais } from "./configuracoes";

const atual = { aberturaAoPublico: "2026-11-27", prazoFundador: "2026-11-26", toleranciaVencimentoDias: "7", percentualCarteira: "5" };
const mensagem = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? "" : r.error!.issues[0]!.message);

describe("esquemaConfiguracoesGerais", () => {
  it("aceita os valores atuais e converte os números", () => {
    expect(esquemaConfiguracoesGerais.parse(atual)).toEqual({
      aberturaAoPublico: "2026-11-27",
      prazoFundador: "2026-11-26",
      toleranciaVencimentoDias: 7,
      percentualCarteira: 5,
    });
  });

  it("aceita carteira zero (sem carteira)", () => {
    expect(esquemaConfiguracoesGerais.parse({ ...atual, percentualCarteira: "0" }).percentualCarteira).toBe(0);
  });

  it("recusa datas inválidas", () => {
    expect(mensagem(esquemaConfiguracoesGerais.safeParse({ ...atual, aberturaAoPublico: "27/11/2026" }))).toBe("Informe o dia da abertura ao público.");
    expect(mensagem(esquemaConfiguracoesGerais.safeParse({ ...atual, prazoFundador: "" }))).toBe("Informe o último dia para virar Fundador.");
  });

  it("o prazo dos Fundadores termina antes da abertura", () => {
    expect(mensagem(esquemaConfiguracoesGerais.safeParse({ ...atual, prazoFundador: "2026-11-27" }))).toBe(
      "O prazo dos Fundadores precisa terminar antes da abertura ao público.",
    );
  });

  it("recusa tolerância e carteira fora dos limites ou com casas decimais", () => {
    for (const toleranciaVencimentoDias of ["0", "31", "2.5", "x"]) {
      expect(mensagem(esquemaConfiguracoesGerais.safeParse({ ...atual, toleranciaVencimentoDias }))).toBe("Tolerância: de 1 a 30 dias.");
    }
    for (const percentualCarteira of ["-1", "31", "5.5"]) {
      expect(mensagem(esquemaConfiguracoesGerais.safeParse({ ...atual, percentualCarteira }))).toBe("Carteira: de 0% a 30%, sem casas decimais.");
    }
  });
});
