interface ImportMetaEnv {
  /** Qual dos três sites é este build (src/lib/ambiente.ts). Sem valor: "producao". */
  readonly PUBLIC_AMBIENTE?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
