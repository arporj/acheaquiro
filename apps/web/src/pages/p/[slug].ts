// Contato com o patrocinador: /p/[slug] conta o clique e leva ao WhatsApp da
// empresa (ou ao card dela, se não informou WhatsApp), sem script de
// terceiros na página. Cliques repetidos do mesmo visitante em 30 minutos
// contam uma vez (no banco). O banco recebe só um resumo do visitante: o hash
// do IP com o navegador e o dia, que não volta a ser o IP e muda todo dia.
import type { APIRoute } from "astro";
import { contarCliquePatrocinador, hojeNaCidade, patrocinadorPorSlug } from "@/dados/consultas";
import { linkWhatsApp } from "@/lib/contato";

const MENSAGEM = "Olá! Vi vocês como patrocinadores do Ache Aqui RO e gostaria de uma informação.";

async function resumoDoVisitante(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const navegador = (request.headers.get("user-agent") ?? "").slice(0, 200);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${navegador}|${hojeNaCidade()}`));
  return [...new Uint8Array(bytes)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const GET: APIRoute = async ({ params, request, rewrite }) => {
  const slug = params.slug ?? "";
  const patrocinador = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? await patrocinadorPorSlug(slug) : undefined;
  if (!patrocinador) return rewrite("/404");
  // A falha na contagem fica registrada e não impede o visitante de chegar à empresa.
  await contarCliquePatrocinador(slug, await resumoDoVisitante(request));
  const destino = patrocinador.whatsapp ? linkWhatsApp(patrocinador.whatsapp, MENSAGEM) : `/patrocinadores#${patrocinador.slug}`;
  return new Response(null, { status: 302, headers: { Location: destino, "Cache-Control": "no-store" } });
};
