// Envio e exclusão de fotos dos perfis (itens 4.3 e 4.4; Especificação
// Técnica, seção 10.4, com a decisão de 21/10/2026: a foto entra publicada).
// A permissão sobre o perfil é a do RLS: as consultas usam o cliente da
// pessoa logada, e o banco recusa o que ela não pode fazer.
import { podeAdicionar } from "@acheaqui/domain";
import type { Resultado } from "@acheaqui/types";
import { ArquivoInvalido, conferirVersaoFoto, FORMATO_FOTO_PERFIL, TAMANHOS_FOTO, type FormatoFoto, type TamanhoFoto } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apagarArquivosPublicos, caminhoFoto, caminhosFoto, gravarArquivoPublico } from "./arquivos";
import { clienteServico } from "./sessao";

/** Envios por pessoa a cada hora (Especificação Técnica, seção 10.3). */
const ENVIOS_POR_HORA = 60;

export type FinalidadeFoto = "perfil" | "galeria" | "produto";

export interface EnvioFoto {
  anuncianteId: string;
  finalidade: FinalidadeFoto;
  legenda?: string;
  /** Antes e depois: as duas fotos do par levam o mesmo código. */
  par?: { id: string; papel: "antes" | "depois" };
  /** As três versões geradas no navegador, por tamanho (lado maior). */
  versoes: Partial<Record<TamanhoFoto, Uint8Array>>;
}

const erro = (codigo: "DADOS_INVALIDOS" | "NAO_ENCONTRADO" | "ARQUIVO_INVALIDO" | "LIMITE_DE_REQUISICOES" | "ERRO_INTERNO", mensagem: string) =>
  ({ ok: false, erro: { codigo, mensagem } }) as const;

async function limiteDeFotos(supabase: SupabaseClient, anunciante: { tipo: string; plano_id: string | null }): Promise<number | null> {
  // Sem plano definido (cadastro assistido antes do pagamento), vale o maior plano do tipo:
  // o excesso fica oculto quando o plano escolhido for menor (excedente, packages/domain).
  // Os pacotes extras de fotos entram com a tabela de extras contratados (item do Pix).
  const consulta = anunciante.plano_id
    ? supabase.from("planos").select("limite_fotos").eq("id", anunciante.plano_id)
    : supabase.from("planos").select("limite_fotos").eq("tipo", anunciante.tipo).order("limite_fotos", { ascending: false }).limit(1);
  const { data, error } = await consulta.maybeSingle();
  if (error || !data) {
    console.error("limiteDeFotos falhou", { codigo: error?.code, mensagem: error?.message });
    return null;
  }
  return data.limite_fotos as number;
}

