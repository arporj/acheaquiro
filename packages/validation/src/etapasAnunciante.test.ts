import { describe, expect, it } from "vitest";
import { esquemaEtapaContato, esquemaEtapaOnde, esquemaEtapaSobre } from "./anunciante";

const CATEGORIA = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";
const BAIRRO = "4a3c9d2f-6e5b-4f7a-8b9c-2d3e4f5a6b7c";

describe("esquemaEtapaSobre", () => {
  it("aceita tipo, nome e categoria, limpando os espaços do nome", () => {
    const r = esquemaEtapaSobre.parse({ tipo: "comercio", nome: "  Bar   do Zé ", categoriaPrincipalId: CATEGORIA, categoriasAdicionais: [], descricao: "" });
    expect(r).toMatchObject({ tipo: "comercio", nome: "Bar do Zé", categoriaPrincipalId: CATEGORIA });
  });

  it("pede o tipo e a categoria", () => {
    expect(esquemaEtapaSobre.safeParse({ tipo: "", nome: "Bar", categoriaPrincipalId: CATEGORIA, categoriasAdicionais: [] }).error?.issues[0]?.message).toBe(
      "Escolha se é autônomo ou comércio.",
    );
    expect(esquemaEtapaSobre.safeParse({ tipo: "profissional", nome: "Ana", categoriaPrincipalId: "", categoriasAdicionais: [] }).success).toBe(false);
  });
});

describe("esquemaEtapaContato", () => {
  it("autônomo tem registro no conselho; comércio, site", () => {
    const prof = esquemaEtapaContato.profissional.parse({ whatsapp: "(22) 99999-0000", telefone: "", formasPagamento: ["pix", "pix"], registroConselho: "CRECI 1" });
    expect(prof).toMatchObject({ registroConselho: "CRECI 1", formasPagamento: ["pix"] });
    const com = esquemaEtapaContato.comercio.parse({ whatsapp: "", telefone: "", formasPagamento: [], siteProprio: "bar.com.br" });
    expect(com.siteProprio).toBe("https://bar.com.br");
  });

  it("recusa forma de pagamento desconhecida", () => {
    expect(esquemaEtapaContato.comercio.safeParse({ whatsapp: "", telefone: "", formasPagamento: ["cheque"], siteProprio: "" }).success).toBe(false);
  });
});

describe("esquemaEtapaOnde", () => {
  it("autônomo: cidade toda ou bairros", () => {
    expect(esquemaEtapaOnde.profissional.parse({ atendeTodaCidade: false, bairrosAtendidos: [BAIRRO, BAIRRO] }).bairrosAtendidos).toEqual([BAIRRO]);
  });

  it("comércio: endereço obrigatório", () => {
    const sem = esquemaEtapaOnde.comercio.safeParse({
      endereco: { logradouro: "", numero: "", complemento: "", bairroId: "" },
      fazEntrega: false,
      entregaTodaCidade: false,
      bairrosEntrega: [],
    });
    expect(sem.success).toBe(false);
    const com = esquemaEtapaOnde.comercio.parse({
      endereco: { logradouro: "Rua A", numero: "10", complemento: "", bairroId: BAIRRO },
      fazEntrega: true,
      entregaTodaCidade: true,
      bairrosEntrega: [],
    });
    expect(com.endereco.logradouro).toBe("Rua A");
  });
});
