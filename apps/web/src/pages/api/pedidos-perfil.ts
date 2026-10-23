// Pedidos sobre o perfil de um comércio importado da Receita: assumir, remover
// ou informar que fechou (decisão de 23/10/2026). Aberto ao visitante, com o
// Turnstile, validação no servidor e limite por conexão. O pedido não muda o
// perfil: entra na fila da administração, que confere quem pediu.
import type { APIRoute } from "astro";
import type { Resultado } from "@acheaqui/types";
import { registrarPedidoPerfil } from "@acheaqui/supabase-client";
import { esquemaPedidoPerfil } from "@acheaqui/validation";
import { ambiente } from "@/lib/ambiente";
import { clienteServico } from "@/lib/sessao";
import { conferirTurnstile } from "@/lib/turnstile";
import { resumoDoVisitante } from "@/lib/visitante";

const TAMANHO_MAXIMO_PEDIDO = 16 * 1024;

const STATUS: Record<string, number> = {
  DADOS_INVALIDOS: 400,
  VERIFICACAO_ROBO_FALHOU: 400,
  NAO_ENCONTRADO: 404,
  LIMITE_DE_REQUISICOES: 429,
  ERRO_INTERNO: 500,
};

function responder<T>(resultado: Resultado<T>, statusDeSucesso = 200): Response {
  const status = resultado.ok ? statusDeSucesso : (STATUS[resultado.erro.codigo] ?? 400);
  return Response.json(resultado, { status, headers: { "Cache-Control": "private, no-store" } });
}

const ERRO_INTERNO = { ok: false, erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível enviar agora. Tente de novo em instantes." } } as const;

export const POST: APIRoute = async ({ request }) => {
  // Só a produção tem banco; o site de apresentação e o "em breve" não recebem pedidos.
  if (ambiente !== "producao") return responder({ ok: false, erro: { codigo: "NAO_ENCONTRADO", mensagem: "Este site não recebe pedidos." } });

  const tamanho = Number(request.headers.get("content-length") ?? "0");
  if (!tamanho || tamanho > TAMANHO_MAXIMO_PEDIDO) {
    return responder({ ok: false, erro: { codigo: "DADOS_INVALIDOS", mensagem: "Pedido vazio ou grande demais." } });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch (erro) {
    console.warn("pedidos-perfil: corpo não é JSON", { erro: String(erro) });
    return responder({ ok: false, erro: { codigo: "DADOS_INVALIDOS", mensagem: "Pedido inválido." } });
  }

  const token = typeof corpo.tokenRobo === "string" ? corpo.tokenRobo.slice(0, 4096) : "";
  const humano = token ? await conferirTurnstile(token, request.headers.get("cf-connecting-ip")) : false;
  if (humano === null) return responder(ERRO_INTERNO);
  if (!humano) {
    return responder({ ok: false, erro: { codigo: "VERIFICACAO_ROBO_FALHOU", mensagem: "Não conseguimos confirmar que você não é um robô. Tente de novo." } });
  }

  const validacao = esquemaPedidoPerfil.safeParse(corpo);
  if (!validacao.success) {
    const campos = Object.fromEntries(validacao.error.issues.map((i) => [String(i.path[0] ?? "pedido"), i.message]));
    return responder({ ok: false, erro: { codigo: "DADOS_INVALIDOS", mensagem: "Confira os campos destacados.", campos } });
  }

  return responder(await registrarPedidoPerfil(clienteServico(), validacao.data, await resumoDoVisitante(request)), 201);
};
