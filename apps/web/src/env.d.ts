interface ImportMetaEnv {
  /** Qual dos três sites é este build (src/lib/ambiente.ts). Sem valor: "producao". */
  readonly PUBLIC_AMBIENTE?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  /** Chave do site do Turnstile (pública), mostrada nas telas de acesso. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    /** Só nas páginas com login (src/middleware.ts). */
    supabase?: import("@supabase/supabase-js").SupabaseClient;
    usuario?: import("./lib/sessao").UsuarioLogado | null;
  }
}

/** O que o Worker usa de um bucket do R2 (ligação em wrangler.jsonc). */
interface BucketR2 {
  put(
    chave: string,
    conteudo: ArrayBuffer | Uint8Array,
    opcoes?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>;
  delete(chaves: string | string[]): Promise<void>;
}

/** Segredos e ligações do Worker (wrangler secret put; no desenvolvimento, .env.local). */
declare module "cloudflare:workers" {
  export const env: {
    readonly SUPABASE_SERVICE_ROLE_KEY?: string;
    /** Token da Cloudflare só com permissão de limpar o cache do domínio (remoção de fotos). */
    readonly CLOUDFLARE_LIMPEZA_CACHE_TOKEN?: string;
    /** Só na produção. */
    readonly MIDIA?: BucketR2;
    readonly DOCUMENTOS?: BucketR2;
  };
}
