import { describe, expect, it } from "vitest";
import { esquemaCriarConta } from "./acesso";

const valido = { nome: "  Ana   Souza ", email: " Ana@Exemplo.com ", senha: "Senha#Forte1", confirmacao: "Senha#Forte1", tokenRobo: "token" };
const mensagens = (r: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));

describe("esquemaCriarConta", () => {
  it("limpa o nome e o e-mail", () => {
    expect(esquemaCriarConta.parse(valido)).toMatchObject({ nome: "Ana Souza", email: "ana@exemplo.com" });
  });

  it("exige senha forte e igual nas duas vezes", () => {
    expect(mensagens(esquemaCriarConta.safeParse({ ...valido, senha: "fraca", confirmacao: "fraca" })).senha).toMatch(/^A senha precisa ter/);
    expect(mensagens(esquemaCriarConta.safeParse({ ...valido, confirmacao: "Senha#Forte2" })).confirmacao).toBe("As duas senhas não são iguais.");
  });

  it("pede nome, e-mail válido e o Turnstile", () => {
    const r = mensagens(esquemaCriarConta.safeParse({ ...valido, nome: " ", email: "sem-arroba", tokenRobo: "" }));
    expect(r).toMatchObject({ nome: "Informe o seu nome.", email: "E-mail inválido.", tokenRobo: "Confirme que você não é um robô." });
  });
});
