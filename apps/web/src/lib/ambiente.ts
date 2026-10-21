// Qual dos três sites este build é. Vem de PUBLIC_AMBIENTE, no arquivo
// .env.<modo> de cada build (decisão de 21/10/2026):
// - "producao": o site real, com banco e login. Em prod.acheaquiro.com.br até
//   a abertura; em acheaquiro.com.br a partir de 27/11/2026.
// - "apresentacao": teste.acheaquiro.com.br, com anunciantes fictícios e sem
//   login (não acessa o banco real).
// - "em-breve": acheaquiro.com.br até a abertura, só com o aviso "abre em 27/11".
export type Ambiente = "producao" | "apresentacao" | "em-breve";

const AMBIENTES: readonly Ambiente[] = ["producao", "apresentacao", "em-breve"];

function lerAmbiente(valor: string | undefined): Ambiente {
  // Sem a variável, é o build padrão (astro build), que é o de produção.
  if (!valor) return "producao";
  if ((AMBIENTES as readonly string[]).includes(valor)) return valor as Ambiente;
  throw new Error(`PUBLIC_AMBIENTE inválido: "${valor}". Use ${AMBIENTES.join(", ")}.`);
}

export const ambiente: Ambiente = lerAmbiente(import.meta.env.PUBLIC_AMBIENTE);

/**
 * Abertura ao público (AAAA-MM-DD), para a página "em breve", que não acessa o
 * banco. O sistema real lê a data de configuracoes.abertura_ao_publico.
 */
export const ABERTURA = "2026-11-27";
