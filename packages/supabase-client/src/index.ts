// Acesso ao Supabase (especificação técnica, seção 5). Depende só de
// packages/types; a aplicação passa a URL e as chaves, que vêm do ambiente.
export { criarClientePublico, type ConfiguracaoSupabase } from "./publico";
export { lerCatalogoPublico } from "./catalogo";
