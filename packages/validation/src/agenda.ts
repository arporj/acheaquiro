// Cadastro da Agenda: eventos, programação, barracas, artistas e estilos
// musicais (decisões 8 a 11 de 29/10/2026 e C1 de 17/11/2026). Os limites são
// os mesmos das checagens das tabelas (migration da Agenda). As regras que
// dependem do dia de hoje (12 meses à frente, evento já terminado) ficam em
// packages/domain (problemaNasDatasDoEvento), conferidas no servidor.
import type { OrigemEvento } from "@acheaqui/types";
import { z } from "zod";
import { reaisEmCentavos, textoLimpo, textoOpcional, uuidOuVazio } from "./comum";
import { esquemaWhatsapp } from "./patrocinio";

export const ORIGENS_EVENTO = ["comercio", "artista", "avulso", "orgao_publico"] as const satisfies readonly OrigemEvento[];

export const ROTULO_ORIGEM_EVENTO: Record<OrigemEvento, string> = {
  comercio: "Do comércio (extra Agenda ou Premium)",
  artista: "Show do artista anunciante",
  avulso: "Evento avulso (produtor, festa, feira, festival)",
  orgao_publico: "Órgão público (gratuito)",
};

export const TIPOS_ENTRADA = ["gratuita", "couvert", "ingressos"] as const;
export type TipoEntrada = (typeof TIPOS_ENTRADA)[number];

export const ROTULO_ENTRADA: Record<TipoEntrada, string> = {
  gratuita: "Entrada gratuita",
  couvert: "Couvert artístico",
  ingressos: "Ingressos",
};

export const CLASSIFICACOES_ETARIAS = ["livre", "12", "14", "16", "18"] as const;
export type ClassificacaoEtaria = (typeof CLASSIFICACOES_ETARIAS)[number];

export const ROTULO_CLASSIFICACAO: Record<ClassificacaoEtaria, string> = {
  livre: "Livre para todos",
  "12": "A partir de 12 anos",
  "14": "A partir de 14 anos",
  "16": "A partir de 16 anos",
  "18": "A partir de 18 anos",
};

/** Ingressos de um evento: até 10 tipos. */
export const MAXIMO_INGRESSOS = 10;
/** Estilos de um artista. */
export const MAXIMO_ESTILOS_ARTISTA = 5;
/** Vídeos de um artista (links externos, sem script de terceiros). */
export const MAXIMO_VIDEOS_ARTISTA = 6;
/** Tipos de evento que o artista aceita fazer. */
export const MAXIMO_TIPOS_DE_EVENTO = 8;

/** "sim", "nao" ou vazio (não informado). */
const simNaoOuNaoInformado = z
  .enum(["sim", "nao", ""], { error: "Escolha sim, não ou não informado." })
  .optional()
  .transform((v) => (v === "sim" ? true : v === "nao" ? false : null));

const ingresso = z.object({
  nome: textoLimpo(2, 40, "o nome do ingresso"),
  // Ingresso de graça (criança até 5 anos, por exemplo) é permitido.
  valorCentavos: reaisEmCentavos("Valor do ingresso", { permiteZero: true }),
});

export const esquemaEvento = z
  .object({
    origem: z.enum(ORIGENS_EVENTO, { error: "Escolha de onde vem o evento." }),
    anuncianteId: uuidOuVazio("Anunciante inválido."),
    nome: textoLimpo(3, 100, "o nome do evento"),
    descricao: textoOpcional(2000, "Descrição"),
    produtor: textoOpcional(80, "Quem organiza"),
    local: textoLimpo(2, 100, "o nome do lugar"),
    endereco: textoOpcional(160, "Endereço"),
    bairroId: z.uuid("Escolha o bairro."),
    dataInicio: z.iso.date("Informe o primeiro dia."),
    dataFim: z.iso.date("Informe o último dia."),
    entrada: z.enum(TIPOS_ENTRADA, { error: "Escolha o tipo de entrada." }),
    couvert: z.string().optional(),
    ingressos: z.array(z.object({ nome: z.string(), valor: z.string() })).optional(),
    abertoAoPublico: z.enum(["sim", "nao"], { error: "Diga se o evento é aberto ao público." }).transform((v) => v === "sim"),
    classificacao: z
      .enum([...CLASSIFICACOES_ETARIAS, ""], { error: "Classificação inválida." })
      .optional()
      .transform((v) => (v ? v : null)),
    cadeiraDePraia: simNaoOuNaoInformado,
    cooler: simNaoOuNaoInformado,
    ruasFechadas: textoOpcional(300, "Ruas fechadas"),
  })
  .superRefine((d, ctx) => {
    if ((d.origem === "comercio" || d.origem === "artista") && !d.anuncianteId) {
      ctx.addIssue({ code: "custom", path: ["anuncianteId"], message: "Escolha o anunciante." });
    }
    if (d.dataFim < d.dataInicio) ctx.addIssue({ code: "custom", path: ["dataFim"], message: "O último dia não pode vir antes do primeiro." });
  })
  .transform((d, ctx) => {
    let couvertCentavos: number | null = null;
    let ingressos: { nome: string; valorCentavos: number }[] = [];
    if (d.entrada === "couvert") {
      const couvert = reaisEmCentavos("Couvert").safeParse(d.couvert ?? "");
      if (!couvert.success) ctx.addIssue({ code: "custom", path: ["couvert"], message: couvert.error.issues[0]!.message });
      else couvertCentavos = couvert.data;
    }
    if (d.entrada === "ingressos") {
      const preenchidos = (d.ingressos ?? []).filter((i) => i.nome.trim() !== "" || i.valor.trim() !== "");
      const lista = z
        .array(ingresso)
        .min(1, "Informe pelo menos um tipo de ingresso.")
        .max(MAXIMO_INGRESSOS, `No máximo ${MAXIMO_INGRESSOS} tipos de ingresso.`)
        .safeParse(preenchidos.map((i) => ({ nome: i.nome, valorCentavos: i.valor })));
      if (!lista.success) ctx.addIssue({ code: "custom", path: ["ingressos"], message: lista.error.issues[0]!.message });
      else ingressos = lista.data;
    }
    const { couvert: _couvert, ...resto } = d;
    return {
      ...resto,
      anuncianteId: d.anuncianteId || null,
      produtor: d.produtor || null,
      endereco: d.endereco || null,
      ruasFechadas: d.ruasFechadas || null,
      couvertCentavos,
      ingressos,
    };
  });

