import { describe, expect, it } from "vitest";
import { esquemaAtendimento, esquemaChavePix, normalizarChavePix } from "./representante";

const ANUNCIANTE = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";
const mensagem = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe("chave Pix do representante", () => {
  it("e-mail e chave aleatória ficam em minúsculas", () => {
    expect(normalizarChavePix(" Joao@Exemplo.com.br ")).toEqual({ tipo: "email", chave: "joao@exemplo.com.br" });
    expect(normalizarChavePix("3F2B8C1E-5D4A-4E6F-9A7B-1C2D3E4F5A6B")).toEqual({ tipo: "aleatoria", chave: ANUNCIANTE });
  });

  it("recusa e-mail com mais de 77 letras", () => {
    expect(normalizarChavePix(`${"a".repeat(66)}@exemplo.com`)).toBeNull();
  });

  it("celular fica com +55 e só números", () => {
    expect(normalizarChavePix("+55 (22) 99999-0000")).toEqual({ tipo: "telefone", chave: "+5522999990000" });
    expect(normalizarChavePix("+55 22 3333-0000")).toEqual({ tipo: "telefone", chave: "+552233330000" });
  });

  it("recusa celular sem DDD, de outro país ou com letras", () => {
    expect(normalizarChavePix("+55 99999-0000")).toBeNull();
    expect(normalizarChavePix("+1 202 555 0100")).toBeNull();
    expect(normalizarChavePix("+55 22 9999a-0000")).toBeNull();
  });

  it("CPF e CNPJ ficam só com números", () => {
    expect(normalizarChavePix("123.456.789-09")).toEqual({ tipo: "cpf", chave: "12345678909" });
    expect(normalizarChavePix("12.345.678/0001-95")).toEqual({ tipo: "cnpj", chave: "12345678000195" });
  });

  it("recusa número que não é CPF nem CNPJ e texto que não é chave", () => {
    expect(normalizarChavePix("123456789012")).toBeNull();
    expect(normalizarChavePix("minha chave")).toBeNull();
  });

  it("o esquema devolve o tipo e a chave, ou a mensagem de chave inválida", () => {
    expect(esquemaChavePix.parse("123.456.789-09")).toEqual({ tipo: "cpf", chave: "12345678909" });
    expect(mensagem(esquemaChavePix.safeParse("minha chave"))).toBe(
      "Chave Pix inválida. Use o CPF, o CNPJ, o e-mail, o celular com +55 e DDD ou a chave aleatória.",
    );
    expect(mensagem(esquemaChavePix.safeParse(undefined))).toBe("Informe a chave Pix.");
  });
});

describe("registro do histórico de atendimento", () => {
  const atendimento = { anuncianteId: ANUNCIANTE, dia: "2026-10-24" };

  it("limpa os espaços da observação e deixa vazia quando não vem", () => {
    expect(esquemaAtendimento.parse({ ...atendimento, observacao: "  Pediu   retorno\n amanhã " }).observacao).toBe(
      "Pediu retorno amanhã",
    );
    expect(esquemaAtendimento.parse(atendimento).observacao).toBe("");
  });

  it("observação com no máximo 300 letras", () => {
    expect(esquemaAtendimento.safeParse({ ...atendimento, observacao: "a".repeat(300) }).success).toBe(true);
    expect(mensagem(esquemaAtendimento.safeParse({ ...atendimento, observacao: "a".repeat(301) }))).toBe(
      "Resultado do contato: no máximo 300 letras.",
    );
  });

  it("exige anunciante e dia válidos", () => {
    expect(mensagem(esquemaAtendimento.safeParse({ ...atendimento, anuncianteId: "123" }))).toBe("Anunciante inválido.");
    expect(mensagem(esquemaAtendimento.safeParse({ ...atendimento, dia: "24/10/2026" }))).toBe("Informe o dia do contato.");
  });
});
