import { describe, expect, it } from "vitest";
import { esquemaPedidoPerfil } from "./pedidoPerfil";

const PERFIL = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";
const mensagem = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;
const assumir = { tipo: "assumir", anuncianteId: PERFIL, nome: " Maria  da Silva ", email: "maria@exemplo.com.br", telefone: "+55 (22) 99999-0000", declaracao: true };

describe("pedidos sobre o perfil importado", () => {
  it("assumir: limpa o nome e deixa o telefone só com DDD e número", () => {
    const r = esquemaPedidoPerfil.parse(assumir);
    expect(r).toMatchObject({ tipo: "assumir", nome: "Maria da Silva", telefone: "22999990000", mensagem: "" });
  });

  it("remover pede os mesmos dados de assumir", () => {
    expect(esquemaPedidoPerfil.safeParse({ ...assumir, tipo: "remover" }).success).toBe(true);
  });

  it("informar que fechou não pede dados de quem avisa", () => {
    expect(esquemaPedidoPerfil.parse({ tipo: "fechou", anuncianteId: PERFIL, mensagem: " Fechou em setembro " })).toEqual({
      tipo: "fechou",
      anuncianteId: PERFIL,
      mensagem: "Fechou em setembro",
    });
  });

  it("exige a declaração de responsável, telefone com DDD e perfil válido", () => {
    expect(mensagem(esquemaPedidoPerfil.safeParse({ ...assumir, declaracao: false }))).toBe("Confirme que você é o responsável por este comércio.");
    expect(mensagem(esquemaPedidoPerfil.safeParse({ ...assumir, telefone: "99999-0000" }))).toBe("Telefone inválido: use DDD e número, como (22) 99999-0000.");
    expect(mensagem(esquemaPedidoPerfil.safeParse({ ...assumir, anuncianteId: "123" }))).toBe("Perfil inválido.");
  });

  it("recusa nome curto, mensagem longa e tipo desconhecido", () => {
    expect(mensagem(esquemaPedidoPerfil.safeParse({ ...assumir, nome: "M" }))).toBe("Informe o seu nome.");
    expect(mensagem(esquemaPedidoPerfil.safeParse({ ...assumir, mensagem: "a".repeat(1001) }))).toBe("Mensagem: no máximo 1.000 letras.");
    expect(mensagem(esquemaPedidoPerfil.safeParse({ ...assumir, tipo: "outro" }))).toBe("Escolha o tipo do pedido.");
  });
});
