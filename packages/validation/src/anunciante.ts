// Dados do perfil do anunciante, no cadastro assistido e na edição pela
// administração (e, depois, na área do anunciante). Os limites são os das
// checagens da tabela (migration 20261022100000_perfis_anunciantes.sql).
import { z } from "zod";
import { esquemaEmail } from "./acesso";
import { esquemaSite, esquemaWhatsapp } from "./patrocinio";

export const FORMAS_PAGAMENTO = ["pix", "cartao", "dinheiro"] as const;

const textoLimpo = (minimo: number, maximo: number, rotulo: string) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(minimo, `Informe ${rotulo}.`).max(maximo, `${rotulo[0]!.toUpperCase()}${rotulo.slice(1)}: no máximo ${maximo} letras.`));

const textoOpcional = (maximo: number, rotulo: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim())
    .pipe(z.string().max(maximo, `${rotulo}: no máximo ${maximo} letras.`));

/** "@perfil", "instagram.com/perfil" ou "perfil" viram "perfil". */
const esquemaInstagram = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, ""))
  .refine((v) => v === "" || /^[A-Za-z0-9._]{1,30}$/.test(v), "Instagram inválido: use só o nome do perfil, como @pizzariadoze.");

const uuidOuVazio = (mensagem: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v === "" || z.uuid().safeParse(v).success, mensagem);

const listaDeIds = z.array(z.uuid("Escolha inválida.")).max(200).transform((ids) => [...new Set(ids)]);

const base = {
  nome: textoLimpo(2, 100, "o nome"),
  categoriaPrincipalId: z.uuid("Escolha a categoria principal."),
  categoriasAdicionais: listaDeIds,
  descricao: textoOpcional(2000, "Descrição"),
  whatsapp: esquemaWhatsapp,
  telefone: esquemaWhatsapp,
  instagram: esquemaInstagram,
  formasPagamento: z.array(z.enum(FORMAS_PAGAMENTO, { error: "Forma de pagamento inválida." })).transform((f) => [...new Set(f)]),
};

const profissional = z.object({
  tipo: z.literal("profissional"),
  ...base,
  registroConselho: textoOpcional(60, "Registro no conselho"),
  atendeTodaCidade: z.boolean(),
  bairrosAtendidos: listaDeIds,
});

const comercio = z.object({
  tipo: z.literal("comercio"),
  ...base,
  siteProprio: esquemaSite,
  endereco: z.object({
    logradouro: textoLimpo(2, 120, "a rua"),
    numero: textoLimpo(1, 10, "o número (ou S/N)"),
    complemento: textoOpcional(60, "Complemento"),
    bairroId: z.uuid("Escolha o bairro do endereço."),
  }),
  fazEntrega: z.boolean(),
  entregaTodaCidade: z.boolean(),
  bairrosEntrega: listaDeIds,
});

export const esquemaPerfilAnunciante = z.discriminatedUnion("tipo", [profissional, comercio], { error: "Escolha se é autônomo ou comércio." });
export type PerfilAnunciante = z.output<typeof esquemaPerfilAnunciante>;

/** Dados só do cadastro assistido: e-mail do convite, plano escolhido e representante. */
export const esquemaCadastroAssistido = z.object({
  emailConvite: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim())
    .pipe(z.union([z.literal(""), esquemaEmail])),
  // Comércio começa no Gratuito; autônomo escolhe o plano para se cadastrar.
  planoEscolhidoId: z.uuid("Escolha o plano."),
  periodicidade: z.enum(["mensal", "anual"], { error: "Escolha mensal ou anual." }),
  representanteId: uuidOuVazio("Representante inválido."),
});
export type CadastroAssistido = z.output<typeof esquemaCadastroAssistido>;

export const esquemaMotivo = textoLimpo(3, 1000, "o motivo");
