// Catálogo e valores editados na administração (item 4 do plano, 27/10/2026):
// planos, extras e a escala do desconto de Fundador. Os limites são os mesmos
// das checagens das tabelas planos e extras. A escala é conferida também por
// validarEscalaFundador (packages/domain).
import { z } from "zod";
import { reaisEmCentavos, textoLimpo } from "./comum";

const inteiro = (minimo: number, maximo: number, mensagem: string) =>
  z.coerce.number({ error: mensagem }).int(mensagem).min(minimo, mensagem).max(maximo, mensagem);
const marcado = z
  .string()
  .optional()
  .transform((v) => v === "sim");
const mesesNoAnual = inteiro(1, 12, "Meses cobrados no anual: de 1 a 12.");

export const esquemaPlanoAdmin = z.object({
  nome: textoLimpo(2, 40, "o nome do plano"),
  valorMensalCentavos: reaisEmCentavos("Valor por mês", { permiteZero: true }),
  mesesCobradosNoAnual: mesesNoAnual,
  limiteFotos: inteiro(0, 1000, "Fotos: de 0 a 1000."),
  limiteCategoriasAdicionais: inteiro(0, 50, "Categorias adicionais: de 0 a 50."),
  limiteEncartesSemana: inteiro(0, 50, "Encartes por semana: de 0 a 50."),
  limiteProdutos: inteiro(0, 5000, "Produtos: de 0 a 5000."),
  limiteEnderecos: inteiro(1, 100, "Endereços: de 1 a 100."),
  temRelatorio: marcado,
});
export type PlanoAdmin = z.output<typeof esquemaPlanoAdmin>;

const textoOpcional = (maximo: number, mensagem: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().replace(/\s+/g, " "))
    .pipe(z.string().max(maximo, mensagem));

export const esquemaExtraAdmin = z.object({
  nome: textoLimpo(2, 60, "o nome do extra"),
  descricao: textoOpcional(300, "Descrição: no máximo 300 letras."),
  valorMensalCentavos: reaisEmCentavos("Valor por mês"),
  mesesCobradosNoAnual: mesesNoAnual,
  aceitaDescontoFundador: marcado,
  permiteAnual: marcado,
  ativo: marcado,
});
export type ExtraAdmin = z.output<typeof esquemaExtraAdmin>;

/** Pacotes que aumentam um limite do plano: quantos itens o pacote dá. */
export const esquemaQuantidadePacote = inteiro(1, 1000, "Quantidade do pacote: de 1 a 1000.");

/** Banner Exclusivo, vendido por dia (item 6.4). O valor do bloco é o valor do extra. */
export const esquemaBannerPorDia = z
  .object({
    diariaCentavos: reaisEmCentavos("Diária"),
    valorBlocoCentavos: reaisEmCentavos("Bloco de dias seguidos"),
    diasPorBloco: inteiro(2, 90, "Dias do bloco: de 2 a 90."),
    minimoDiasParaBloco: inteiro(1, 90, "Mínimo de dias para o bloco: de 1 a 90."),
    antecedenciaDias: inteiro(0, 30, "Antecedência: de 0 a 30 dias."),
  })
  .refine((d) => d.minimoDiasParaBloco <= d.diasPorBloco, {
    path: ["minimoDiasParaBloco"],
    message: "O mínimo de dias para pagar o bloco não pode passar dos dias do bloco.",
  });

const MENSAGEM_PERCENTUAL = "Percentual: de 0 a 100, sem casas decimais.";

/**
 * Escala do desconto de Fundador, vinda das linhas do formulário: até o ano
 * (vazio no último degrau) e o percentual. Linhas sem percentual são ignoradas.
 */
export const esquemaEscalaFundador = z
  .array(z.object({ ateAno: z.string().optional(), percentual: z.string().optional() }))
  .transform((linhas) => linhas.filter((l) => (l.percentual ?? "").trim() !== ""))
  .pipe(
    z
      .array(
        z.object({
          ateAno: z
            .string()
            .optional()
            .transform((v) => ((v ?? "").trim() === "" ? undefined : Number(v)))
            .pipe(z.number().int("Até o ano: número inteiro.").min(1, "Até o ano: a partir do 1.").max(50, "Até o ano: no máximo 50.").optional()),
          // A entrada é o texto do formulário (já sem as linhas vazias).
          percentual: z.coerce
            .number<string | undefined>({ error: MENSAGEM_PERCENTUAL })
            .int(MENSAGEM_PERCENTUAL)
            .min(0, MENSAGEM_PERCENTUAL)
            .max(100, MENSAGEM_PERCENTUAL),
        }),
      )
      .min(1, "Informe ao menos um degrau do desconto.")
      .max(5, "No máximo 5 degraus."),
  );
