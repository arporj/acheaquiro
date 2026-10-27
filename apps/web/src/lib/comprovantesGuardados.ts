// Comprovantes guardados no bucket privado "comprovantes" do Supabase Storage
// (decisão K2, 27/10/2026): pagamentos dos anunciantes e pagamentos aos
// representantes. Só o administrador envia, lê e apaga (políticas da migration
// 20261027120000). A foto chega do navegador já em WebP (lib/comprovante.ts);
// aqui o tipo é conferido pelos primeiros bytes e os metadados são removidos de
// novo. A leitura é por um endereço temporário.
import type { Resultado } from "@acheaqui/types";
import { ArquivoInvalido, TAMANHO_MAXIMO_PDF, identificarArquivo, limparMetadados } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "comprovantes";
const EXTENSAO = { webp: "webp", jpeg: "jpg", pdf: "pdf" } as const;
const TIPO_CONTEUDO = { webp: "image/webp", jpeg: "image/jpeg", pdf: "application/pdf" } as const;
/** Segundos que o endereço temporário do comprovante vale (5 minutos). */
const SEGUNDOS_ENDERECO = 300;

type Falha = { ok: false; erro: { codigo: "ARQUIVO_INVALIDO" | "ERRO_INTERNO"; mensagem: string } };

function preparar(bytes: Uint8Array): Resultado<{ bytes: Uint8Array; tipo: keyof typeof EXTENSAO }> | Falha {
  if (bytes.length > TAMANHO_MAXIMO_PDF) return { ok: false, erro: { codigo: "ARQUIVO_INVALIDO", mensagem: "O comprovante precisa ter até 5 MB." } };
  const tipo = identificarArquivo(bytes);
  if (tipo === "pdf") return { ok: true, dados: { bytes, tipo } };
  if (tipo !== "webp" && tipo !== "jpeg") return { ok: false, erro: { codigo: "ARQUIVO_INVALIDO", mensagem: "Envie o comprovante como foto ou PDF." } };
  try {
    return { ok: true, dados: { bytes: limparMetadados(bytes, tipo), tipo } };
  } catch (e) {
    if (e instanceof ArquivoInvalido) return { ok: false, erro: { codigo: "ARQUIVO_INVALIDO", mensagem: e.message } };
    throw e;
  }
}

/** Confere e guarda o comprovante na pasta; devolve o caminho gravado. */
export async function guardarComprovante(supabase: SupabaseClient, pasta: string, bytes: Uint8Array): Promise<Resultado<string>> {
  const arquivo = preparar(bytes);
  if (!arquivo.ok) return arquivo;
  const caminho = `${pasta}/${crypto.randomUUID()}.${EXTENSAO[arquivo.dados.tipo]}`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo.dados.bytes, { contentType: TIPO_CONTEUDO[arquivo.dados.tipo] });
  if (error) {
    console.error("guardarComprovante: envio falhou", { mensagem: error.message });
    return { ok: false, erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível guardar o comprovante agora. Tente de novo em instantes." } };
  }
  return { ok: true, dados: caminho };
}

/** Apaga o comprovante de um registro que não foi gravado; a falha fica no registro para a equipe limpar. */
export async function apagarComprovante(supabase: SupabaseClient, caminho: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
  if (error) console.error("apagarComprovante: comprovante órfão", { caminho, mensagem: error.message });
}

/** Endereço temporário do comprovante (5 minutos); null se não deu para gerar. */
export async function enderecoDoComprovante(supabase: SupabaseClient, caminho: string | null): Promise<string | null> {
  if (!caminho) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, SEGUNDOS_ENDERECO);
  if (error) {
    console.error("enderecoDoComprovante falhou", { mensagem: error.message });
    return null;
  }
  return data.signedUrl;
}
