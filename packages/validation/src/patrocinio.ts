// Cadastro de patrocinadores e das cotas (administração). Os limites são os
// mesmos das checagens da tabela (migration 20261022170000_patrocinadores.sql).
import { z } from "zod";

export const COTAS_PATROCINIO = ["master", "ouro", "apoio", "grupo", "categoria", "agenda"] as const;

const textoLimpo = (minimo: number, maximo: number, nome: string) =>
  z
    .string({ error: `Informe ${nome}.` })
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(minimo, `${nome[0]!.toUpperCase()}${nome.slice(1)}: pelo menos ${minimo} letras.`).max(maximo, `${nome[0]!.toUpperCase()}${nome.slice(1)}: no máximo ${maximo} letras.`));

/** WhatsApp em qualquer formato ((22) 99999-0000, +55...) vira 55 + DDD + número. Vazio fica sem contato. */
const esquemaWhatsapp = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .transform((v) => (v === "" ? "" : v.startsWith("55") && v.length >= 12 ? v : `55${v}`))
  .refine((v) => v === "" || /^55[1-9][0-9]{9,10}$/.test(v), "WhatsApp inválido: use DDD e número, como (22) 99999-0000.");

export const esquemaPatrocinio = z
  .object({
    cota: z.enum(COTAS_PATROCINIO, { error: "Escolha a cota." }),
    nome: textoLimpo(2, 80, "o nome da empresa"),
    ramo: textoLimpo(2, 60, "o ramo"),
    frase: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().max(140, "Frase: no máximo 140 letras.")),
    whatsapp: esquemaWhatsapp,
    grupo: z.string().transform((v) => v.trim()),
    categoriaId: z.string().transform((v) => v.trim()),
  })
  .superRefine((d, ctx) => {
    if (d.cota === "grupo" && !d.grupo) ctx.addIssue({ code: "custom", path: ["grupo"], message: "Escolha o grupo de categorias." });
    if (d.cota === "categoria" && !/^[0-9a-f-]{36}$/.test(d.categoriaId)) {
      ctx.addIssue({ code: "custom", path: ["categoriaId"], message: "Escolha a categoria." });
    }
  })
  .transform((d) => ({
    ...d,
    grupo: d.cota === "grupo" ? d.grupo : null,
    categoriaId: d.cota === "categoria" ? d.categoriaId : null,
    whatsapp: d.whatsapp || null,
  }));

export type DadosPatrocinio = z.output<typeof esquemaPatrocinio>;

const centavos = (nome: string) =>
  z
    .string()
    .transform((v) => Number(v.replace(/\./g, "").replace(",", ".")))
    .pipe(z.number({ error: `${nome}: valor inválido.` }).positive(`${nome}: maior que zero.`).max(1_000_000, `${nome}: valor alto demais.`))
    .transform((reais) => Math.round(reais * 100));

export const esquemaCotaPatrocinio = z
  .object({
    nome: textoLimpo(2, 40, "o nome da cota"),
    beneficios: z
      .string()
      .transform((v) =>
        v
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().max(120, "Cada benefício: no máximo 120 letras.")).max(10, "No máximo 10 benefícios.")),
    valorCentavos: centavos("Valor"),
    valorFundadorCentavos: centavos("Valor de Fundador"),
    vagas: z
      .string()
      .transform((v) => (v.trim() === "" ? null : Number(v)))
      .pipe(z.number().int("Vagas: número inteiro.").min(1, "Vagas: pelo menos 1.").max(100, "Vagas: no máximo 100.").nullable()),
    larguraLogo: z.coerce.number().int().min(100, "Largura do logo: de 100 a 2000 pixels.").max(2000, "Largura do logo: de 100 a 2000 pixels."),
    alturaLogo: z.coerce.number().int().min(100, "Altura do logo: de 100 a 2000 pixels.").max(2000, "Altura do logo: de 100 a 2000 pixels."),
  })
  .refine((d) => d.valorFundadorCentavos <= d.valorCentavos, { path: ["valorFundadorCentavos"], message: "O valor de Fundador não pode passar do valor cheio." });

export type DadosCotaPatrocinio = z.output<typeof esquemaCotaPatrocinio>;
