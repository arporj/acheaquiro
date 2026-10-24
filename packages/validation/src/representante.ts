// Dados que o representante informa na própria área: a chave Pix para receber
// as comissões e o registro de contato do histórico de atendimento (migration
// 20261024100100_area_representante.sql).
import { z } from "zod";

export type TipoChavePix = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

const SO_NUMEROS = /^[0-9]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALEATORIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normaliza a chave como o banco a guarda: CPF e CNPJ só com números,
 * telefone com +55 e e-mail e chave aleatória em minúsculas. Vazio quando o
 * formato não é de nenhum tipo de chave.
 */
export function normalizarChavePix(valor: string): { tipo: TipoChavePix; chave: string } | null {
  const texto = valor.trim();
  if (EMAIL.test(texto) && texto.length <= 77) return { tipo: "email", chave: texto.toLowerCase() };
  if (ALEATORIA.test(texto)) return { tipo: "aleatoria", chave: texto.toLowerCase() };
  const numeros = texto.replace(/[\s.\-/()]/g, "");
  if (numeros.startsWith("+")) {
    const resto = numeros.slice(1);
    return SO_NUMEROS.test(resto) && /^55[0-9]{10,11}$/.test(resto) ? { tipo: "telefone", chave: `+${resto}` } : null;
  }
  if (!SO_NUMEROS.test(numeros)) return null;
  if (numeros.length === 11) return { tipo: "cpf", chave: numeros };
  if (numeros.length === 14) return { tipo: "cnpj", chave: numeros };
  return null;
}

export const esquemaChavePix = z
  .string({ error: "Informe a chave Pix." })
  .transform((v, ctx) => {
    const chave = normalizarChavePix(v);
    if (!chave) {
      ctx.addIssue({
        code: "custom",
        message: "Chave Pix inválida. Use o CPF, o CNPJ, o e-mail, o celular com +55 e DDD ou a chave aleatória.",
      });
      return z.NEVER;
    }
    return chave;
  });

export const esquemaAtendimento = z.object({
  anuncianteId: z.uuid("Anunciante inválido."),
  dia: z.iso.date("Informe o dia do contato."),
  observacao: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().replace(/\s+/g, " "))
    .pipe(z.string().max(300, "Resultado do contato: no máximo 300 letras.")),
});
export type Atendimento = z.infer<typeof esquemaAtendimento>;
