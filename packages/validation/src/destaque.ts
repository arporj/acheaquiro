// Destaque do bloco "Acontece em Rio das Ostras" (decisões J1 a J5 de
// 24/11/2026). Os limites são os das checagens da tabela destaques
// (migration 20261124134213_destaques.sql); a imagem é conferida à parte.
import type { TipoDestaque } from "@acheaqui/types";
import { z } from "zod";
import { textoLimpo, textoOpcional, uuidOuVazio } from "./comum";

export const TIPOS_DESTAQUE = ["evento", "campanha", "ache_aqui"] as const satisfies readonly TipoDestaque[];

export const ROTULO_TIPO_DESTAQUE: Record<TipoDestaque, string> = {
  evento: "Evento da Agenda",
  campanha: "Campanha solidária ou de utilidade pública",
  ache_aqui: "Divulgação do Ache Aqui",
};

export const TITULO_DESTAQUE_MAXIMO = 60;
export const TEXTO_DESTAQUE_MAXIMO = 140;
export const LINK_DESTAQUE_MAXIMO = 300;

/** Página do site (/agenda) ou endereço externo com https (decisão H4). Vazio fica "". */
export const linkDoDestaque = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .refine(
    (v) =>
      v === "" ||
      (v.length <= LINK_DESTAQUE_MAXIMO &&
        (/^\/[^/\s]\S*$/.test(v) || (/^https:\/\/[^/\s]+\.\S+$/.test(v) && URL.canParse(v)))),
    "Link inválido: use uma página do site, como /agenda, ou o endereço completo, como https://site.com.br.",
  );

const nomeOpcional = (rotulo: string) =>
  textoOpcional(80, rotulo).refine((v) => v === "" || v.length >= 2, `${rotulo}: pelo menos 2 letras.`);

const dataOpcional = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .refine((v) => v === "" || z.iso.date().safeParse(v).success, "Data da autorização inválida.");

export const esquemaDestaque = z
  .object({
    tipo: z.enum(TIPOS_DESTAQUE, { error: "Escolha o tipo do destaque." }),
    eventoId: uuidOuVazio("Evento inválido."),
    titulo: textoLimpo(3, TITULO_DESTAQUE_MAXIMO, "o título"),
    texto: textoOpcional(TEXTO_DESTAQUE_MAXIMO, "Texto").transform((v) => v.replace(/\s+/g, " ")),
    link: linkDoDestaque,
    comercio: nomeOpcional("Comércio citado"),
    autorizadoPor: nomeOpcional("Autorizado por"),
    autorizadoEm: dataOpcional,
    inicio: z.iso.date("Informe o primeiro dia."),
    fim: z.iso.date("Informe o último dia."),
    ordem: z.coerce.number({ error: "Ordem inválida." }).int("Ordem inválida.").min(0, "Ordem inválida.").max(999, "Ordem: no máximo 999."),
    ligado: z.enum(["sim", "nao"]).transform((v) => v === "sim"),
  })
  .refine((d) => d.fim >= d.inicio, { path: ["fim"], message: "O último dia não pode vir antes do primeiro." })
  .refine((d) => d.tipo !== "evento" || d.eventoId !== "", { path: ["eventoId"], message: "Escolha o evento da Agenda." })
  .refine((d) => d.tipo === "evento" || d.link !== "", { path: ["link"], message: "Informe o link do destaque." })
  .refine((d) => d.comercio === "" || (d.autorizadoPor !== "" && d.autorizadoEm !== ""), {
    path: ["autorizadoPor"],
    message: "Comércio citado: informe quem autorizou a divulgação e em que dia.",
  });

export type DestaqueValidado = z.output<typeof esquemaDestaque>;
