// Cadastro do artista pela janela da programação, sem sair da página do evento
// (decisões de 26/11/2026): nome e estilos, com a resposta em JSON para a tela
// escolher o artista novo. O middleware só deixa passar administrador com a
// segunda etapa; o RLS de artistas também só deixa a administração gravar.
import type { APIRoute } from "astro";
import { cadastrarArtistaRapido } from "@/lib/agenda";
import { limparCacheDoSite } from "@/lib/arquivos";

const TAMANHO_MAXIMO = 16 * 1024;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const supabase = locals.supabase!;
  const tamanho = Number(request.headers.get("content-length") ?? "0");
  if (!tamanho || tamanho > TAMANHO_MAXIMO) {
    return Response.json({ ok: false, erro: { codigo: "DADOS_INVALIDOS", mensagem: "Envio inválido." } }, { status: 400 });
  }
  const r = await cadastrarArtistaRapido(supabase, await request.formData());
  if (!r.ok) return Response.json(r, { status: r.erro.codigo === "ERRO_INTERNO" ? 500 : 400 });
  // O artista novo aparece em /artistas.
  await limparCacheDoSite(url.origin);
  return Response.json(r);
};
