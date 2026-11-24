// Acesso ao Supabase (especificação técnica, seção 5). Depende só de
// packages/types; a aplicação passa a URL e as chaves, que vêm do ambiente.
export { criarClientePublico, type ConfiguracaoSupabase } from "./publico";
export { criarClienteServidor, type CookieParaGravar, type CookiesDaRequisicao } from "./servidor";
export { criarClienteServico } from "./servico";
export { lerCatalogoPublico } from "./catalogo";
export { lerAnunciantePublico, lerAnunciantesPublicos, type FiltroAnunciantes } from "./anunciantes";
export { criarConta, entrar, limitarRecuperacaoSenha, registrarAcesso, type ResultadoEntrada } from "./acesso";
export { lerPatrocinioPublico, registrarCliquePatrocinio } from "./patrocinio";
export { registrarPedidoPerfil, type PedidoPerfilValidado } from "./pedidos";
export { registrarDenuncia, type DenunciaValidada } from "./denuncias";
export { codigoRepresentanteValido } from "./representantes";
export { lerArtistasPublicos, lerEventoPublico, lerEventosDoArtista, lerEventosPublicos, type ArtistaDoBanco, type EventoDoBanco } from "./agenda";
