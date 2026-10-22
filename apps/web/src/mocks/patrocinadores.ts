// DADOS FICTÍCIOS para o layout dos patrocinadores (proposta Patrocinadores
// v3). Empresas inventadas; os logos ficam em public/mock/patrocinadores. No
// sistema real, cotas, vagas e valores ficam no banco.
import type { CotaPatrocinio, CotaPatrocinioVenda, Patrocinador } from "@acheaqui/types";

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
  // Contratos fictícios de 12 meses a partir da abertura (27/11/2026).
  return { id, slug, nome, ramo, frase, whatsapp: WHATS, logo: `/mock/patrocinadores/${slug}.svg`, cota, fim: "2027-11-26", ...onde };
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

/** Cotas à venda (proposta Patrocinadores v3). No sistema real, ficam no banco. */
export const cotasPatrocinio: CotaPatrocinioVenda[] = [
  {
    cota: "master", nome: "Master", vagas: 1, valorCentavos: 690000, valorFundadorCentavos: 570000,
    beneficios: ["Logo maior no rodapé de todas as páginas", "2 posts por mês no Instagram do Ache Aqui RO", "Logo nos cartazes e panfletos, quando houver", "Carro de som, quando houver"],
  },
  {
    cota: "ouro", nome: "Ouro", vagas: 3, valorCentavos: 490000, valorFundadorCentavos: 400000,
    beneficios: ["Logo médio no rodapé de todas as páginas", "1 post por mês no Instagram", "Logo nos cartazes e panfletos, quando houver"],
  },
  {
    cota: "apoio", nome: "Apoio", vagas: 6, valorCentavos: 220000, valorFundadorCentavos: 180000,
    beneficios: ["Logo pequeno no rodapé de todas as páginas", "1 post de boas-vindas no Instagram"],
  },
  {
    cota: "grupo", nome: "Grupo de categorias", valorCentavos: 259000, valorFundadorCentavos: 215000,
    beneficios: ["Nome ao lado do grupo, em todas as categorias dele (exemplo: Comércios)", "1 post por mês no Instagram"],
  },
  {
    cota: "categoria", nome: "Categoria", valorCentavos: 129000, valorFundadorCentavos: 107000,
    beneficios: ["Nome ao lado do título da categoria (exemplo: Pizzarias)", "1 post de boas-vindas no Instagram"],
  },
  {
    cota: "agenda", nome: "Agenda", vagas: 1, valorCentavos: 290000, valorFundadorCentavos: 240000,
    beneficios: ["Nome ao lado do título da Agenda de shows e eventos", "1 post por mês no Instagram"],
  },
];
