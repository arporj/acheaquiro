import { describe, expect, it } from "vitest";
import {
  esquemaCodigoDuasEtapas,
  esquemaEmail,
  esquemaEntrar,
  esquemaNovaSenha,
  esquemaRecuperarSenha,
  mensagensPorCampo,
} from "./acesso";

describe("e-mail", () => {
  it("normaliza espaços e maiúsculas", () => {
    expect(esquemaEmail.parse("  Ana.Souza@Exemplo.COM ")).toBe("ana.souza@exemplo.com");
  });

  it("recusa vazio, inválido e longo demais", () => {
    expect(esquemaEmail.safeParse("").success).toBe(false);
    expect(esquemaEmail.safeParse("ana@").success).toBe(false);
    expect(esquemaEmail.safeParse(`${"a".repeat(250)}@x.com`).success).toBe(false);
  });
});

describe("entrar", () => {
  it("aceita e-mail, senha e token do Turnstile", () => {
    const r = esquemaEntrar.safeParse({ email: "ana@exemplo.com", senha: "qualquer", tokenRobo: "tok" });
    expect(r.success).toBe(true);
  });

  it("não exige senha forte para entrar (contas antigas continuam entrando)", () => {
    expect(esquemaEntrar.safeParse({ email: "ana@exemplo.com", senha: "123", tokenRobo: "tok" }).success).toBe(true);
  });

  it("aponta cada campo que falta", () => {
    const r = esquemaEntrar.safeParse({ email: "", senha: "", tokenRobo: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(mensagensPorCampo(r.error)).toEqual({
        email: "Informe o e-mail.",
        senha: "Informe a senha.",
        tokenRobo: "Confirme que você não é um robô.",
      });
    }
  });
});

describe("recuperar senha", () => {
  it("exige o token do Turnstile", () => {
    expect(esquemaRecuperarSenha.safeParse({ email: "ana@exemplo.com", tokenRobo: "" }).success).toBe(false);
    expect(esquemaRecuperarSenha.safeParse({ email: "ana@exemplo.com", tokenRobo: "tok" }).success).toBe(true);
  });
});

describe("nova senha", () => {
  it("aceita senha forte repetida igual", () => {
    expect(esquemaNovaSenha.safeParse({ senha: "Abcdefgh1!", confirmacao: "Abcdefgh1!" }).success).toBe(true);
  });

  it("lista o que falta na senha fraca", () => {
    const r = esquemaNovaSenha.safeParse({ senha: "abcdefghij", confirmacao: "abcdefghij" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(mensagensPorCampo(r.error).senha).toBe(
        "A senha precisa ter: uma letra maiúscula, um número, um símbolo, como ! @ # $ % * ou ?.",
      );
    }
  });

  it("recusa senha acima de 72 bytes", () => {
    const senha = `Ab1!${"a".repeat(69)}`;
    const r = esquemaNovaSenha.safeParse({ senha, confirmacao: senha });
    expect(r.success).toBe(false);
    if (!r.success) expect(mensagensPorCampo(r.error).senha).toBe("A senha pode ter no máximo 72 caracteres.");
  });

  it("recusa confirmação diferente", () => {
    const r = esquemaNovaSenha.safeParse({ senha: "Abcdefgh1!", confirmacao: "Abcdefgh1?" });
    expect(r.success).toBe(false);
    if (!r.success) expect(mensagensPorCampo(r.error)).toEqual({ confirmacao: "As duas senhas não são iguais." });
  });
});

describe("código de duas etapas", () => {
  it("aceita 6 números, com espaços em volta", () => {
    expect(esquemaCodigoDuasEtapas.parse({ codigo: " 123456 " }).codigo).toBe("123456");
  });

  it("recusa letras e tamanho errado", () => {
    expect(esquemaCodigoDuasEtapas.safeParse({ codigo: "12345" }).success).toBe(false);
    expect(esquemaCodigoDuasEtapas.safeParse({ codigo: "12345a" }).success).toBe(false);
  });
});

describe("mensagens por campo", () => {
  it("usa 'formulario' para erro sem campo", () => {
    const r = esquemaEmail.safeParse("");
    expect(r.success).toBe(false);
    if (!r.success) expect(mensagensPorCampo(r.error)).toEqual({ formulario: "Informe o e-mail." });
  });
});
