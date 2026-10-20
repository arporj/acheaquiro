interface ImportMetaEnv {
  /** "true" só no site de apresentação (.env.teste): mostra a faixa de dados fictícios. */
  readonly PUBLIC_SITE_APRESENTACAO?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
