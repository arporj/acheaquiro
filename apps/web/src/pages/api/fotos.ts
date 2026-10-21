// Envio (POST) e exclusão (DELETE) de fotos dos perfis. Só com login (o
// middleware recusa sem sessão); a permissão sobre o perfil é conferida pelo
// banco (RLS). O navegador manda as três versões já reduzidas e convertidas.
import type { APIRoute } from "astro";
import type { Resultado } from "@acheaqui/types";
import { TAMANHO_MAXIMO_FOTO, TAMANHOS_FOTO, type TamanhoFoto } from "@acheaqui/validation";
import { apagarFoto, enviarFoto, type FinalidadeFoto } from "@/lib/fotos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FINALIDADES: readonly FinalidadeFoto[] = ["perfil", "galeria", "produto"];
/** Três versões de até 2 MB e os campos de texto. */
const TAMANHO_MAXIMO_PEDIDO = 3 * TAMANHO_MAXIMO_FOTO + 64 * 1024;

const STATUS: Record<string, number> = {
  DADOS_INVALIDOS: 400,
  ARQUIVO_INVALIDO: 400,
  NAO_ENCONTRADO: 404,
  LIMITE_DO_PLANO: 409,
  LIMITE_DE_REQUISICOES: 429,
  ERRO_INTERNO: 500,
};

function responder<T>(resultado: Resultado<T>, statusDeSucesso = 200): Response {
  const status = resultado.ok ? statusDeSucesso : (STATUS[resultado.erro.codigo] ?? 400);
  return Response.json(resultado, { status, headers: { "Cache-Control": "private, no-store" } });
}

const invalido = (mensagem: string) => responder({ ok: false, erro: { codigo: "DADOS_INVALIDOS", mensagem } });

export const POST: APIRoute = async ({ request, locals }) => {
  const tamanho = Number(request.headers.get("content-length") ?? "0");
  if (!tamanho || tamanho > TAMANHO_MAXIMO_PEDIDO) return invalido("Envio vazio ou maior que o permitido (3 versões de até 2 MB).");

  const formulario = await request.formData();
  const anuncianteId = String(formulario.get("anunciante") ?? "");
  const finalidade = String(formulario.get("finalidade") ?? "") as FinalidadeFoto;
  const parId = String(formulario.get("par") ?? "");
  const papel = String(formulario.get("papel_no_par") ?? "");
  if (!UUID.test(anuncianteId)) return invalido("Perfil inválido.");
  if (!FINALIDADES.includes(finalidade)) return invalido("Tipo de foto inválido.");
  if ((parId || papel) && (!UUID.test(parId) || (papel !== "antes" && papel !== "depois") || finalidade !== "galeria")) {
    return invalido("Par de antes e depois inválido.");
  }

  const versoes: Partial<Record<TamanhoFoto, Uint8Array>> = {};
  for (const tamanhoFoto of TAMANHOS_FOTO) {
    const arquivo = formulario.get(`foto_${tamanhoFoto}`);
    if (arquivo instanceof File) versoes[tamanhoFoto] = new Uint8Array(await arquivo.arrayBuffer());
  }

  const resultado = await enviarFoto(locals.supabase!, locals.usuario!.id, {
    anuncianteId,
    finalidade,
    legenda: String(formulario.get("legenda") ?? ""),
    par: parId ? { id: parId, papel: papel as "antes" | "depois" } : undefined,
    versoes,
  });
  return responder(resultado, 201);
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  const id = url.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return invalido("Foto inválida.");
  return responder(await apagarFoto(locals.supabase!, id));
};