export async function enviarFoto(supabase: SupabaseClient, usuarioId: string, envio: EnvioFoto): Promise<Resultado<{ id: string; chave: string }>> {
  const limite = await clienteServico().rpc("consumir_limite", {
    p_chave: `envio-arquivo:${usuarioId}`,
    p_limite: ENVIOS_POR_HORA,
    p_janela_segundos: 3600,
  });
  if (limite.error) {
    console.error("enviarFoto: consumir_limite falhou", { codigo: limite.error.code, mensagem: limite.error.message });
    return erro("ERRO_INTERNO", "Não foi possível enviar agora. Tente de novo em instantes.");
  }
  if (limite.data === false) return erro("LIMITE_DE_REQUISICOES", "Muitas fotos enviadas na última hora. Espere um pouco e tente de novo.");

  // O RLS só devolve o perfil se a pessoa pode vê-lo; a gravação da foto confere se pode alterá-lo.
  const { data: anunciante, error: erroAnunciante } = await supabase
    .from("anunciantes")
    .select("id, cidade_id, tipo, plano_id")
    .eq("id", envio.anuncianteId)
    .maybeSingle();
  if (erroAnunciante) {
    console.error("enviarFoto: leitura do anunciante falhou", { codigo: erroAnunciante.code, mensagem: erroAnunciante.message });
    return erro("ERRO_INTERNO", "Não foi possível enviar agora. Tente de novo em instantes.");
  }
  if (!anunciante) return erro("NAO_ENCONTRADO", "Perfil não encontrado.");

  if (envio.finalidade === "galeria") {
    const [limiteFotos, uso] = await Promise.all([
      limiteDeFotos(supabase, anunciante),
      supabase.from("fotos").select("id", { count: "exact", head: true }).eq("anunciante_id", anunciante.id).eq("finalidade", "galeria").eq("situacao", "publicado"),
    ]);
    if (limiteFotos === null || uso.error) return erro("ERRO_INTERNO", "Não foi possível conferir o limite do plano. Tente de novo.");
    const cabe = podeAdicionar("fotos", uso.count ?? 0, 1, limiteFotos);
    if (!cabe.ok) return cabe;
  }

  // Confere as três versões antes de gravar qualquer coisa.
  const conferidas: { tamanho: TamanhoFoto; arquivo: Uint8Array; formato: FormatoFoto; largura: number; altura: number }[] = [];
  try {
    for (const tamanho of TAMANHOS_FOTO) {
      const bytes = envio.versoes[tamanho];
      if (!bytes) return erro("DADOS_INVALIDOS", `Falta a versão de ${tamanho} px da foto.`);
      conferidas.push({ tamanho, ...conferirVersaoFoto(bytes, tamanho) });
    }
  } catch (falha) {
    if (falha instanceof ArquivoInvalido) return erro("ARQUIVO_INVALIDO", `Foto recusada: ${falha.message}`);
    throw falha;
  }
  const formato = conferidas[0]!.formato;
  if (conferidas.some((v) => v.formato !== formato)) return erro("ARQUIVO_INVALIDO", "As três versões da foto precisam ter o mesmo formato.");
  // A foto de perfil vai para a prévia do link no WhatsApp, que só garante JPEG.
  if (envio.finalidade === "perfil" && formato !== FORMATO_FOTO_PERFIL) {
    return erro("ARQUIVO_INVALIDO", "A foto de perfil precisa chegar em JPEG. Escolha a foto de novo.");
  }
  const maior = conferidas[conferidas.length - 1]!;

  const chave = `fotos/${anunciante.id}/${crypto.randomUUID()}`;
  await Promise.all(conferidas.map((v) => gravarArquivoPublico(caminhoFoto(chave, v.tamanho, formato), v.arquivo, formato)));

  // A foto de perfil é uma só: a anterior sai antes de a nova entrar.
  type FotoAnterior = { id: string; chave: string; formato: FormatoFoto };
  let anterior: FotoAnterior | null = null;
  if (envio.finalidade === "perfil") {
    const { data } = await supabase.from("fotos").select("id, chave, formato").eq("anunciante_id", anunciante.id).eq("finalidade", "perfil").eq("situacao", "publicado").maybeSingle();
    anterior = data as FotoAnterior | null;
    if (anterior) {
      const { error: erroApagar } = await supabase.from("fotos").delete().eq("id", anterior.id);
      if (erroApagar) {
        console.error("enviarFoto: troca da foto de perfil falhou", { codigo: erroApagar.code, mensagem: erroApagar.message });
        await apagarArquivosPublicos(caminhosFoto(chave, formato));
        return erro("ERRO_INTERNO", "Não foi possível trocar a foto de perfil. Tente de novo.");
      }
    }
  }

  const { data: foto, error: erroGravar } = await supabase
    .from("fotos")
    .insert({
      anunciante_id: anunciante.id,
      cidade_id: anunciante.cidade_id,
      finalidade: envio.finalidade,
      chave,
      formato,
      largura: maior.largura,
      altura: maior.altura,
      legenda: envio.legenda?.trim().slice(0, 200) || null,
      par_id: envio.par?.id ?? null,
      papel_no_par: envio.par?.papel ?? null,
    })
    .select("id")
    .single();
  if (erroGravar) {
    // Sem o registro no banco, os arquivos não servem para nada: saem do bucket.
    await apagarArquivosPublicos(caminhosFoto(chave, formato));
    if (erroGravar.code === "42501") return erro("NAO_ENCONTRADO", "Você não pode alterar este perfil.");
    if (erroGravar.code === "23505") return erro("DADOS_INVALIDOS", "Este par de antes e depois já tem essa foto.");
    console.error("enviarFoto: gravação falhou", { codigo: erroGravar.code, mensagem: erroGravar.message });
    return erro("ERRO_INTERNO", "Não foi possível gravar a foto. Tente de novo.");
  }
  if (anterior) await apagarArquivosPublicos(caminhosFoto(anterior.chave, anterior.formato));
  return { ok: true, dados: { id: foto.id as string, chave } };
}

/** Exclusão pelo dono, pelo representante (no cadastro assistido) ou pelo administrador. */
export async function apagarFoto(supabase: SupabaseClient, fotoId: string): Promise<Resultado<null>> {
  const { data, error } = await supabase.from("fotos").delete().eq("id", fotoId).select("chave, formato");
  if (error) {
    console.error("apagarFoto falhou", { codigo: error.code, mensagem: error.message });
    return erro("ERRO_INTERNO", "Não foi possível apagar a foto. Tente de novo.");
  }
  const [apagada] = data ?? [];
  if (!apagada) return erro("NAO_ENCONTRADO", "Foto não encontrada.");
  await apagarArquivosPublicos(caminhosFoto(apagada.chave as string, apagada.formato as FormatoFoto));
  return { ok: true, dados: null };
}
