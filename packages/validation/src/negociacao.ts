// Formulários da ficha do cliente (decisões N3 e N4 de 06/11/2026): próxima ação
// e negociação perdida. Os limites são os das checagens da tabela negociacoes
// (migration 20261106120000).
import { z } from "zod";

const textoOpcional = (maximo: number, mensagem: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().replace(/\s+/g, " "))
    .pipe(z.string().max(maximo, mensagem));

/** Dia vazio apaga a próxima ação; o texto sem dia não é aceito, para não virar um lembrete que nunca avisa. */
export const esquemaProximaAcao = z
  .object({
    dia: z
      .string()
      .optional()
      .transform((v) => (v ?? "").trim())
      .pipe(z.union([z.literal(""), z.iso.date("Dia inválido.")])),
    texto: textoOpcional(200, "O que fazer: no máximo 200 letras."),
  })
  .refine((v) => v.dia !== "" || v.texto === "", { path: ["dia"], message: "Escolha o dia da próxima ação." });
export type ProximaAcao = z.output<typeof esquemaProximaAcao>;

export const esquemaNegociacaoPerdida = z.object({
  motivoId: z.uuid("Escolha o motivo."),
  observacao: textoOpcional(300, "Observação: no máximo 300 letras."),
});
export type NegociacaoPerdida = z.output<typeof esquemaNegociacaoPerdida>;

/** Nome de um motivo de perda, editado na administração. */
export const esquemaMotivoPerda = z.object({
  nome: z
    .string({ error: "Informe o nome do motivo." })
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(2, "Informe o nome do motivo.").max(60, "Nome: no máximo 60 letras.")),
});

/**
 * Código do representante informado por quem não está logado: opcional. Vazio
 * vira nulo; o formato é o do link /r/codigo (representantes.codigo no banco).
 */
export const esquemaCodigoIndicacao = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim().toLowerCase())
  .refine((v) => v === "" || (v.length >= 3 && v.length <= 30 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)), "Código do representante inválido. Confira com quem te indicou.")
  .transform((v) => v || null);
