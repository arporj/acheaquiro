// Patrocinadores e cotas de patrocínio, como o visitante vê (migration
// 20261022170000_patrocinadores.sql). O RLS entrega só os patrocínios no ar e
// dentro do prazo, e só as cotas ativas; o valor pago nunca vem.
import type { CotaPatrocinio, CotaPatrocinioVenda, Patrocinador, Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const FALHA = { ok: false, erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível carregar os patrocinadores agora." } } as const;

interface LinhaCota {
  cota: CotaPatrocinio;
  nome: string;
  beneficios: string[];
  valor_centavos: number;
  valor_fundador_centavos: number;
  vagas: number | null;
  largura_logo: number;
  altura_logo: number;
}

async function lerCotas(cliente: SupabaseClient, cidade: string): Promise<LinhaCota[] | null> {
  const { data, error } = await cliente
    .from("cotas_patrocinio")
    .select("cota, nome, beneficios, valor_centavos, valor_fundador_centavos, vagas, largura_logo, altura_logo, cidades!inner(slug)")
    .eq("cidades.slug", cidade)
    .order("ordem");
  if (error) {
    console.error("lerCotas falhou", { cidade, codigo: error.code, mensagem: error.message });
    return null;
  }
  return data as unknown as LinhaCota[];
}

/**
 * Patrocinadores no ar e cotas à venda de uma cidade. `enderecoArquivos` é a
 * raiz pública dos arquivos (os logos ficam em patrocinadores/...).
 */
export async function lerPatrocinioPublico(
  cliente: SupabaseClient,
  cidade: string,
  enderecoArquivos: string,
): Promise<Resultado<{ patrocinadores: Patrocinador[]; cotas: CotaPatrocinioVenda[] }>> {
  const [cotas, resposta] = await Promise.all([
    lerCotas(cliente, cidade),
    cliente
      .from("patrocinios")
      .select("id, slug, nome, ramo, frase, whatsapp, site, logo_caminho, cota, grupo, fim, categorias(slug_lista), cidades!inner(slug)")
      .eq("cidades.slug", cidade)
      .order("nome"),
  ]);
  if (!cotas) return FALHA;
  if (resposta.error) {
    console.error("lerPatrocinioPublico falhou", { cidade, codigo: resposta.error.code, mensagem: resposta.error.message });
    return FALHA;
  }
  const formato = new Map(cotas.map((c) => [c.cota, { largura: c.largura_logo, altura: c.altura_logo }]));
  type Linha = {
    id: string;
    slug: string;
    nome: string;
    ramo: string;
    frase: string;
    whatsapp: string | null;
    site: string | null;
    logo_caminho: string | null;
    cota: CotaPatrocinio;
    grupo: string | null;
    fim: string;
    categorias: { slug_lista: string } | null;
  };
  const patrocinadores: Patrocinador[] = (resposta.data as unknown as Linha[])
    .filter((l) => l.logo_caminho && formato.has(l.cota))
    .map((l) => ({
      id: l.id,
      slug: l.slug,
      nome: l.nome,
      ramo: l.ramo,
      frase: l.frase,
      whatsapp: l.whatsapp ?? "",
      site: l.site ?? undefined,
      logo: `${enderecoArquivos}/${l.logo_caminho}`,
      formatoLogo: formato.get(l.cota)!,
      cota: l.cota,
      grupo: l.grupo ?? undefined,
      categoriaId: l.categorias?.slug_lista,
      fim: l.fim,
    }));
  return {
    ok: true,
    dados: {
      patrocinadores,
      cotas: cotas.map((c) => ({
        cota: c.cota,
        nome: c.nome,
        beneficios: c.beneficios,
        valorCentavos: c.valor_centavos,
        valorFundadorCentavos: c.valor_fundador_centavos,
        vagas: c.vagas ?? undefined,
        formatoLogo: { largura: c.largura_logo, altura: c.altura_logo },
      })),
    },
  };
}

/** Conta o clique no contato do patrocinador (repetidos em 30 minutos contam uma vez, no banco). */
export async function registrarCliquePatrocinio(cliente: SupabaseClient, cidade: string, slug: string, visitante: string): Promise<void> {
  const { error } = await cliente.rpc("registrar_clique_patrocinio", { p_slug: slug, p_cidade: cidade, p_visitante: visitante });
  if (error) console.error("registrarCliquePatrocinio falhou", { slug, codigo: error.code, mensagem: error.message });
}
