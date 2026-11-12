// Denúncia de perfil (item 4.9; decisão D1 de 12/11/2026): motivos da
// especificação somados aos da decisão de 21/10/2026. Os limites são os das
// checagens da tabela (migration 20261112120000_denuncias.sql).
import { z } from "zod";

/** Ordem em que aparecem no modal do perfil. */
export const MOTIVOS_DENUNCIA = [
  "informacao_falsa",
  "telefone_errado",
  "servico_nao_prestado",
  "foto_ou_texto_improprio",
  "conteudo_sexual",
  "propaganda_politica",
  "outro",
] as const;
export type MotivoDenuncia = (typeof MOTIVOS_DENUNCIA)[number];

export const ROTULOS_MOTIVO_DENUNCIA: Record<MotivoDenuncia, string> = {
  informacao_falsa: "Informação falsa",
  telefone_errado: "Telefone errado",
  servico_nao_prestado: "Serviço não prestado",
  foto_ou_texto_improprio: "Foto ou texto impróprio",
  conteudo_sexual: "Conteúdo sexual",
  propaganda_politica: "Propaganda política",
  outro: "Outro motivo",
};

export const DESCRICAO_DENUNCIA_MINIMO_OUTRO = 10;
export const DESCRICAO_DENUNCIA_MAXIMO = 500;

export const esquemaDenuncia = z
  .object({
    anuncianteId: z.uuid("Perfil inválido."),
    motivo: z.enum(MOTIVOS_DENUNCIA, { error: "Escolha o motivo da denúncia." }),
    descricao: z
      .string()
      .optional()
      .transform((v) => (v ?? "").trim().replace(/\s+/g, " "))
      .pipe(z.string().max(DESCRICAO_DENUNCIA_MAXIMO, "Descrição: no máximo 500 letras.")),
  })
  .refine((d) => d.motivo !== "outro" || d.descricao.length >= DESCRICAO_DENUNCIA_MINIMO_OUTRO, {
    path: ["descricao"],
    message: "Conte o que aconteceu, com pelo menos 10 letras.",
  });

export type Denuncia = z.output<typeof esquemaDenuncia>;
