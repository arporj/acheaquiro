// Bloco "Acontece em Rio das Ostras" como o visitante vê (migration
// 20261124134213_destaques.sql): o RLS só entrega os destaques no ar
// (interno.destaque_no_ar), e o evento ligado só vem se estiver na Agenda.
import type { DestaqueInicio, OrigemEvento, Resultado, TipoDestaque } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const FALHA = { ok: false, erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível carregar os destaques agora." } } as const;

interface LinhaDestaque {
  id: string;
  tipo: TipoDestaque;
  titulo: string;
  texto: string;
  imagem_chave: string | null;
  link: string | null;
  comercio: string | null;
  inicio: string;
  fim: string;
  ordem: number;
  ligado: boolean;
  eventos: { slug: string; origem: OrigemEvento; data_fim: string; cartaz_chave: string | null } | null;
}

/** Destaques no ar de uma cidade. `enderecoArquivos` é a raiz pública das imagens (<chave>-800.jpg). */
export async function lerDestaquesPublicos(cliente: SupabaseClient, cidade: string, enderecoArquivos: string): Promise<Resultado<DestaqueInicio[]>> {
  const { data, error } = await cliente
    .from("destaques")
    .select("id, tipo, titulo, texto, imagem_chave, link, comercio, inicio, fim, ordem, ligado, eventos(slug, origem, data_fim, cartaz_chave), cidades!inner(slug)")
    .eq("cidades.slug", cidade);
  if (error) {
    console.error("lerDestaquesPublicos falhou", { cidade, codigo: error.code, mensagem: error.message });
    return FALHA;
  }
  const imagem = (chave: string | null | undefined) => (chave ? `${enderecoArquivos}/${chave}-800.jpg` : null);
  const destaques = (data as unknown as LinhaDestaque[]).flatMap((l): DestaqueInicio[] => {
    // Evento que saiu da Agenda entre a leitura do destaque e a do evento: fica de fora.
    if (l.tipo === "evento" && !l.eventos) return [];
    return [
      {
        id: l.id,
        tipo: l.tipo,
        titulo: l.titulo,
        texto: l.texto,
        imagem: imagem(l.imagem_chave) ?? imagem(l.eventos?.cartaz_chave),
        destino: l.link ?? `/agenda/${l.eventos!.slug}`,
        comercio: l.comercio,
        origemEvento: l.eventos?.origem ?? null,
        eventoFim: l.eventos?.data_fim ?? null,
        inicio: l.inicio,
        fim: l.fim,
        ordem: l.ordem,
        ligado: l.ligado,
      },
    ];
  });
  return { ok: true, dados: destaques };
}

/**
 * Conta o clique no destaque (repetidos do mesmo visitante em 30 minutos
 * contam uma vez) e devolve o destino; destaque fora do ar devolve null.
 */
export async function registrarCliqueDestaque(cliente: SupabaseClient, id: string, visitante: string): Promise<Resultado<string | null>> {
  const { data, error } = await cliente.rpc("registrar_clique_destaque", { p_destaque: id, p_visitante: visitante });
  if (error) {
    console.error("registrarCliqueDestaque falhou", { id, codigo: error.code, mensagem: error.message });
    return FALHA;
  }
  return { ok: true, dados: (data as string | null) ?? null };
}
