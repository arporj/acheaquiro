// Contato com o patrocinador: /p/[slug] leva ao WhatsApp da empresa. Passar
// por aqui permite contar o clique (ainda não contado: só existem
// patrocinadores no site de apresentação) sem script de terceiros na página.
import type { APIRoute } from "astro";
import { patrocinadorPorSlug } from "@/dados/consultas";
import { linkWhatsApp } from "@/lib/contato";

const MENSAGEM = "Olá! Vi vocês como patrocinadores do Ache Aqui RO e gostaria de uma informação.";

export const GET: APIRoute = async ({ params, rewrite }) => {
  const patrocinador = await patrocinadorPorSlug(params.slug ?? "");
  if (!patrocinador) return rewrite("/404");
  return new Response(null, {
    status: 302,
    headers: { Location: linkWhatsApp(patrocinador.whatsapp, MENSAGEM), "Cache-Control": "no-store" },
  });
};
