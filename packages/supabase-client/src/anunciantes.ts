// Anunciantes publicados, como o visitante vê (funções anunciante_publico e
// anunciantes_publicos, migration 20261023100000_anunciantes_publicos.sql). O
// banco já entrega o formato das páginas; aqui só o caminho das fotos vira
// endereço completo.
import type { Anunciante, Foto, Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const FALHA = { ok: false, erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível carregar os anunciantes agora." } } as const;

type FotoDoBanco = Omit<Foto, "url"> & { caminho?: string };
type AnuncianteDoBanco = Omit<Anunciante, "fotoPerfil" | "galeria"> & { fotoPerfil: FotoDoBanco; galeria: FotoDoBanco[] };

function comEndereco({ caminho, ...foto }: FotoDoBanco, enderecoArquivos: string): Foto {
  return caminho ? { ...foto, url: `${enderecoArquivos}/${caminho}` } : foto;
}

function paraAnunciante(linha: AnuncianteDoBanco, enderecoArquivos: string): Anunciante {
  return {
    ...linha,
    fotoPerfil: comEndereco(linha.fotoPerfil, enderecoArquivos),
    galeria: linha.galeria.map((f) => comEndereco(f, enderecoArquivos)),
  } as Anunciante;
}

/** Perfil completo pelo endereço /perfil/slug; `undefined` quando não existe ou não está publicado. */
export async function lerAnunciantePublico(
  cliente: SupabaseClient,
  cidade: string,
  slug: string,
  enderecoArquivos: string,
): Promise<Resultado<Anunciante | undefined>> {
  const { data, error } = await cliente.rpc("anunciante_publico", { p_cidade: cidade, p_slug: slug });
  if (error) {
    console.error("anunciante_publico falhou", { cidade, slug, codigo: error.code, mensagem: error.message });
    return FALHA;
  }
  return { ok: true, dados: data ? paraAnunciante(data as AnuncianteDoBanco, enderecoArquivos) : undefined };
}

export interface FiltroAnunciantes {
  /** Links curtos das categorias (principal ou adicional). */
  categorias?: string[];
  /** Parte do nome; com categorias, vale qualquer um dos dois. */
  termo?: string;
  soFundadores?: boolean;
}

/** Anunciantes publicados para as listas (sem galeria e sem horário), em ordem de nome. */
export async function lerAnunciantesPublicos(
  cliente: SupabaseClient,
  cidade: string,
  filtro: FiltroAnunciantes,
  enderecoArquivos: string,
): Promise<Resultado<Anunciante[]>> {
  const { data, error } = await cliente.rpc("anunciantes_publicos", {
    p_cidade: cidade,
    p_categorias: filtro.categorias ?? null,
    p_termo: filtro.termo ?? null,
    p_so_fundadores: filtro.soFundadores ?? false,
  });
  if (error) {
    console.error("anunciantes_publicos falhou", { cidade, codigo: error.code, mensagem: error.message });
    return FALHA;
  }
  return { ok: true, dados: (data as AnuncianteDoBanco[]).map((linha) => paraAnunciante(linha, enderecoArquivos)) };
}
