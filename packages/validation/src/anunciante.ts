// Dados do perfil do anunciante, no cadastro assistido e na edição pela
// administração (e, depois, na área do anunciante). Os limites são os das
// checagens da tabela (migration 20261022100000_perfis_anunciantes.sql).
import { z } from "zod";
import { esquemaEmail } from "./acesso";
import { textoOpcional, uuidOuVazio } from "./comum";
import { esquemaHorario } from "./horario";
import { esquemaSite, esquemaWhatsapp } from "./patrocinio";

export const FORMAS_PAGAMENTO = ["pix", "cartao", "dinheiro"] as const;

const textoLimpo = (minimo: number, maximo: number, rotulo: string) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(minimo, `Informe ${rotulo}.`).max(maximo, `${rotulo[0]!.toUpperCase()}${rotulo.slice(1)}: no máximo ${maximo} letras.`));

/** "@perfil", "instagram.com/perfil" ou "perfil" viram "perfil". */
const esquemaInstagram = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, ""))
  .refine((v) => v === "" || /^[A-Za-z0-9._]{1,30}$/.test(v), "Instagram inválido: use só o nome do perfil, como @pizzariadoze.");

const listaDeIds = z.array(z.uuid("Escolha inválida.")).max(200).transform((ids) => [...new Set(ids)]);

// Partes do perfil, uma por etapa do cadastro próprio (decisão G2 de 24/11/2026)
// e por card da área do anunciante. O perfil completo é a soma delas.
const sobre = {
  nome: textoLimpo(2, 100, "o nome"),
  categoriaPrincipalId: z.uuid("Escolha a categoria principal."),
  categoriasAdicionais: listaDeIds,
  descricao: textoOpcional(2000, "Descrição"),
};

const contato = {
  whatsapp: esquemaWhatsapp,
  telefone: esquemaWhatsapp,
  instagram: esquemaInstagram,
  formasPagamento: z.array(z.enum(FORMAS_PAGAMENTO, { error: "Forma de pagamento inválida." })).transform((f) => [...new Set(f)]),
};
const contatoProfissional = { ...contato, registroConselho: textoOpcional(60, "Registro no conselho") };
const contatoComercio = { ...contato, siteProprio: esquemaSite };

const ondeProfissional = {
  atendeTodaCidade: z.boolean(),
  bairrosAtendidos: listaDeIds,
};
const ondeComercio = {
  endereco: z.object({
    logradouro: textoLimpo(2, 120, "a rua"),
    numero: textoLimpo(1, 10, "o número (ou S/N)"),
    complemento: textoOpcional(60, "Complemento"),
    bairroId: z.uuid("Escolha o bairro do endereço."),
  }),
  fazEntrega: z.boolean(),
  entregaTodaCidade: z.boolean(),
  bairrosEntrega: listaDeIds,
};

const TIPO_INVALIDO = "Escolha se é autônomo ou comércio.";
const tipoAnunciante = z.enum(["profissional", "comercio"], { error: TIPO_INVALIDO });

/** Etapa "Seu anúncio": tipo, nome, categorias e descrição. */
export const esquemaEtapaSobre = z.object({ tipo: tipoAnunciante, ...sobre });
/** Etapa "Contato", que muda com o tipo (registro no conselho do autônomo; site do comércio). */
export const esquemaEtapaContato = {
  profissional: z.object(contatoProfissional),
  comercio: z.object(contatoComercio),
} as const;
/** Etapa "Onde atende" (autônomo) ou "Endereço" (comércio). */
export const esquemaEtapaOnde = {
  profissional: z.object(ondeProfissional),
  comercio: z.object(ondeComercio),
} as const;

const profissional = z.object({
  tipo: z.literal("profissional"),
  ...sobre,
  ...contatoProfissional,
  ...ondeProfissional,
  // Sem o horário no envio, o gravado não muda.
  horario: esquemaHorario.optional(),
});

const comercio = z.object({
  tipo: z.literal("comercio"),
  ...sobre,
  ...contatoComercio,
  ...ondeComercio,
  horario: esquemaHorario.optional(),
});

export const esquemaPerfilAnunciante = z.discriminatedUnion("tipo", [profissional, comercio], { error: TIPO_INVALIDO });
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
