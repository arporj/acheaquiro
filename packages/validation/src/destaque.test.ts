import { describe, expect, it } from "vitest";
import { esquemaDestaque, linkDoDestaque } from "./destaque";

const valido = {
  tipo: "campanha",
  eventoId: "",
  titulo: "  Arrecadação   de ração ",
  texto: "Leve ração ou alimento  não perecível.",
  link: "https://exemplo.com.br/campanha",
  comercio: "",
  autorizadoPor: "",
  autorizadoEm: "",
  inicio: "2026-11-25",
  fim: "2026-12-05",
  ordem: "2",
  ligado: "sim",
};

const erros = (dados: Record<string, unknown>) => {
  const r = esquemaDestaque.safeParse(dados);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("esquemaDestaque", () => {
  it("aceita a campanha e limpa os espaços", () => {
    const r = esquemaDestaque.parse(valido);
    expect(r.titulo).toBe("Arrecadação de ração");
    expect(r.texto).toBe("Leve ração ou alimento não perecível.");
    expect(r.ordem).toBe(2);
    expect(r.ligado).toBe(true);
  });

  it("desligado vira false", () => {
    expect(esquemaDestaque.parse({ ...valido, ligado: "nao" }).ligado).toBe(false);
  });

  it("evento exige o evento e dispensa o link", () => {
    expect(erros({ ...valido, tipo: "evento", link: "" })).toContain("Escolha o evento da Agenda.");
    const r = esquemaDestaque.parse({ ...valido, tipo: "evento", link: "", eventoId: "8d0c2c1e-6c2d-4c1a-9a51-1f0a8f2d9b11" });
    expect(r.link).toBe("");
  });

  it("campanha e divulgação do Ache Aqui exigem o link", () => {
    expect(erros({ ...valido, link: "" })).toContain("Informe o link do destaque.");
    expect(erros({ ...valido, tipo: "ache_aqui", link: "" })).toContain("Informe o link do destaque.");
  });

  it("comércio citado exige quem autorizou e o dia (J4)", () => {
    expect(erros({ ...valido, comercio: "Jack's House" })).toContain("Comércio citado: informe quem autorizou a divulgação e em que dia.");
    expect(erros({ ...valido, comercio: "Jack's House", autorizadoPor: "Jack" })).toContain(
      "Comércio citado: informe quem autorizou a divulgação e em que dia.",
    );
    expect(erros({ ...valido, comercio: "Jack's House", autorizadoPor: "Jack", autorizadoEm: "2026-11-24" })).toEqual([]);
    expect(erros({ ...valido, comercio: "Jack's House", autorizadoPor: "Jack", autorizadoEm: "24/11/2026" })).toContain("Data da autorização inválida.");
  });

  it("recusa datas trocadas e título curto ou longo", () => {
    expect(erros({ ...valido, fim: "2026-11-24" })).toContain("O último dia não pode vir antes do primeiro.");
    expect(erros({ ...valido, titulo: "Oi" })).toContain("O título: pelo menos 3 letras.");
    expect(erros({ ...valido, titulo: "x".repeat(61) })).toContain("O título: no máximo 60 letras.");
    expect(erros({ ...valido, texto: "x".repeat(141) })).toContain("Texto: no máximo 140 letras.");
    expect(erros({ ...valido, comercio: "J" })).toContain("Comércio citado: pelo menos 2 letras.");
  });

  it("recusa ordem fora da faixa e tipo desconhecido", () => {
    expect(erros({ ...valido, ordem: "-1" })).toContain("Ordem inválida.");
    expect(erros({ ...valido, ordem: "1000" })).toContain("Ordem: no máximo 999.");
    expect(erros({ ...valido, ordem: "1.5" })).toContain("Ordem inválida.");
    expect(erros({ ...valido, tipo: "anunciante" })).toContain("Escolha o tipo do destaque.");
  });
});

describe("linkDoDestaque", () => {
  const aceita = (v: string) => linkDoDestaque.safeParse(v).success;

  it("aceita página do site e endereço com https", () => {
    expect(aceita("/agenda")).toBe(true);
    expect(aceita("/agenda/festa-junina?dia=2")).toBe(true);
    expect(aceita("https://riodasostras.rj.gov.br/campanha")).toBe(true);
    expect(aceita("")).toBe(true);
  });

  it("recusa http, endereço sem domínio, // e espaços", () => {
    expect(aceita("http://site.com.br")).toBe(false);
    expect(aceita("https://localhost")).toBe(false);
    expect(aceita("//site.com.br")).toBe(false);
    expect(aceita("/agenda com espaço")).toBe(false);
    expect(aceita("javascript:alert(1)")).toBe(false);
    expect(aceita(`https://site.com.br/${"a".repeat(300)}`)).toBe(false);
  });
});
