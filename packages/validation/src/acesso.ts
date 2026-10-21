// Formulários de acesso: entrar, recuperar a senha, criar a nova senha e
// digitar o código do aplicativo autenticador. Usados no servidor; a tela usa
// os mesmos requisitos de senha (senha.ts) para mostrar o que falta.
import { z } from "zod";
import { REQUISITOS_SENHA, TAMANHO_MAXIMO_SENHA } from "./senha";

export const esquemaEmail = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail longo demais.")
  .pipe(z.email("E-mail inválido."));

const esquemaSenhaInformada = z
  .string({ error: "Informe a senha." })
  .min(1, "Informe a senha.")
  .max(200, "Senha longa demais.");

export const esquemaSenhaForte = z
  .string({ error: "Informe a senha." })
  .superRefine((senha, contexto) => {
    const faltando = REQUISITOS_SENHA.filter((requisito) => !requisito.atende(senha));
    if (faltando.length > 0) {
      contexto.addIssue({
        code: "custom",
        message: `A senha precisa ter: ${faltando.map((r) => r.descricao.toLowerCase()).join(", ")}.`,
      });
    }
    if (new TextEncoder().encode(senha).length > TAMANHO_MAXIMO_SENHA) {
      contexto.addIssue({ code: "custom", message: `A senha pode ter no máximo ${TAMANHO_MAXIMO_SENHA} caracteres.` });
    }
  });

/** Token do Turnstile, que o Supabase Auth confere. O site só repassa. */
const esquemaTokenRobo = z
  .string({ error: "Confirme que você não é um robô." })
  .min(1, "Confirme que você não é um robô.")
  .max(4096, "Confirme que você não é um robô.");

export const esquemaEntrar = z.object({
  email: esquemaEmail,
  senha: esquemaSenhaInformada,
  tokenRobo: esquemaTokenRobo,
});

export const esquemaRecuperarSenha = z.object({
  email: esquemaEmail,
  tokenRobo: esquemaTokenRobo,
});

export const esquemaNovaSenha = z
  .object({
    senha: esquemaSenhaForte,
    confirmacao: z.string({ error: "Repita a senha." }),
  })
  .refine((dados) => dados.senha === dados.confirmacao, {
    message: "As duas senhas não são iguais.",
    path: ["confirmacao"],
  });

export const esquemaCodigoDuasEtapas = z.object({
  codigo: z
    .string({ error: "Informe o código." })
    .trim()
    .regex(/^\d{6}$/, "O código tem 6 números."),
});

/**
 * Transforma o erro do Zod nas mensagens por campo do contrato padrão
 * (Resultado, packages/types): a primeira mensagem de cada campo.
 */
export function mensagensPorCampo(erro: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const problema of erro.issues) {
    const campo = String(problema.path[0] ?? "formulario");
    campos[campo] ??= problema.message;
  }
  return campos;
}
