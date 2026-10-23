// Pedidos sobre o perfil de um comércio importado da Receita (decisão de
// 23/10/2026): assumir, remover ou informar que fechou. Os limites são os das
// checagens da tabela (migration 20261023110000_pedidos_perfil_contato.sql).
import { z } from "zod";
import { esquemaEmail } from "./acesso";

export const TIPOS_PEDIDO_PERFIL = ["assumir", "remover", "fechou"] as const;
export type TipoPedidoPerfil = (typeof TIPOS_PEDIDO_PERFIL)[number];

/** Telefone em qualquer formato ((22) 99999-0000, +55...) vira só números, com DDD. */
const esquemaTelefone = z
  .string({ error: "Informe o telefone." })
  .transform((v) => v.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""))
  .refine((v) => /^[1-9][0-9]{9,10}$/.test(v), "Telefone inválido: use DDD e número, como (22) 99999-0000.");

const esquemaNome = z
  .string({ error: "Informe o seu nome." })
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(2, "Informe o seu nome.").max(100, "Nome: no máximo 100 letras."));

const esquemaMensagem = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .pipe(z.string().max(1000, "Mensagem: no máximo 1.000 letras."));

const base = {
  anuncianteId: z.uuid("Perfil inválido."),
  mensagem: esquemaMensagem,
};

export const esquemaPedidoPerfil = z.discriminatedUnion(
  "tipo",
  [
    z.object({
      tipo: z.enum(["assumir", "remover"]),
      ...base,
      nome: esquemaNome,
      email: esquemaEmail,
      telefone: esquemaTelefone,
      declaracao: z.literal(true, { error: "Confirme que você é o responsável por este comércio." }),
    }),
    z.object({ tipo: z.literal("fechou"), ...base }),
  ],
  { error: "Escolha o tipo do pedido." },
);

export type PedidoPerfil = z.output<typeof esquemaPedidoPerfil>;
