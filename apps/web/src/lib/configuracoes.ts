// Configurações gerais na administração (decisão N4, 27/10/2026): abertura ao
// público, prazo dos Fundadores, tolerância depois do vencimento e percentual
// da carteira do representante, na tabela configuracoes (auditada). Gravadas
// numa operação só, para não ficar metade alterada.
import type { Resultado } from "@acheaqui/types";
import { esquemaConfiguracoesGerais, mensagensPorCampo, type ConfiguracoesGerais } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { limparCacheDoSite } from "./arquivos";

type CodigoFalha = "DADOS_INVALIDOS" | "SEM_PERMISSAO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string; campos?: Record<string, string> } };
const falha = (codigo: CodigoFalha, mensagem: string, campos?: Record<string, string>): Falha => ({ ok: false, erro: { codigo, mensagem, campos } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
const CIDADE = "rio-das-ostras";

function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

/** Campo da tela → chave na tabela configuracoes. */
const CHAVES: Record<keyof ConfiguracoesGerais, string> = {
  aberturaAoPublico: "abertura_ao_publico",
  prazoFundador: "prazo_fundador",
  toleranciaVencimentoDias: "tolerancia_vencimento_dias",
  percentualCarteira: "percentual_carteira",
};
const CAMPOS = Object.keys(CHAVES) as (keyof ConfiguracoesGerais)[];

async function idDaCidade(supabase: SupabaseClient): Promise<Resultado<string>> {
  const { data, error } = await supabase.from("cidades").select("id").eq("slug", CIDADE).single();
  return error ? mensagemDoBanco(error, "configuracoes: cidade") : { ok: true, dados: data.id as string };
}

export async function lerConfiguracoesGerais(supabase: SupabaseClient): Promise<Resultado<Record<keyof ConfiguracoesGerais, string>>> {
  const cidade = await idDaCidade(supabase);
  if (!cidade.ok) return cidade;
  const { data, error } = await supabase.from("configuracoes").select("chave, valor").eq("cidade_id", cidade.dados).in("chave", Object.values(CHAVES));
  if (error) return mensagemDoBanco(error, "lerConfiguracoesGerais");
  const valor = (campo: keyof ConfiguracoesGerais) => {
    const v = data.find((l) => l.chave === CHAVES[campo])?.valor;
    return v === undefined || v === null ? "" : String(v);
  };
  return { ok: true, dados: Object.fromEntries(CAMPOS.map((c) => [c, valor(c)])) as Record<keyof ConfiguracoesGerais, string> };
}

export async function salvarConfiguracoesGerais(supabase: SupabaseClient, form: FormData, origemDoSite: string): Promise<Resultado<null>> {
  const lido = esquemaConfiguracoesGerais.safeParse(Object.fromEntries(CAMPOS.map((c) => [c, String(form.get(c) ?? "").slice(0, 20)])));
  if (!lido.success) return falha("DADOS_INVALIDOS", lido.error.issues[0]!.message, mensagensPorCampo(lido.error));
  const cidade = await idDaCidade(supabase);
  if (!cidade.ok) return cidade;
  const linhas = CAMPOS.map((c) => ({ cidade_id: cidade.dados, chave: CHAVES[c], valor: lido.data[c], atualizado_em: new Date().toISOString() }));
  const { error } = await supabase.from("configuracoes").upsert(linhas, { onConflict: "cidade_id,chave" });
  if (error) return mensagemDoBanco(error, "salvarConfiguracoesGerais");
  // As páginas de Fundadores, Anuncie e Patrocine mostram o prazo e a tolerância.
  await limparCacheDoSite(origemDoSite);
  return { ok: true, dados: null };
}
