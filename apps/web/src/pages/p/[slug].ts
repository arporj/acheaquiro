// Contato com o patrocinador: /p/[slug] conta o clique e leva ao WhatsApp da
// empresa (ou ao card dela, se não informou WhatsApp), sem script de
// terceiros na página. Cliques repetidos do mesmo visitante em 30 minutos
// contam uma vez (no banco). O banco recebe só um resumo do visitante: o hash
// do IP com o navegador e o dia, que não volta a ser o IP e muda todo dia.
// Com ?site, leva ao site da empresa (quando ela informou), contando o clique igual.
import type { APIRoute } from "astro";
import { contarCliquePatrocinador, patrocinadorPorSlug } from "@/dados/consultas";
import { linkWhatsApp } from "@/lib/contato";
import { resumoDoVisitante } from "@/lib/visitante";

const MENSAGEM = "Olá! Vi vocês como patrocinadores do Ache Aqui RO e gostaria de uma informação.";

export const GET: APIRoute = async ({ params, request, rewrite, url }) => {
  const slug = params.slug ?? "";
  const patrocinador = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? await patrocinadorPorSlug(slug) : undefined;
  if (!patrocinador) return rewrite("/404");
  // A falha na contagem fica registrada e não impede o visitante de chegar à empresa.
  await contarCliquePatrocinador(slug, await resumoDoVisitante(request));
  const destino =
    url.searchParams.has("site") && patrocinador.site
      ? patrocinador.site
      : patrocinador.whatsapp
        ? linkWhatsApp(patrocinador.whatsapp, MENSAGEM)
        : `/patrocinadores#${patrocinador.slug}`;
  return new Response(null, { status: 302, headers: { Location: destino, "Cache-Control": "no-store" } });
};
