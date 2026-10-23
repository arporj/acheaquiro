// Arquivos públicos (fotos e encartes) no bucket acheaqui-midia, servidos em
// arquivos.acheaquiro.com.br com o cache da Cloudflare. Os endereços nunca se
// repetem (cada envio ganha um código novo), por isso o cache pode durar um
// ano; quando um arquivo sai do ar, o cache daquele endereço é limpo na hora.
import { TAMANHOS_FOTO, type FormatoFoto, type TamanhoFoto } from "@acheaqui/validation";
import { env } from "cloudflare:workers";

export const ENDERECO_ARQUIVOS = "https://arquivos.acheaquiro.com.br";

/** Zona acheaquiro.com.br na Cloudflare (não é segredo); usada para limpar o cache. */
const ZONA_CLOUDFLARE = "eee3470af1941808ebcd27b5352bf77a";

const EXTENSAO: Record<FormatoFoto | "pdf", string> = { webp: "webp", jpeg: "jpg", pdf: "pdf" };
const TIPO_CONTEUDO: Record<FormatoFoto | "pdf", string> = { webp: "image/webp", jpeg: "image/jpeg", pdf: "application/pdf" };

export function caminhoFoto(chave: string, tamanho: TamanhoFoto, formato: FormatoFoto): string {
  return `${chave}-${tamanho}.${EXTENSAO[formato]}`;
}

export function caminhoEncarte(chave: string, formato: FormatoFoto | "pdf"): string {
  return `${chave}.${EXTENSAO[formato]}`;
}

export function enderecoPublico(caminho: string): string {
  return `${ENDERECO_ARQUIVOS}/${caminho}`;
}

function bucketMidia(): BucketR2 {
  if (!env.MIDIA) throw new Error("Bucket MIDIA não ligado a este Worker (só a produção tem).");
  return env.MIDIA;
}

export async function gravarArquivoPublico(caminho: string, conteudo: Uint8Array, formato: FormatoFoto | "pdf"): Promise<void> {
  await bucketMidia().put(caminho, conteudo, {
    httpMetadata: { contentType: TIPO_CONTEUDO[formato], cacheControl: "public, max-age=31536000, immutable" },
  });
}

/**
 * Apaga os arquivos e limpa o cache dos endereços. Sem a limpeza, o arquivo
 * apagado continuaria aparecendo por até um ano, o que não serve para conteúdo
 * denunciado (Marco Civil, art. 21).
 */
export async function apagarArquivosPublicos(caminhos: string[]): Promise<void> {
  if (caminhos.length === 0) return;
  await bucketMidia().delete(caminhos);
  await limparCache(caminhos.map(enderecoPublico));
}

/** Limpa endereços do cache da Cloudflare (arquivos e páginas). */
export async function limparCache(enderecos: string[]): Promise<void> {
  const token = env.CLOUDFLARE_LIMPEZA_CACHE_TOKEN;
  if (!token || !ZONA_CLOUDFLARE) {
    console.error("limparCache: token ou zona não configurados; o arquivo apagado pode seguir no cache", { enderecos });
    return;
  }
  // A API aceita até 30 endereços por pedido.
  for (let i = 0; i < enderecos.length; i += 30) {
    const resposta = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONA_CLOUDFLARE}/purge_cache`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ files: enderecos.slice(i, i + 30) }),
    });
    if (!resposta.ok) {
      console.error("limparCache: a Cloudflare recusou", { status: resposta.status, corpo: (await resposta.text()).slice(0, 500) });
    }
  }
}

/**
 * Limpa do cache todas as páginas de um site (pelo endereço dele), para mudanças
 * que aparecem em todas as páginas, como o link "Patrocine" do cabeçalho.
 */
export async function limparCacheDoSite(origem: string): Promise<void> {
  const token = env.CLOUDFLARE_LIMPEZA_CACHE_TOKEN;
  if (!token || !ZONA_CLOUDFLARE) {
    console.error("limparCacheDoSite: token ou zona não configurados; as páginas seguem no cache até vencer", { origem });
    return;
  }
  const resposta = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONA_CLOUDFLARE}/purge_cache`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ hosts: [new URL(origem).host] }),
  });
  if (!resposta.ok) {
    console.error("limparCacheDoSite: a Cloudflare recusou", { status: resposta.status, corpo: (await resposta.text()).slice(0, 500) });
  }
}

/** Os três caminhos de uma foto (um por tamanho). */
export function caminhosFoto(chave: string, formato: FormatoFoto): string[] {
  return TAMANHOS_FOTO.map((tamanho) => caminhoFoto(chave, tamanho, formato));
}
