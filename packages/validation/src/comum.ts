// Peças de validação usadas por mais de um esquema.
import { z } from "zod";

/** Texto sem espaços sobrando, de minimo a maximo letras; nome entra nas mensagens ("o nome da cota"). */
export const textoLimpo = (minimo: number, maximo: number, nome: string) =>
  z
    .string({ error: `Informe ${nome}.` })
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(minimo, `${nome[0]!.toUpperCase()}${nome.slice(1)}: pelo menos ${minimo} letras.`).max(maximo, `${nome[0]!.toUpperCase()}${nome.slice(1)}: no máximo ${maximo} letras.`));

/** Valor em reais digitado ("1.800,00" ou "59,90") vira centavos. Só aceita zero com permiteZero. */
export const reaisEmCentavos = (nome: string, { permiteZero = false } = {}) =>
  z
    .string()
    .transform((v) => (v.trim() === "" ? Number.NaN : Number(v.replace(/\./g, "").replace(",", "."))))
    .pipe(
      z
        .number({ error: `${nome}: valor inválido.` })
        .min(0, `${nome}: valor inválido.`)
        .refine((reais) => permiteZero || reais > 0, `${nome}: maior que zero.`)
        .refine((reais) => reais <= 1_000_000, `${nome}: valor alto demais.`),
    )
    .transform((reais) => Math.round(reais * 100));
