// Apaga do R2 os arquivos públicos da fila arquivos_para_apagar (exclusão da
// conta, decisões X1 a X6 de 24/11/2026). Chamado pelo pg_cron depois das
// exclusões agendadas (interno.aplicar_exclusoes_agendadas), porque o banco não
// alcança o R2. Sem login: só processa a fila, que só o banco escreve, e chamar
// de novo apenas adianta o que já ia acontecer.
import type { APIRoute } from "astro";
import { ambiente } from "@/lib/ambiente";
import { apagarArquivosDaFila } from "@/lib/exclusao";

export const POST: APIRoute = async () => {
  if (ambiente !== "producao") return new Response(null, { status: 404 });
  const apagados = await apagarArquivosDaFila();
  return Response.json({ apagados }, { headers: { "Cache-Control": "no-store" } });
};
