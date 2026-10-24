import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Confere se o código do link /r/codigo é de um representante ativo. Na falha
 * da consulta, aceita o código: perder a indicação é pior do que guardar um
 * código que a equipe confere depois.
 */
export async function codigoRepresentanteValido(cliente: SupabaseClient, codigo: string): Promise<boolean> {
  const { data, error } = await cliente.rpc("codigo_representante_valido", { p_codigo: codigo });
  if (error) {
    console.error("codigoRepresentanteValido falhou", { codigo: error.code, mensagem: error.message });
    return true;
  }
  return data === true;
}
