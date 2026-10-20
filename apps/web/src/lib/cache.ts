// Cache das páginas públicas na Cloudflare (Workers Cache). Enquanto a página
// está no cache, o acesso nem executa o Worker (não gasta processamento).
// Cada página liga o cache só depois de saber que o conteúdo existe: a página
// "não encontrada" fica fora, para um perfil recém-publicado não continuar
// "não encontrado". A limpeza a cada alteração de perfil entra na etapa 3.
import type { AstroGlobal } from "astro";

/** Depois deste tempo, a página é refeita no próximo acesso. */
export const SEGUNDOS_NO_CACHE = 300;
/**
 * Até este tempo, o visitante recebe a versão guardada na hora e o Worker
 * refaz a página em segundo plano: o visitante não espera o processamento.
 */
export const SEGUNDOS_VERSAO_ANTIGA = 86_400;

export function guardarNoCache(Astro: Pick<AstroGlobal, "cache">): void {
  Astro.cache.set({ maxAge: SEGUNDOS_NO_CACHE, swr: SEGUNDOS_VERSAO_ANTIGA });
}