export type DadosEvento = z.output<typeof esquemaEvento>;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Uma linha da programação: um artista ou uma atividade (largada, feira, premiação), com dia e horário. */
export const esquemaItemProgramacao = z
  .object({
    dia: z.iso.date("Informe o dia."),
    inicio: z.string().regex(HORA, "Horário de início inválido: use HH:MM, como 21:00."),
    // O show pode passar da meia-noite (22:00 às 02:00): o fim não precisa vir depois do início.
    fim: z
      .string()
      .optional()
      .transform((v) => (v ?? "").trim())
      .refine((v) => v === "" || HORA.test(v), "Horário de fim inválido: use HH:MM, como 23:30."),
    artistaId: uuidOuVazio("Artista inválido."),
    titulo: textoOpcional(80, "Atividade"),
  })
  .refine((d) => d.artistaId !== "" || d.titulo !== "", { path: ["titulo"], message: "Escolha o artista ou escreva a atividade." })
  .transform((d) => ({ ...d, fim: d.fim || null, artistaId: d.artistaId || null, titulo: d.titulo || null }));

export type DadosItemProgramacao = z.output<typeof esquemaItemProgramacao>;

/** Barraca de um evento. O WhatsApp só é publicado com a autorização do barraqueiro. */
export const esquemaBarraca = z
  .object({
    nome: textoLimpo(2, 60, "o nome da barraca"),
    vende: textoLimpo(2, 80, "o que a barraca vende"),
    whatsapp: esquemaWhatsapp,
    whatsappAutorizado: z.enum(["sim", ""]).optional(),
    anuncianteId: uuidOuVazio("Anunciante inválido."),
  })
  .refine((d) => d.whatsapp === "" || d.whatsappAutorizado === "sim", {
    path: ["whatsappAutorizado"],
    message: "Confirme que o barraqueiro autorizou publicar o WhatsApp.",
  })
  .transform(({ whatsappAutorizado: _autorizado, ...d }) => ({ ...d, whatsapp: d.whatsapp || null, anuncianteId: d.anuncianteId || null }));

export type DadosBarraca = z.output<typeof esquemaBarraca>;

const video = z.object({
  titulo: textoLimpo(2, 80, "o título do vídeo"),
  url: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => /^https:\/\/[^\s]{4,300}$/.test(v) && URL.canParse(v), "Vídeo: use o endereço completo, começando com https://."),
});

export const esquemaArtista = z.object({
  nome: textoLimpo(2, 80, "o nome do artista ou da banda"),
  estiloIds: z
    .array(z.uuid("Estilo inválido."))
    .transform((ids) => [...new Set(ids)])
    .pipe(z.array(z.string()).min(1, "Escolha pelo menos um estilo.").max(MAXIMO_ESTILOS_ARTISTA, `No máximo ${MAXIMO_ESTILOS_ARTISTA} estilos.`)),
  anuncianteId: uuidOuVazio("Anunciante inválido.").transform((v) => v || null),
  formacao: textoOpcional(120, "Formação").transform((v) => v || null),
  /** Tipos de evento que aceita fazer, um por linha. */
  atende: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((l) => l.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().max(40, "Cada tipo de evento: no máximo 40 letras."))
        .max(MAXIMO_TIPOS_DE_EVENTO, `No máximo ${MAXIMO_TIPOS_DE_EVENTO} tipos de evento.`),
    ),
  videos: z
    .array(z.object({ titulo: z.string(), url: z.string() }))
    .optional()
    .transform((lista) => (lista ?? []).filter((v) => v.titulo.trim() !== "" || v.url.trim() !== ""))
    .pipe(z.array(video).max(MAXIMO_VIDEOS_ARTISTA, `No máximo ${MAXIMO_VIDEOS_ARTISTA} vídeos.`)),
});

export type DadosArtista = z.output<typeof esquemaArtista>;

export const esquemaEstiloMusical = z.object({ nome: textoLimpo(2, 40, "o nome do estilo") });

/** Cortesia do evento avulso (decisão C1 de 17/11/2026): só a administração, com motivo. */
export const esquemaCortesia = z.object({ motivo: textoLimpo(10, 200, "o motivo da cortesia") });
