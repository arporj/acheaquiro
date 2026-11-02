// Verificação enquanto o administrador digita no convite e no "Gerenciar" da
// equipe (decisão de 02/11/2026): ?email= devolve a situação do e-mail;
// ?codigo= diz se o código do representante está livre (com &usuario= ou
// &email=, o código atual dessa pessoa conta como livre). O middleware só deixa
// passar administrador com a segunda etapa; o envio do formulário confere tudo
// de novo no servidor.
import type { APIRoute } from "astro";
import { situacaoDoEmail, verificarCodigo } from "@/lib/equipe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const GET: APIRoute = async ({ url, locals }) => {
  const supabase = locals.supabase!;
  const email = (url.searchParams.get("email") ?? "").slice(0, 254);
  const codigo = url.searchParams.get("codigo");

  if (codigo !== null) {
    let dono = url.searchParams.get("usuario");
    if (dono && !UUID.test(dono)) dono = null;
    if (!dono && email) {
      const situacao = await situacaoDoEmail(supabase, email);
      if (situacao.ok && situacao.dados.situacao !== "livre") dono = situacao.dados.usuario_id;
    }
    const resultado = await verificarCodigo(supabase, codigo.trim().toLowerCase().slice(0, 30), dono);
    return Response.json(resultado, { status: resultado.ok ? 200 : 500 });
  }

  const resultado = await situacaoDoEmail(supabase, email);
  if (!resultado.ok) return Response.json(resultado, { status: resultado.erro.codigo === "DADOS_INVALIDOS" ? 400 : 500 });
  // Só o que a tela usa: a situação, o nome e o código atual (para preencher o formulário na reativação).
  const d = resultado.dados;
  return Response.json({
    ok: true,
    dados: d.situacao === "livre" ? d : { situacao: d.situacao, nome: d.nome, papel: d.papel, codigo_representante: d.codigo_representante },
  });
};
