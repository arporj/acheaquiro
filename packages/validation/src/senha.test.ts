import { describe, expect, it } from "vitest";
import { REQUISITOS_SENHA, requisitosFaltando, senhaForte, SIMBOLOS_SENHA } from "./senha";

const ids = (senha: string) => requisitosFaltando(senha).map((r) => r.id);

describe("senha forte (item 4.14)", () => {
  it("aceita senha com 10 caracteres, maiúscula, minúscula, número e símbolo", () => {
    expect(senhaForte("Abcdefgh1!")).toBe(true);
    expect(ids("Abcdefgh1!")).toEqual([]);
  });

  it("recusa senha com 9 caracteres", () => {
    expect(ids("Abcdefg1!")).toEqual(["tamanho"]);
  });

  it("aponta cada requisito que falta, na ordem da lista", () => {
    expect(ids("")).toEqual(["tamanho", "maiuscula", "minuscula", "numero", "simbolo"]);
    expect(ids("abcdefghij")).toEqual(["maiuscula", "numero", "simbolo"]);
    expect(ids("ABCDEFGHIJ1!")).toEqual(["minuscula"]);
    expect(ids("Abcdefghij!")).toEqual(["numero"]);
    expect(ids("Abcdefghij1")).toEqual(["simbolo"]);
  });

  it("aceita cada símbolo da lista do Supabase Auth", () => {
    for (const simbolo of SIMBOLOS_SENHA) {
      expect(senhaForte(`Abcdefgh1${simbolo}`)).toBe(true);
    }
  });

  it("não conta como símbolo caracteres fora da lista do Supabase Auth", () => {
    expect(ids("Abcdefgh1ç")).toEqual(["simbolo"]);
    expect(ids("Abcdefgh1 €")).toEqual(["simbolo"]);
  });

  it("conta letras acentuadas como caracteres, mas não como maiúscula ou minúscula", () => {
    expect(ids("ÁÉÍÓÚáéíóú1!")).toEqual(["maiuscula", "minuscula"]);
  });

  it("recusa senha acima de 72 bytes, o limite do Supabase Auth", () => {
    expect(senhaForte(`Ab1!${"a".repeat(68)}`)).toBe(true);
    expect(senhaForte(`Ab1!${"a".repeat(69)}`)).toBe(false);
  });

  it("tem uma descrição para cada requisito", () => {
    expect(REQUISITOS_SENHA.map((r) => r.descricao.length > 0)).toEqual([true, true, true, true, true]);
  });
});
