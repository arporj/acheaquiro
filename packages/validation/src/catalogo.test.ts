import { describe, expect, it } from "vitest";
import { esquemaBannerPorDia, esquemaEscalaFundador, esquemaExtraAdmin, esquemaPlanoAdmin, esquemaQuantidadePacote } from "./catalogo";
import { reaisEmCentavos } from "./comum";

const mensagem = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? "" : r.error!.issues[0]!.message);

const plano = {
  nome: " Avançado ",
  valorMensalCentavos: "59,90",
  mesesCobradosNoAnual: "10",
  limiteFotos: "10",
  limiteCategoriasAdicionais: "2",
  limiteEncartesSemana: "1",
  limiteProdutos: "50",
  limiteEnderecos: "1",
  temRelatorio: "sim",
};

describe("reaisEmCentavos", () => {
  it("aceita milhar com ponto e centavos com vírgula", () => {
    expect(reaisEmCentavos("Valor").parse("1.800,00")).toBe(180000);
    expect(reaisEmCentavos("Valor").parse("59,9")).toBe(5990);
  });

  it("zero só com permiteZero; vazio e negativo são inválidos", () => {
    expect(mensagem(reaisEmCentavos("Valor").safeParse("0"))).toBe("Valor: maior que zero.");
    expect(reaisEmCentavos("Valor", { permiteZero: true }).parse("0")).toBe(0);
    expect(mensagem(reaisEmCentavos("Valor").safeParse(""))).toBe("Valor: valor inválido.");
    expect(mensagem(reaisEmCentavos("Valor").safeParse("-1"))).toBe("Valor: valor inválido.");
    expect(mensagem(reaisEmCentavos("Valor").safeParse("2.000.000"))).toBe("Valor: valor alto demais.");
  });
});

describe("esquemaPlanoAdmin", () => {
  it("converte valores e marca o relatório", () => {
    expect(esquemaPlanoAdmin.parse(plano)).toEqual({
      nome: "Avançado",
      valorMensalCentavos: 5990,
      mesesCobradosNoAnual: 10,
      limiteFotos: 10,
      limiteCategoriasAdicionais: 2,
      limiteEncartesSemana: 1,
      limiteProdutos: 50,
      limiteEnderecos: 1,
      temRelatorio: true,
    });
  });

  it("plano gratuito (zero) e sem relatório", () => {
    const r = esquemaPlanoAdmin.parse({ ...plano, valorMensalCentavos: "0", temRelatorio: undefined });
    expect(r.valorMensalCentavos).toBe(0);
    expect(r.temRelatorio).toBe(false);
  });

  it("recusa limites e meses fora da faixa", () => {
    expect(mensagem(esquemaPlanoAdmin.safeParse({ ...plano, mesesCobradosNoAnual: "13" }))).toBe("Meses cobrados no anual: de 1 a 12.");
    expect(mensagem(esquemaPlanoAdmin.safeParse({ ...plano, limiteFotos: "-1" }))).toBe("Fotos: de 0 a 1000.");
    expect(mensagem(esquemaPlanoAdmin.safeParse({ ...plano, limiteEnderecos: "0" }))).toBe("Endereços: de 1 a 100.");
    expect(mensagem(esquemaPlanoAdmin.safeParse({ ...plano, nome: "V" }))).toBe("O nome do plano: pelo menos 2 letras.");
  });
});

describe("esquemaExtraAdmin", () => {
  const extra = { nome: "Pacote de fotos", descricao: " Mais 10 fotos ", valorMensalCentavos: "4,90", mesesCobradosNoAnual: "10", aceitaDescontoFundador: "sim", permiteAnual: "sim", ativo: "sim" };

  it("converte e limpa", () => {
    expect(esquemaExtraAdmin.parse(extra)).toEqual({
      nome: "Pacote de fotos",
      descricao: "Mais 10 fotos",
      valorMensalCentavos: 490,
      mesesCobradosNoAnual: 10,
      aceitaDescontoFundador: true,
      permiteAnual: true,
      ativo: true,
    });
  });

  it("desmarcados viram falso e a descrição longa é recusada", () => {
    expect(esquemaExtraAdmin.parse({ ...extra, aceitaDescontoFundador: undefined, permiteAnual: undefined, ativo: undefined, descricao: undefined })).toMatchObject({
      aceitaDescontoFundador: false,
      permiteAnual: false,
      ativo: false,
      descricao: "",
    });
    expect(mensagem(esquemaExtraAdmin.safeParse({ ...extra, descricao: "x".repeat(301) }))).toBe("Descrição: no máximo 300 letras.");
  });

  it("quantidade do pacote", () => {
    expect(esquemaQuantidadePacote.parse("10")).toBe(10);
    expect(mensagem(esquemaQuantidadePacote.safeParse("0"))).toBe("Quantidade do pacote: de 1 a 1000.");
  });
});

describe("esquemaBannerPorDia", () => {
  const banner = { diariaCentavos: "24,90", valorBlocoCentavos: "500,00", diasPorBloco: "30", minimoDiasParaBloco: "21", antecedenciaDias: "2" };

  it("converte os valores", () => {
    expect(esquemaBannerPorDia.parse(banner)).toEqual({ diariaCentavos: 2490, valorBlocoCentavos: 50000, diasPorBloco: 30, minimoDiasParaBloco: 21, antecedenciaDias: 2 });
  });

  it("o mínimo para pagar o bloco não passa dos dias do bloco", () => {
    expect(mensagem(esquemaBannerPorDia.safeParse({ ...banner, minimoDiasParaBloco: "31" }))).toBe(
      "O mínimo de dias para pagar o bloco não pode passar dos dias do bloco.",
    );
  });
});

describe("esquemaEscalaFundador", () => {
  it("lê os degraus e ignora linhas vazias", () => {
    expect(
      esquemaEscalaFundador.parse([
        { ateAno: "3", percentual: "50" },
        { ateAno: "", percentual: "25" },
        { ateAno: "", percentual: "" },
      ]),
    ).toEqual([{ ateAno: 3, percentual: 50 }, { percentual: 25 }]);
  });

  it("exige ao menos um degrau e valores válidos", () => {
    expect(mensagem(esquemaEscalaFundador.safeParse([{ ateAno: "", percentual: "" }]))).toBe("Informe ao menos um degrau do desconto.");
    expect(mensagem(esquemaEscalaFundador.safeParse([{ ateAno: "0", percentual: "50" }]))).toBe("Até o ano: a partir do 1.");
    expect(mensagem(esquemaEscalaFundador.safeParse([{ percentual: "101" }]))).toBe("Percentual: de 0 a 100, sem casas decimais.");
  });
});
