// DADOS FICTÍCIOS para o layout dos patrocinadores (proposta Patrocinadores
// v3). Empresas inventadas; os logos ficam em public/mock/patrocinadores. No
// sistema real, cotas, vagas e valores ficam no banco.
import type { CotaPatrocinio, Patrocinador } from "@acheaqui/types";

// Número inválido de propósito, como nos anunciantes fictícios.
const WHATS = "5522900000099";

function p(
  id: string,
  slug: string,
  nome: string,
  ramo: string,
  frase: string,
  cota: CotaPatrocinio,
  onde: { grupo?: string; categoriaId?: string } = {},
): Patrocinador {
  return { id, slug, nome, ramo, frase, whatsapp: WHATS, logo: `/mock/patrocinadores/${slug}.svg`, cota, ...onde };
}

export const patrocinadores: Patrocinador[] = [
  p("p01", "construmar", "Construmar Materiais", "Material de construção", "Tudo para a sua obra, do alicerce ao acabamento.", "master"),
  p("p02", "costa-net", "Costa Net Fibra", "Provedor de internet", "Internet de fibra em todos os bairros da cidade.", "ouro"),
  p("p03", "cooperativa-litoral", "Cooperativa Litoral", "Cooperativa de crédito", "Crédito justo para quem empreende na cidade.", "ouro"),
  p("p04", "mare-alta", "Imobiliária Maré Alta", "Imobiliária", "Compra, venda e aluguel em Rio das Ostras.", "ouro"),
  p("p05", "rota-certa", "Autoescola Rota Certa", "Autoescola", "Sua habilitação sem complicação.", "apoio"),
  p("p06", "bem-viver", "Clínica Bem Viver", "Clínica", "Consultas e exames perto de você.", "apoio"),
  p("p07", "visao-clara", "Ótica Visão Clara", "Ótica", "Óculos e lentes com exame de vista.", "apoio"),
  p("p08", "ponto-final", "Gráfica Ponto Final", "Gráfica", "Cartões, banners e adesivos em 24 horas.", "apoio"),
  p("p09", "movimento", "Academia Movimento", "Academia", "Treine perto de casa, de segunda a sábado.", "apoio"),
  p("p10", "contabil-ancora", "Contábil Âncora", "Contabilidade", "Abra e mantenha sua empresa em dia.", "apoio"),
  p("p11", "pedra-forte", "Depósito Pedra Forte", "Material de construção", "Areia, pedra e cimento com entrega no mesmo dia.", "grupo", { grupo: "Comércios" }),
  p("p12", "ferragens-ancora", "Ferragens Âncora", "Ferragens", "Ferramentas e ferragens para o profissional.", "grupo", { grupo: "Serviços para casa" }),
  p("p13", "serra-azul", "Laticínios Serra Azul", "Distribuidora de laticínios", "Queijos e frios para pizzarias e restaurantes.", "categoria", { categoriaId: "pizzaria" }),
  p("p14", "faisca", "Elétrica Faísca", "Loja de material elétrico", "Fios, disjuntores e lâmpadas com preço de atacado.", "categoria", { categoriaId: "eletricista" }),
  p("p15", "gelada-distribuidora", "Gelada Distribuidora de Bebidas", "Distribuidora de bebidas", "Bebidas para bares, quiosques e festas, com entrega.", "agenda"),
];
