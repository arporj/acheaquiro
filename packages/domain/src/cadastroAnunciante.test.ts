import { describe, expect, it } from "vitest";
import {
  PARTES_DO_CADASTRO,
  parteAnterior,
  podeEnviarCadastro,
  proximaParte,
  situacaoDoCadastro,
  textoDoQueFalta,
  type ResumoDoCadastro,
} from "./cadastroAnunciante";

const completo: ResumoDoCadastro = {
  tipo: "comercio",
  nome: "Bar do Zé",
  temCategoriaPrincipal: true,
  temDescricao: true,
  temWhatsapp: true,
  temTelefone: false,
  temEndereco: true,
  atendeTodaCidade: false,
  bairrosAtendidos: 0,
  diasComHorario: 6,
  temPlano: true,
  temFotoPerfil: true,
  temFotoCapa: true,
};
const da = (r: ResumoDoCadastro, parte: string) => situacaoDoCadastro(r).find((s) => s.parte === parte)!;

describe("situacaoDoCadastro", () => {
  it("cadastro completo: nada falta e pode enviar", () => {
    const s = situacaoDoCadastro(completo);
    expect(s.map((x) => x.parte)).toEqual(PARTES_DO_CADASTRO);
    expect(s.every((x) => x.obrigatorio.length === 0 && x.recomendado.length === 0)).toBe(true);
    expect(podeEnviarCadastro(s)).toBe(true);
  });

  it("sem nome, categoria, contato, endereço e plano: não pode enviar", () => {
    const r = { ...completo, nome: " ", temCategoriaPrincipal: false, temWhatsapp: false, temEndereco: false, temPlano: false };
    expect(da(r, "sobre").obrigatorio).toEqual(["o nome", "a categoria principal"]);
    expect(da(r, "contato").obrigatorio).toEqual(["o WhatsApp ou o telefone"]);
    expect(da(r, "onde").obrigatorio).toEqual(["o endereço"]);
    expect(da(r, "plano").obrigatorio).toEqual(["o plano"]);
    expect(podeEnviarCadastro(situacaoDoCadastro(r))).toBe(false);
  });

  it("só o telefone basta, mas o WhatsApp fica recomendado", () => {
    const c = da({ ...completo, temWhatsapp: false, temTelefone: true }, "contato");
    expect(c.obrigatorio).toEqual([]);
    expect(c.recomendado).toEqual(["o WhatsApp, que é o contato mais usado"]);
  });

  it("autônomo: cidade toda ou ao menos um bairro", () => {
    const prof = { ...completo, tipo: "profissional" as const, temEndereco: false };
    expect(da(prof, "onde").obrigatorio).toEqual(["os bairros em que atende (ou a cidade toda)"]);
    expect(da({ ...prof, bairrosAtendidos: 2 }, "onde").obrigatorio).toEqual([]);
    expect(da({ ...prof, atendeTodaCidade: true }, "onde").obrigatorio).toEqual([]);
    expect(da({ ...prof, diasComHorario: 0 }, "horario").recomendado).toEqual(["o horário de atendimento"]);
  });

  it("horário, descrição e fotos são só recomendados", () => {
    const r = { ...completo, temDescricao: false, diasComHorario: 0, temFotoPerfil: false, temFotoCapa: false };
    expect(da(r, "sobre").recomendado).toEqual(["uma descrição do que você faz"]);
    expect(da(r, "horario").recomendado).toEqual(["o horário de funcionamento"]);
    expect(da(r, "fotos").recomendado).toEqual(["a foto de perfil", "a foto de capa"]);
    expect(podeEnviarCadastro(situacaoDoCadastro(r))).toBe(true);
  });
});

describe("ordem das etapas", () => {
  it("próxima e anterior", () => {
    expect(proximaParte("sobre")).toBe("contato");
    expect(proximaParte("fotos")).toBeNull();
    expect(parteAnterior("contato")).toBe("sobre");
    expect(parteAnterior("sobre")).toBeNull();
  });
});

describe("textoDoQueFalta", () => {
  it("junta os itens numa frase", () => {
    expect(textoDoQueFalta([])).toBe("");
    expect(textoDoQueFalta(["o nome"])).toBe("Falta o nome.");
    expect(textoDoQueFalta(["o nome", "a categoria principal", "o plano"])).toBe("Falta o nome, a categoria principal e o plano.");
  });
});
