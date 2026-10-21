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

/** Segredos do Worker (wrangler secret put; no desenvolvimento, .env.local). */
declare module "cloudflare:workers" {
  export const env: {
    readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  };
}
