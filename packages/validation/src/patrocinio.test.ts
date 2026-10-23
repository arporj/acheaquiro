import { describe, expect, it } from "vitest";
import { esquemaCotaPatrocinio, esquemaPatrocinio, esquemaSite, esquemaWhatsapp } from "./patrocinio";

const CATEGORIA = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";
const mensagem = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe("WhatsApp", () => {
  it("aceita qualquer formato e devolve 55 + DDD + número", () => {
    expect(esquemaWhatsapp.parse("(22) 99999-0000")).toBe("5522999990000");
    expect(esquemaWhatsapp.parse("+55 22 99999-0000")).toBe("5522999990000");
    expect(esquemaWhatsapp.parse("22 2764-0000")).toBe("552227640000");
  });

  it("vazio fica sem contato", () => {
    expect(esquemaWhatsapp.parse("")).toBe("");
  });

  it("recusa número sem DDD", () => {
    expect(esquemaWhatsapp.safeParse("99999-0000").success).toBe(false);
  });
});

describe("site", () => {
  it("acrescenta https:// e troca http:// por https://", () => {
    expect(esquemaSite.parse("empresa.com.br")).toBe("https://empresa.com.br");
    expect(esquemaSite.parse("http://empresa.com.br")).toBe("https://empresa.com.br");
    expect(esquemaSite.parse(" https://empresa.com.br ")).toBe("https://empresa.com.br");
  });

  it("vazio ou ausente fica sem site", () => {
    expect(esquemaSite.parse("")).toBe("");
    expect(esquemaSite.parse(undefined)).toBe("");
  });

  it("recusa endereço com espaço", () => {
    expect(esquemaSite.safeParse("minha empresa").success).toBe(false);
  });
});

describe("cadastro do patrocínio", () => {
  const dados = { cota: "ouro", nome: "  Banco   do Mar ", ramo: "Banco", frase: " Perto de você ", whatsapp: "", site: "", grupo: "Saúde", categoriaId: CATEGORIA };

  it("limpa os textos e deixa sem contato, grupo e categoria fora da cota deles", () => {
    expect(esquemaPatrocinio.parse(dados)).toEqual({
      cota: "ouro",
      nome: "Banco do Mar",
      ramo: "Banco",
      frase: "Perto de você",
      whatsapp: null,
      site: null,
      grupo: null,
      categoriaId: null,
    });
  });

  it("guarda o grupo na cota de grupo e a categoria na cota de categoria", () => {
    expect(esquemaPatrocinio.parse({ ...dados, cota: "grupo" }).grupo).toBe("Saúde");
    expect(esquemaPatrocinio.parse({ ...dados, cota: "categoria" }).categoriaId).toBe(CATEGORIA);
  });

  it("guarda WhatsApp e site informados", () => {
    const r = esquemaPatrocinio.parse({ ...dados, whatsapp: "(22) 99999-0000", site: "banco.com.br" });
    expect(r.whatsapp).toBe("5522999990000");
    expect(r.site).toBe("https://banco.com.br");
  });

  it("exige o grupo na cota de grupo e a categoria na cota de categoria", () => {
    expect(mensagem(esquemaPatrocinio.safeParse({ ...dados, cota: "grupo", grupo: " " }))).toBe("Escolha o grupo de categorias.");
    expect(mensagem(esquemaPatrocinio.safeParse({ ...dados, cota: "categoria", categoriaId: "" }))).toBe("Escolha a categoria.");
  });

  it("recusa cota desconhecida, nome curto e frase longa", () => {
    expect(mensagem(esquemaPatrocinio.safeParse({ ...dados, cota: "diamante" }))).toBe("Escolha a cota.");
    expect(mensagem(esquemaPatrocinio.safeParse({ ...dados, nome: "B" }))).toBe("O nome da empresa: pelo menos 2 letras.");
    expect(mensagem(esquemaPatrocinio.safeParse({ ...dados, frase: "a".repeat(141) }))).toBe("Frase: no máximo 140 letras.");
  });
});

describe("cota de patrocínio", () => {
  const dados = { nome: "Ouro", beneficios: " Logo no rodapé \n\n Post no Instagram ", valorCentavos: "1.200,50", valorFundadorCentavos: "600", vagas: "3", larguraLogo: "600", alturaLogo: "200" };

  it("converte reais em centavos, benefícios em lista e vagas em número", () => {
    expect(esquemaCotaPatrocinio.parse(dados)).toEqual({
      nome: "Ouro",
      beneficios: ["Logo no rodapé", "Post no Instagram"],
      valorCentavos: 120050,
      valorFundadorCentavos: 60000,
      vagas: 3,
      larguraLogo: 600,
      alturaLogo: 200,
    });
  });

  it("vagas em branco ficam sem número (grupo e categoria)", () => {
    expect(esquemaCotaPatrocinio.parse({ ...dados, vagas: " " }).vagas).toBeNull();
  });

  it("recusa valor de Fundador acima do valor cheio", () => {
    expect(mensagem(esquemaCotaPatrocinio.safeParse({ ...dados, valorFundadorCentavos: "2000" }))).toBe("O valor de Fundador não pode passar do valor cheio.");
  });

  it("recusa valor zero, vagas fora do limite, logo pequeno e benefícios demais", () => {
    expect(mensagem(esquemaCotaPatrocinio.safeParse({ ...dados, valorCentavos: "0" }))).toBe("Valor: maior que zero.");
    expect(mensagem(esquemaCotaPatrocinio.safeParse({ ...dados, vagas: "0" }))).toBe("Vagas: pelo menos 1.");
    expect(mensagem(esquemaCotaPatrocinio.safeParse({ ...dados, larguraLogo: "50" }))).toBe("Largura do logo: de 100 a 2000 pixels.");
    expect(mensagem(esquemaCotaPatrocinio.safeParse({ ...dados, beneficios: Array(11).fill("x").join("\n") }))).toBe("No máximo 10 benefícios.");
  });
});
