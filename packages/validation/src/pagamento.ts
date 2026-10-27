// Pagamento do plano registrado pela administração (item 4.15; decisões de 23 e
// 27/10/2026): Pix, débito ou crédito na maquininha, com as parcelas e o código
// de autorização impresso no comprovante do cartão. A taxa da maquininha não
// entra: o valor é sempre o do sistema, calculado no servidor.
import { z } from "zod";

export const FORMAS_RECEBIMENTO = ["pix", "debito", "credito"] as const;
export type FormaRecebimento = (typeof FORMAS_RECEBIMENTO)[number];

export const ROTULO_FORMA_RECEBIMENTO: Record<FormaRecebimento, string> = {
  pix: "Pix",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
};

/** Primeira etapa: o que foi pago e quando. O valor sai daqui, pelas regras do domínio. */
export const esquemaEscolhaPagamento = z.object({
  planoId: z.uuid("Escolha o plano."),
  periodicidade: z.enum(["mensal", "anual"], { error: "Escolha mensal ou anual." }),
  pagoEm: z.iso.date("Informe o dia do pagamento."),
});
export type EscolhaPagamento = z.infer<typeof esquemaEscolhaPagamento>;

const texto = (maximo: number, mensagem: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().replace(/\s+/g, " "))
    .pipe(z.string().max(maximo, mensagem));

export const esquemaPagamento = esquemaEscolhaPagamento
  .extend({
    forma: z.enum(FORMAS_RECEBIMENTO, { error: "Escolha a forma de pagamento." }),
    parcelas: z.coerce.number({ error: "Parcelas inválidas." }).int("Parcelas inválidas.").min(1, "Parcelas inválidas.").max(12, "No máximo 12 parcelas."),
    codigoAutorizacao: texto(20, "Código de autorização: no máximo 20 letras e números.").transform((v) => v.replace(/\s/g, "").toUpperCase()),
    observacao: texto(300, "Observação: no máximo 300 letras."),
  })
  .superRefine((p, ctx) => {
    if (p.forma !== "credito" && p.parcelas !== 1) {
      ctx.addIssue({ code: "custom", path: ["parcelas"], message: "Só o crédito pode ser parcelado." });
    }
    if (p.forma === "pix" && p.codigoAutorizacao) {
      ctx.addIssue({ code: "custom", path: ["codigoAutorizacao"], message: "O Pix não tem código de autorização." });
    }
    if (p.forma !== "pix" && !/^[A-Z0-9]{4,20}$/.test(p.codigoAutorizacao)) {
      ctx.addIssue({
        code: "custom",
        path: ["codigoAutorizacao"],
        message: "Informe o código de autorização impresso no comprovante do cartão (4 a 20 letras e números).",
      });
    }
  });
export type DadosPagamento = z.infer<typeof esquemaPagamento>;

export const esquemaDevolucao = z.object({
  motivo: texto(300, "Motivo: no máximo 300 letras.").pipe(z.string().min(3, "Informe o motivo da devolução.")),
});

/** Pagamento do saldo liberado ao representante, por Pix (decisão P2: sempre o saldo inteiro). */
export const esquemaPagamentoRepresentante = z.object({
  pagoEm: z.iso.date("Informe o dia do Pix ao representante."),
  observacao: texto(300, "Observação: no máximo 300 letras."),
});
