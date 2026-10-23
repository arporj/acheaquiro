// Acesso ao Supabase (especificação técnica, seção 5). Depende só de
// packages/types; a aplicação passa a URL e as chaves, que vêm do ambiente.
export { criarClientePublico, type ConfiguracaoSupabase } from "./publico";
export { criarClienteServidor, type CookieParaGravar, type CookiesDaRequisicao } from "./servidor";
export { criarClienteServico } from "./servico";
export { lerCatalogoPublico } from "./catalogo";
export { lerAnunciantePublico, lerAnunciantesPublicos, type FiltroAnunciantes } from "./anunciantes";
export { entrar, limitarRecuperacaoSenha, registrarAcesso, type ResultadoEntrada } from "./acesso";
export { lerPatrocinioPublico, registrarCliquePatrocinio } from "./patrocinio";
