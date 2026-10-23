import { describe, expect, it } from "vitest";
import { esquemaCadastroAssistido, esquemaMotivo, esquemaPerfilAnunciante } from "./anunciante";

const CATEGORIA = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";
const OUTRA = "4a3c9d2f-6e5b-4f7a-8b9c-2d3e4f5a6b7c";
const mensagem = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

const base = {
  nome: "  Pizzaria   do Zé ",
  categoriaPrincipalId: CATEGORIA,
  categoriasAdicionais: [OUTRA, OUTRA],
  whatsapp: "(22) 99999-0000",
  telefone: "",
  formasPagamento: ["pix", "pix", "dinheiro"],
};
const profissional = { tipo: "profissional", ...base, atendeTodaCidade: true, bairrosAtendidos: [] };
const comercio = {
  tipo: "comercio",
  ...base,
  siteProprio: "pizzariadoze.com.br",
  endereco: { logradouro: "Rua das Flores", numero: "S/N", bairroId: OUTRA },
  fazEntrega: true,
  entregaTodaCidade: false,
  bairrosEntrega: [OUTRA],
};

describe("perfil do anunciante", () => {
  it("autônomo: limpa o nome, tira repetidos e preenche os opcionais vazios", () => {
    const r = esquemaPerfilAnunciante.parse(profissional);
    expect(r).toMatchObject({
      tipo: "profissional",
      nome: "Pizzaria do Zé",
      categoriasAdicionais: [OUTRA],
      formasPagamento: ["pix", "dinheiro"],
      whatsapp: "5522999990000",
      descricao: "",
      instagram: "",
      registroConselho: "",
    });
  });

  it("comércio: endereço com complemento vazio e site com https://", () => {
    const r = esquemaPerfilAnunciante.parse(comercio);
    expect(r).toMatchObject({ tipo: "comercio", siteProprio: "https://pizzariadoze.com.br", endereco: { complemento: "", numero: "S/N" } });
  });

  it("Instagram em qualquer formato vira só o nome do perfil", () => {
    for (const instagram of ["@pizzariadoze", "https://www.instagram.com/pizzariadoze/", "pizzariadoze"]) {
      expect(esquemaPerfilAnunciante.parse({ ...profissional, instagram }).instagram).toBe("pizzariadoze");
    }
    expect(mensagem(esquemaPerfilAnunciante.safeParse({ ...profissional, instagram: "pizza ria" }))).toBe(
      "Instagram inválido: use só o nome do perfil, como @pizzariadoze.",
    );
  });

  it("recusa tipo desconhecido, nome curto, categoria e bairro inválidos", () => {
    expect(mensagem(esquemaPerfilAnunciante.safeParse({ ...profissional, tipo: "outro" }))).toBe("Escolha se é autônomo ou comércio.");
    expect(mensagem(esquemaPerfilAnunciante.safeParse({ ...profissional, nome: " Z " }))).toBe("Informe o nome.");
    expect(mensagem(esquemaPerfilAnunciante.safeParse({ ...profissional, categoriaPrincipalId: "" }))).toBe("Escolha a categoria principal.");
    expect(mensagem(esquemaPerfilAnunciante.safeParse({ ...comercio, endereco: { ...comercio.endereco, bairroId: "x" } }))).toBe(
      "Escolha o bairro do endereço.",
    );
  });

  it("recusa textos acima do limite e forma de pagamento desconhecida", () => {
    expect(mensagem(esquemaPerfilAnunciante.safeParse({ ...profissional, nome: "a".repeat(101) }))).toBe("O nome: no máximo 100 letras.");
    expect(mensagem(esquemaPerfilAnunciante.safeParse({ ...profissional, descricao: "a".repeat(2001) }))).toBe("Descrição: no máximo 2000 letras.");
    expect(mensagem(esquemaPerfilAnunciante.safeParse({ ...profissional, formasPagamento: ["cheque"] }))).toBe("Forma de pagamento inválida.");
  });
});

describe("cadastro assistido", () => {
  const dados = { emailConvite: " ", planoEscolhidoId: CATEGORIA, periodicidade: "anual", representanteId: "" };

  it("e-mail e representante vazios são aceitos", () => {
    expect(esquemaCadastroAssistido.parse(dados)).toEqual({ emailConvite: "", planoEscolhidoId: CATEGORIA, periodicidade: "anual", representanteId: "" });
    expect(esquemaCadastroAssistido.parse({ ...dados, emailConvite: undefined, representanteId: undefined }).representanteId).toBe("");
  });

  it("aceita e-mail e representante válidos", () => {
    const r = esquemaCadastroAssistido.parse({ ...dados, emailConvite: "ze@exemplo.com.br", representanteId: OUTRA });
    expect(r.representanteId).toBe(OUTRA);
  });

  it("recusa representante, plano e periodicidade inválidos", () => {
    expect(mensagem(esquemaCadastroAssistido.safeParse({ ...dados, representanteId: "abc" }))).toBe("Representante inválido.");
    expect(mensagem(esquemaCadastroAssistido.safeParse({ ...dados, planoEscolhidoId: "" }))).toBe("Escolha o plano.");
    expect(mensagem(esquemaCadastroAssistido.safeParse({ ...dados, periodicidade: "semanal" }))).toBe("Escolha mensal ou anual.");
  });
});

describe("motivo", () => {
  it("exige pelo menos 3 letras", () => {
    expect(esquemaMotivo.parse("  Foto   imprópria ")).toBe("Foto imprópria");
    expect(mensagem(esquemaMotivo.safeParse("ok"))).toBe("Informe o motivo.");
  });
});
