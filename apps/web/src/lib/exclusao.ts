// Exclusão da conta pelo anunciante ou cliente (LGPD; decisões X1 a X6 de
// 24/11/2026). O banco faz a exclusão (public.excluir_minha_conta,
// migration 20261124162128) e põe os arquivos públicos na fila
// arquivos_para_apagar; o site confere a senha antes e apaga os arquivos do R2,
// que o banco não alcança. Regra da tela em opcoesDeExclusao (packages/domain).
import { type SituacaoParaExcluir } from "@acheaqui/domain";
import { entrar } from "@acheaqui/supabase-client";
import type { Resultado } from "@acheaqui/types";
import { caminhoEncarte, caminhosFoto, apagarArquivosPublicos, limparCacheDoSite } from "./arquivos";
import { clienteServico } from "./sessao";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type CodigoFalha = "DADOS_INVALIDOS" | "SEM_PERMISSAO" | "CONFLITO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string } };
const falha = (codigo: CodigoFalha, mensagem: string): Falha => ({ ok: false, erro: { codigo, mensagem } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");

/** Mensagem das travas do banco (P0001) pode ir para a tela; o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("CONFLITO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

/** Período pago, último pagamento e exclusão agendada da conta logada. */
export async function lerSituacaoParaExcluir(supabase: SupabaseClient, hoje: string): Promise<Resultado<SituacaoParaExcluir>> {
  const { data, error } = await supabase.rpc("situacao_da_minha_conta");
  if (error) return mensagemDoBanco(error, "lerSituacaoParaExcluir");
  const d = (data ?? {}) as { pagoAte?: string | null; ultimoPagamento?: string | null; exclusaoEm?: string | null };
  return { ok: true, dados: { hoje, pagoAte: d.pagoAte ?? null, ultimoPagamento: d.ultimoPagamento ?? null, exclusaoEm: d.exclusaoEm ?? null } };
}

/**
 * Confere a senha com a mesma entrada do login (limite por conexão, bloqueio
 * depois de 5 senhas erradas e o Turnstile), num cliente à parte, sem tocar nos
 * cookies da sessão aberta.
 */
async function conferirSenha(email: string, senha: string, tokenRobo: string, ip: string): Promise<Resultado<null>> {
  const avulso = createClient(import.meta.env.PUBLIC_SUPABASE_URL ?? "", import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const r = await entrar(avulso, clienteServico(), { email, senha, tokenRobo, ip });
  if (r.ok) {
    // A sessão avulsa não fica: sai dela sem encerrar a sessão aberta no navegador.
    const { error } = await avulso.auth.signOut({ scope: "local" });
    if (error) console.error("conferirSenha: saída da sessão avulsa falhou", { codigo: error.code, mensagem: error.message });
    return { ok: true, dados: null };
  }
  if (r.erro.codigo === "ERRO_INTERNO") return ERRO_INTERNO;
  return falha("SEM_PERMISSAO", r.erro.mensagem);
}

/**
 * Exclui a conta logada, conferida a senha. manter: com período pago em vigor,
 * agenda a exclusão para o fim dele (X2); sem, apaga já e sai da sessão.
 */
export async function excluirConta(
  supabase: SupabaseClient,
  pedido: { email: string; senha: string; tokenRobo: string; ip: string; manter: boolean; origemDoSite: string },
): Promise<Resultado<{ agendadaPara: string | null }>> {
  if (!pedido.senha) return falha("DADOS_INVALIDOS", "Digite a sua senha para confirmar.");
  if (!pedido.tokenRobo) return falha("DADOS_INVALIDOS", "Confirme que você não é um robô.");
  const senha = await conferirSenha(pedido.email, pedido.senha, pedido.tokenRobo, pedido.ip);
  if (!senha.ok) return senha;

  const { data, error } = await supabase.rpc("excluir_minha_conta", { p_manter: pedido.manter });
  if (error) return mensagemDoBanco(error, "excluirConta");
  const r = data as { excluida?: boolean; agendadaPara?: string };
  if (r.agendadaPara) return { ok: true, dados: { agendadaPara: r.agendadaPara } };

  // A conta já não existe: limpa os cookies da sessão, apaga os arquivos e tira o perfil do cache.
  const { error: erroSaida } = await supabase.auth.signOut({ scope: "local" });
  if (erroSaida) console.error("excluirConta: limpeza da sessão falhou", { codigo: erroSaida.code, mensagem: erroSaida.message });
  await apagarArquivosDaFila();
  await limparCacheDoSite(pedido.origemDoSite);
  return { ok: true, dados: { agendadaPara: null } };
}

export async function desistirDaExclusao(supabase: SupabaseClient): Promise<Resultado<null>> {
  const { error } = await supabase.rpc("desistir_da_exclusao");
  if (error) return mensagemDoBanco(error, "desistirDaExclusao");
  return { ok: true, dados: null };
}

/** Caminhos no R2 de um item da fila: as fotos e cartazes em JPEG ou WebP; o encarte em WebP, JPEG ou PDF. */
function caminhosDoItem(tipo: string, chave: string): string[] {
  if (tipo === "encarte") return [caminhoEncarte(chave, "webp"), caminhoEncarte(chave, "jpeg"), caminhoEncarte(chave, "pdf")];
  return [...caminhosFoto(chave, "jpeg"), ...caminhosFoto(chave, "webp")];
}

/**
 * Apaga do R2 os arquivos da fila e tira da fila o que foi apagado (até 200 por
 * vez). Chamada logo depois da exclusão e pelo pg_cron, nas exclusões agendadas
 * (/api/tarefas/apagar-arquivos). Apagar de novo um arquivo que não existe não faz mal.
 */
export async function apagarArquivosDaFila(): Promise<number> {
  const servico = clienteServico();
  const { data, error } = await servico.from("arquivos_para_apagar").select("id, tipo, chave").order("criado_em").limit(200);
  if (error) {
    console.error("apagarArquivosDaFila: leitura da fila falhou", { codigo: error.code, mensagem: error.message });
    return 0;
  }
  if (!data || data.length === 0) return 0;
  try {
    await apagarArquivosPublicos(data.flatMap((item) => caminhosDoItem(item.tipo as string, item.chave as string)));
  } catch (e) {
    console.error("apagarArquivosDaFila: R2 falhou", { erro: e instanceof Error ? e.message : String(e) });
    return 0;
  }
  const { error: erroFila } = await servico
    .from("arquivos_para_apagar")
    .delete()
    .in(
      "id",
      data.map((item) => item.id as string),
    );
  if (erroFila) console.error("apagarArquivosDaFila: limpeza da fila falhou", { codigo: erroFila.code, mensagem: erroFila.message });
  return data.length;
}
