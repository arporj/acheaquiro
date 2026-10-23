// Pedidos sobre o perfil de um comércio importado da Receita (assumir, remover,
// informar que fechou), gravados em pedidos_perfil com a chave service_role:
// o visitante não grava direto (RLS). O pedido não muda o perfil: só entra na
// fila da administração, que confere quem pediu antes de agir.
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Pedido já validado (esquemaPedidoPerfil, em packages/validation). */
export type PedidoPerfilValidado =
  | {
      tipo: "assumir" | "remover";
      anuncianteId: string;
      mensagem: string;
      nome: string;
      email: string;
      telefone: string;
      declaracao: true;
    }
  | { tipo: "fechou"; anuncianteId: string; mensagem: string };

const PEDIDOS_POR_CONEXAO = 10;
const JANELA_CONEXAO_SEGUNDOS = 60 * 60;
/** O mesmo pedido do mesmo visitante no mesmo perfil conta uma vez por dia. */
const JANELA_REPETIDO_SEGUNDOS = 24 * 60 * 60;

const ERRO_INTERNO = {
  ok: false,
  erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível enviar agora. Tente de novo em instantes." },
} as const;

async function consumir(servico: SupabaseClient, chave: string, limite: number, janela: number): Promise<boolean | null> {
  const { data, error } = await servico.rpc("consumir_limite", { p_chave: chave, p_limite: limite, p_janela_segundos: janela });
  if (error) {
    console.error("registrarPedidoPerfil: consumir_limite falhou", { codigo: error.code, mensagem: error.message });
    return null;
  }
  return data as boolean;
}

/**
 * @param visitante resumo do visitante (hash do IP com o navegador), nunca o IP.
 */
export async function registrarPedidoPerfil(
  servico: SupabaseClient,
  pedido: PedidoPerfilValidado,
  visitante: string,
): Promise<Resultado<null>> {
  const porConexao = await consumir(servico, `pedido-perfil:${visitante}`, PEDIDOS_POR_CONEXAO, JANELA_CONEXAO_SEGUNDOS);
  if (porConexao === null) return ERRO_INTERNO;
  if (!porConexao) {
    return { ok: false, erro: { codigo: "LIMITE_DE_REQUISICOES", mensagem: "Muitos pedidos a partir desta conexão. Tente de novo daqui a 1 hora." } };
  }

  const { data: anunciante, error: erroAnunciante } = await servico
    .from("anunciantes")
    .select("id")
    .eq("id", pedido.anuncianteId)
    .eq("status", "publicado")
    .eq("origem", "receita")
    .maybeSingle();
  if (erroAnunciante) {
    console.error("registrarPedidoPerfil: leitura do perfil falhou", { codigo: erroAnunciante.code, mensagem: erroAnunciante.message });
    return ERRO_INTERNO;
  }
  if (!anunciante) return { ok: false, erro: { codigo: "NAO_ENCONTRADO", mensagem: "Este perfil não aceita pedidos." } };

  // Repetido: responde como enviado, sem gravar de novo (não infla a fila).
  const primeiro = await consumir(servico, `pedido-perfil:${pedido.anuncianteId}:${pedido.tipo}:${visitante}`, 1, JANELA_REPETIDO_SEGUNDOS);
  if (primeiro === null) return ERRO_INTERNO;
  if (!primeiro) return { ok: true, dados: null };

  const { error } = await servico.from("pedidos_perfil").insert(
    pedido.tipo === "fechou"
      ? { anunciante_id: pedido.anuncianteId, tipo: pedido.tipo, mensagem: pedido.mensagem }
      : {
          anunciante_id: pedido.anuncianteId,
          tipo: pedido.tipo,
          mensagem: pedido.mensagem,
          nome: pedido.nome,
          email: pedido.email,
          telefone: pedido.telefone,
          declarou_responsavel: pedido.declaracao,
        },
  );
  if (error) {
    console.error("registrarPedidoPerfil: gravação falhou", { codigo: error.code, mensagem: error.message });
    return ERRO_INTERNO;
  }
  return { ok: true, dados: null };
}
