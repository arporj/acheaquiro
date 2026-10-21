// Catálogo público de uma cidade, numa chamada só (função catalogo_publico,
// migration 20261021130000_catalogo_publico.sql).
import type { CatalogoPublico, Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function lerCatalogoPublico(cliente: SupabaseClient, cidade: string): Promise<Resultado<CatalogoPublico>> {
  const { data, error } = await cliente.rpc("catalogo_publico", { p_cidade: cidade });

  if (error) {
    console.error("catalogo_publico falhou", { cidade, codigo: error.code, mensagem: error.message });
    return {
      ok: false,
      erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível carregar os dados do site. Tente de novo em instantes." },
    };
  }
  if (!data) {
    return { ok: false, erro: { codigo: "NAO_ENCONTRADO", mensagem: "Cidade não encontrada." } };
  }
  return { ok: true, dados: data as CatalogoPublico };
}
