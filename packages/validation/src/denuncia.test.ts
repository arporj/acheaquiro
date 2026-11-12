import { describe, expect, it } from "vitest";
import { MOTIVOS_DENUNCIA, ROTULOS_MOTIVO_DENUNCIA, esquemaDenuncia } from "./denuncia";

const PERFIL = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";
const mensagem = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe("denúncia de perfil", () => {
  it("aceita um motivo da lista sem descrição", () => {
    expect(esquemaDenuncia.parse({ anuncianteId: PERFIL, motivo: "telefone_errado" })).toEqual({
      anuncianteId: PERFIL,
      motivo: "telefone_errado",
      descricao: "",
    });
  });

  it("limpa espaços repetidos e nas pontas da descrição", () => {
    const r = esquemaDenuncia.parse({ anuncianteId: PERFIL, motivo: "informacao_falsa", descricao: "  o endereço   está errado \n" });
    expect(r.descricao).toBe("o endereço está errado");
  });

  it("no outro motivo, exige pelo menos 10 letras", () => {
    expect(mensagem(esquemaDenuncia.safeParse({ anuncianteId: PERFIL, motivo: "outro", descricao: "  curto   " }))).toBe(
      "Conte o que aconteceu, com pelo menos 10 letras.",
    );
    expect(esquemaDenuncia.safeParse({ anuncianteId: PERFIL, motivo: "outro", descricao: "Perfil de golpe" }).success).toBe(true);
  });

  it("recusa descrição longa, motivo desconhecido e perfil inválido", () => {
    expect(mensagem(esquemaDenuncia.safeParse({ anuncianteId: PERFIL, motivo: "outro", descricao: "a".repeat(501) }))).toBe(
      "Descrição: no máximo 500 letras.",
    );
    expect(mensagem(esquemaDenuncia.safeParse({ anuncianteId: PERFIL, motivo: "conteudo_improprio" }))).toBe("Escolha o motivo da denúncia.");
    expect(mensagem(esquemaDenuncia.safeParse({ anuncianteId: "123", motivo: "outro", descricao: "Perfil de golpe" }))).toBe("Perfil inválido.");
  });

  it("todo motivo tem um texto para a tela e o e-mail", () => {
    for (const motivo of MOTIVOS_DENUNCIA) expect(ROTULOS_MOTIVO_DENUNCIA[motivo].length).toBeGreaterThan(0);
    expect(Object.keys(ROTULOS_MOTIVO_DENUNCIA)).toHaveLength(MOTIVOS_DENUNCIA.length);
  });
});
