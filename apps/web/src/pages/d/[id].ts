// Clique num destaque do bloco "Acontece em Rio das Ostras" (decisão J5 de
// 24/11/2026): /d/[id] conta o clique e leva ao destino (página do site ou
// endereço externo). Cliques repetidos do mesmo visitante em 30 minutos contam
// uma vez (no banco), e o banco recebe só o resumo do visitante, nunca o IP.
// Destaque fora do ar (ou falha) leva à página inicial.
import type { APIRoute } from "astro";
import { cliqueNoDestaque } from "@/dados/consultas";
import { resumoDoVisitante } from "@/lib/visitante";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const GET: APIRoute = async ({ params, request }) => {
  const id = params.id ?? "";
  const destino = UUID.test(id) ? await cliqueNoDestaque(id, await resumoDoVisitante(request)) : undefined;
  return new Response(null, {
    status: 302,
    headers: { Location: destino ?? "/", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
};
