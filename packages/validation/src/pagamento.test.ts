import { describe, expect, it } from "vitest";
import {
  esquemaDevolucao,
  esquemaEscolhaPagamento,
  esquemaPagamento,
  esquemaPagamentoEvento,
  esquemaPagamentoExtra,
  esquemaPagamentoRepresentante,
} from "./pagamento";

const escolha = { planoId: "0b8f3a3e-4c1d-4d55-9a3e-2f6c1b7d9e01", periodicidade: "anual", pagoEm: "2026-11-10" };
const pix = { ...escolha, forma: "pix", parcelas: "1", codigoAutorizacao: "", observacao: "" };
const mensagem = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? "" : r.error!.issues[0]!.message);

describe("esquemaEscolhaPagamento", () => {
  it("aceita plano, periodicidade e dia", () => {
    expect(esquemaEscolhaPagamento.parse(escolha)).toEqual(escolha);
  });

  it("recusa plano, periodicidade ou dia inválidos", () => {
    expect(mensagem(esquemaEscolhaPagamento.safeParse({ ...escolha, planoId: "x" }))).toBe("Escolha o plano.");
    expect(mensagem(esquemaEscolhaPagamento.safeParse({ ...escolha, periodicidade: "semanal" }))).toBe("Escolha mensal ou anual.");
    expect(mensagem(esquemaEscolhaPagamento.safeParse({ ...escolha, pagoEm: "10/11/2026" }))).toBe("Informe o dia do pagamento.");
  });
});

describe("esquemaPagamento", () => {
  it("Pix: uma parcela e sem código", () => {
    expect(esquemaPagamento.parse({ ...pix, observacao: "  comprovante   pelo WhatsApp " })).toEqual({
      ...escolha,
      forma: "pix",
      parcelas: 1,
      codigoAutorizacao: "",
      observacao: "comprovante pelo WhatsApp",
    });
  });

  it("crédito parcelado com o código em maiúsculas, sem espaços", () => {
    const r = esquemaPagamento.parse({ ...pix, forma: "credito", parcelas: "3", codigoAutorizacao: " ab 12cd " });
    expect(r).toMatchObject({ forma: "credito", parcelas: 3, codigoAutorizacao: "AB12CD" });
  });

  it("aceita campos opcionais ausentes", () => {
    expect(esquemaPagamento.parse({ ...escolha, forma: "pix", parcelas: 1 })).toMatchObject({ codigoAutorizacao: "", observacao: "" });
  });

  it("cartão exige o código de autorização", () => {
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, forma: "debito" }))).toMatch(/código de autorização/);
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, forma: "debito", codigoAutorizacao: "AB1" }))).toMatch(/código de autorização/);
  });

  it("Pix não tem código nem parcelas; débito não parcela", () => {
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, codigoAutorizacao: "AB1234" }))).toBe("O Pix não tem código de autorização.");
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, parcelas: "2" }))).toBe("Só o crédito pode ser parcelado.");
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, forma: "debito", parcelas: "2", codigoAutorizacao: "AB1234" }))).toBe(
      "Só o crédito pode ser parcelado.",
    );
  });

  it("recusa forma, parcelas e textos inválidos", () => {
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, forma: "boleto" }))).toBe("Escolha a forma de pagamento.");
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, forma: "credito", parcelas: "13", codigoAutorizacao: "AB1234" }))).toBe(
      "No máximo 12 parcelas.",
    );
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, parcelas: "0" }))).toBe("Parcelas inválidas.");
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, parcelas: "1.5" }))).toBe("Parcelas inválidas.");
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, observacao: "x".repeat(301) }))).toBe("Observação: no máximo 300 letras.");
    expect(mensagem(esquemaPagamento.safeParse({ ...pix, forma: "credito", codigoAutorizacao: "A".repeat(21) }))).toBe(
      "Código de autorização: no máximo 20 letras e números.",
    );
  });
});

describe("esquemaDevolucao", () => {
  it("exige o motivo, de 3 a 300 letras", () => {
    expect(esquemaDevolucao.parse({ motivo: "  Desistiu   em 2 dias " })).toEqual({ motivo: "Desistiu em 2 dias" });
    expect(mensagem(esquemaDevolucao.safeParse({ motivo: " " }))).toBe("Informe o motivo da devolução.");
    expect(mensagem(esquemaDevolucao.safeParse({}))).toBe("Informe o motivo da devolução.");
    expect(mensagem(esquemaDevolucao.safeParse({ motivo: "x".repeat(301) }))).toBe("Motivo: no máximo 300 letras.");
  });
});

describe("esquemaPagamentoRepresentante", () => {
  it("exige o dia e limpa a observação", () => {
    expect(esquemaPagamentoRepresentante.parse({ pagoEm: "2026-11-20", observacao: "  Pix   enviado " })).toEqual({ pagoEm: "2026-11-20", observacao: "Pix enviado" });
    expect(mensagem(esquemaPagamentoRepresentante.safeParse({ pagoEm: "" }))).toBe("Informe o dia do Pix ao representante.");
  });
});

describe("esquemaPagamentoExtra", () => {
  const extra = {
    extraId: "0b8f3a3e-4c1d-4d55-9a3e-2f6c1b7d9e02",
    periodicidade: "mensal",
    pagoEm: "2026-11-18",
    representanteId: "",
    descontoCentavos: "",
    forma: "pix",
    parcelas: "1",
    codigoAutorizacao: "",
    observacao: "",
  };

  it("sem representante e sem desconto", () => {
    expect(esquemaPagamentoExtra.parse(extra)).toMatchObject({ representanteId: "", descontoCentavos: 0, parcelas: 1 });
  });

  it("desconto em reais vira centavos", () => {
    expect(esquemaPagamentoExtra.parse({ ...extra, representanteId: "0b8f3a3e-4c1d-4d55-9a3e-2f6c1b7d9e03", descontoCentavos: "3,00" }).descontoCentavos).toBe(300);
  });

  it("recusa extra, representante e desconto inválidos, e confere o cartão", () => {
    expect(mensagem(esquemaPagamentoExtra.safeParse({ ...extra, extraId: "x" }))).toBe("Escolha o extra.");
    expect(mensagem(esquemaPagamentoExtra.safeParse({ ...extra, representanteId: "x" }))).toBe("Escolha um representante da lista.");
    expect(mensagem(esquemaPagamentoExtra.safeParse({ ...extra, descontoCentavos: "abc" }))).toBe("Desconto do representante: valor inválido.");
    expect(mensagem(esquemaPagamentoExtra.safeParse({ ...extra, forma: "debito" }))).toMatch(/código de autorização/);
  });
});

describe("esquemaPagamentoEvento", () => {
  const evento = { dataFim: "2026-11-29", pagoEm: "2026-11-18", representanteId: "", descontoCentavos: "", forma: "credito", parcelas: "2", codigoAutorizacao: "ab 12cd", observacao: "" };

  it("aceita o último dia e o cartão parcelado", () => {
    expect(esquemaPagamentoEvento.parse(evento)).toMatchObject({ dataFim: "2026-11-29", parcelas: 2, codigoAutorizacao: "AB12CD", descontoCentavos: 0 });
  });

  it("recusa último dia inválido", () => {
    expect(mensagem(esquemaPagamentoEvento.safeParse({ ...evento, dataFim: "29/11" }))).toBe("Informe o último dia do evento.");
  });
});
