// Texto do contador de visitas, para os três sites (decisão de 07/11/2026). Só a
// produção tem o token; o site de exemplo e o "em breve" buscam aqui, por isso a
// resposta é aberta a qualquer origem: é um texto público, sem dado de ninguém.
// Com o cache de um dia, a Cloudflare é consultada no máximo uma vez por dia.
import { numeroDoContadorDeVisitas, textoDoContadorDeVisitas } from "@acheaqui/domain";
import type { APIRoute } from "astro";
import { ambiente } from "@/lib/ambiente";
import { totalDeVisitas } from "@/lib/visitas";

const UM_DIA = 86_400;

export const GET: APIRoute = async ({ cache }) => {
  const cabecalhos = { "Access-Control-Allow-Origin": "*" };
  if (ambiente !== "producao") return new Response(null, { status: 404, headers: cabecalhos });

  const total = await totalDeVisitas();
  // Na falha, não guarda: a próxima visita tenta de novo.
  if (total === null) return Response.json({ texto: null, numero: null }, { status: 503, headers: { ...cabecalhos, "Cache-Control": "no-store" } });

  cache.set({ maxAge: UM_DIA, swr: UM_DIA });
  // "texto" continua para as páginas que ainda estão no cache com a versão antiga do contador.
  return Response.json({ texto: textoDoContadorDeVisitas(total), numero: numeroDoContadorDeVisitas(total) }, { headers: cabecalhos });
};
