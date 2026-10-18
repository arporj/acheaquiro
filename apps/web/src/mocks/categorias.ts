// DADOS FICTÍCIOS para o layout. Serão substituídos pela tabela de categorias
// no Supabase. Lista do item 4.13 da especificação + categorias do flyer.
import type { Categoria } from "@acheaqui/types";
import { paraSlug } from "@/lib/texto";

const cor = {
  amarelo: "#F2A900",
  vermelho: "#E53935",
  marrom: "#9A5B2E",
  celeste: "#1E9BE0",
  roxo: "#7E3FC4",
  turquesa: "#0E9F94",
  magenta: "#D81B7A",
  azul: "#2563EB",
  laranja: "#F57C00",
  verde: "#1E9E4A",
  rosa: "#E0559E",
  vinho: "#A2264A",
  grafite: "#475569",
};

type Opcoes ={ sinonimos?: string[]; conselho?: boolean; atalho?: boolean };

function c(
  id: string,
  nome: string,
  nomePlural: string,
  grupo: string,
  icone: string,
  corHex: string,
  opcoes: Opcoes = {},
): Categoria {
  return {
    id,
    nome,
    nomePlural,
    slugLista: paraSlug(nomePlural),
    grupo,
    sinonimos: opcoes.sinonimos ?? [],
    icone,
    cor: corHex,
    exigeRegistroConselho: opcoes.conselho ?? false,
    atalho: opcoes.atalho ?? false,
  };
}

const CASA = "Serviços para casa";
const LIMPEZA = "Limpeza e cuidados com a casa";
const BELEZA = "Beleza e bem-estar";
const SAUDE = "Saúde";
const EDUCACAO = "Educação";
const FAMILIA = "Pessoas e família";
const PETS = "Pets";
const EVENTOS = "Eventos e comida";
const VEICULOS = "Veículos";
const OUTROS = "Outros serviços";
const COMERCIOS = "Comércios";

export const categorias: Categoria[] = [
  // Serviços para casa
  c("eletricista", "Eletricista", "Eletricistas", CASA, "💡", cor.amarelo, { atalho: true }),
  c("bombeiro-hidraulico", "Bombeiro hidráulico", "Bombeiros hidráulicos", CASA, "🚰", cor.celeste, {
    sinonimos: ["encanador", "vazamento", "caixa d'água"],
    atalho: true,
  }),
  c("pedreiro", "Pedreiro", "Pedreiros", CASA, "🧱", cor.marrom),
  c("pintor", "Pintor", "Pintores", CASA, "🎨", cor.vermelho, { sinonimos: ["pintura"], atalho: true }),
  c("gesseiro", "Gesseiro", "Gesseiros", CASA, "🏠", cor.grafite),
  c("marceneiro", "Marceneiro", "Marceneiros", CASA, "🪚", cor.marrom, { atalho: true }),
  c("serralheiro", "Serralheiro", "Serralheiros", CASA, "🔩", cor.grafite),
  c("vidraceiro", "Vidraceiro", "Vidraceiros", CASA, "🪟", cor.celeste),
  c("chaveiro", "Chaveiro", "Chaveiros", CASA, "🔑", cor.amarelo),
  c("tecnico-ar-condicionado", "Técnico de ar-condicionado", "Técnicos de ar-condicionado", CASA, "❄️", cor.celeste),
  c("tecnico-eletrodomesticos", "Técnico de eletrodomésticos", "Técnicos de eletrodomésticos", CASA, "🔌", cor.grafite),
  c("montador-de-moveis", "Montador de móveis", "Montadores de móveis", CASA, "🗄️", cor.magenta, {
    sinonimos: ["montagem de móveis"],
    atalho: true,
  }),
  c("moveis-planejados", "Armários e móveis planejados", "Armários e móveis planejados", CASA, "🚪", cor.marrom),
  c("faz-tudo", "Faz tudo", "Faz tudo", CASA, "🛠️", cor.vermelho, {
    sinonimos: ["marido de aluguel", "pequenos reparos"],
    atalho: true,
  }),
  c("desentupidora", "Desentupidora", "Desentupidoras", CASA, "🪠", cor.turquesa),
  c("limpa-fossa", "Limpa fossa", "Limpa fossa", CASA, "🚛", cor.celeste, { sinonimos: ["fossa", "esgoto"], atalho: true }),
  c("dedetizacao", "Dedetização", "Dedetização", CASA, "🐜", cor.verde),

  // Limpeza e cuidados com a casa
  c("diarista", "Diarista", "Diaristas", LIMPEZA, "🧹", cor.rosa, { sinonimos: ["faxina", "faxineira"] }),
  c("passadeira", "Passadeira", "Passadeiras", LIMPEZA, "👕", cor.roxo),
  c("jardineiro", "Jardineiro", "Jardineiros", LIMPEZA, "🌿", cor.verde),
  c("piscineiro", "Piscineiro", "Piscineiros", LIMPEZA, "🏊", cor.celeste),
  c("caseiro", "Caseiro", "Caseiros", LIMPEZA, "🏡", cor.verde),
  c("limpeza-de-sofas", "Limpeza de sofás e estofados", "Limpeza de sofás e estofados", LIMPEZA, "🛋️", cor.roxo),

  // Beleza e bem-estar
  c("cabeleireiro", "Cabeleireiro(a)", "Cabeleireiros", BELEZA, "💇", cor.magenta),
  c("barbeiro", "Barbeiro", "Barbeiros", BELEZA, "💈", cor.vermelho),
  c("manicure", "Manicure e pedicure", "Manicures e pedicures", BELEZA, "💅", cor.rosa),
  c("maquiador", "Maquiador(a)", "Maquiadores", BELEZA, "💄", cor.rosa),
  c("esteticista", "Esteticista e clínica de estética", "Esteticistas e clínicas de estética", BELEZA, "✨", cor.roxo),
  c("massagista", "Massagista", "Massagistas", BELEZA, "💆", cor.turquesa),
  c("tatuagem", "Estúdio de tatuagem", "Estúdios de tatuagem", BELEZA, "🖋️", cor.grafite),
  c("personal-trainer", "Personal trainer", "Personal trainers", BELEZA, "🏋️", cor.laranja),

  // Saúde
  c("medico", "Médico", "Médicos", SAUDE, "🩺", cor.celeste, {
    sinonimos: ["clínico geral", "consulta"],
    conselho: true,
    atalho: true,
  }),
  c("dentista", "Dentista", "Dentistas", SAUDE, "🦷", cor.azul, { conselho: true }),
  c("podologo", "Podólogo(a)", "Podólogos", SAUDE, "🦶", cor.turquesa, { conselho: true }),

  // Educação
  c("colegio", "Colégio", "Colégios", EDUCACAO, "🏫", cor.azul),
  c("curso-de-ingles", "Curso de inglês", "Cursos de inglês", EDUCACAO, "🇬🇧", cor.vermelho),
  c("curso-de-informatica", "Curso de informática", "Cursos de informática", EDUCACAO, "💻", cor.grafite),
  c("cursos", "Cursos em geral", "Cursos em geral", EDUCACAO, "📚", cor.laranja),
  c("professor-particular", "Professor particular", "Professores particulares", EDUCACAO, "✏️", cor.amarelo),

  // Pessoas e família
  c("baba", "Babá", "Babás", FAMILIA, "🧸", cor.rosa),
  c("cuidador-de-idosos", "Cuidador de idosos", "Cuidadores de idosos", FAMILIA, "🤝", cor.turquesa),
  c("motorista-particular", "Motorista particular", "Motoristas particulares", FAMILIA, "🚗", cor.grafite),

  // Pets
  c("veterinario", "Veterinário", "Veterinários", PETS, "🐾", cor.verde, { conselho: true }),
  c("banho-e-tosa", "Banho e tosa", "Banho e tosa", PETS, "🛁", cor.celeste),
  c("adestrador", "Adestrador", "Adestradores", PETS, "🦮", cor.marrom),
  c("passeador-de-caes", "Passeador de cães", "Passeadores de cães", PETS, "🐕", cor.amarelo),
  c("ong-protecao-animal", "ONG de proteção animal", "ONGs de proteção animal", PETS, "💚", cor.verde),

  // Eventos e comida
  c("fotografo", "Fotógrafo", "Fotógrafos", EVENTOS, "📷", cor.grafite),
  c("buffet", "Buffet e salgadeira", "Buffets e salgadeiras", EVENTOS, "🥟", cor.laranja),
  c("confeiteira", "Confeiteira", "Confeiteiras", EVENTOS, "🎂", cor.rosa),
  c("decoracao-de-festas", "Decoração de festas", "Decoração de festas", EVENTOS, "🎈", cor.magenta),
  c("dj-e-som", "DJ e som", "DJs e som", EVENTOS, "🎧", cor.roxo),
  c("comida-caseira", "Comida caseira e marmitas", "Comida caseira e marmitas", EVENTOS, "🍲", cor.laranja, {
    sinonimos: ["marmita", "quentinha", "almoço"],
    atalho: true,
  }),

  // Veículos
  c("mecanico", "Mecânico", "Mecânicos", VEICULOS, "🔧", cor.grafite),
  c("eletricista-de-autos", "Eletricista de autos", "Eletricistas de autos", VEICULOS, "🔋", cor.amarelo),
  c("borracheiro", "Borracheiro", "Borracheiros", VEICULOS, "🛞", cor.grafite),
  c("lava-jato", "Lava-jato", "Lava-jatos", VEICULOS, "🧽", cor.celeste),
  c("ferro-velho", "Ferro-velho", "Ferros-velhos", VEICULOS, "♻️", cor.verde),

  // Outros serviços (vindos do flyer)
  c("advogado", "Advogado(a)", "Advogados", OUTROS, "⚖️", cor.roxo, { sinonimos: ["advocacia", "advogada"], atalho: true }),
  c("cartomante", "Cartomante", "Cartomantes", OUTROS, "🔮", cor.magenta, { sinonimos: ["tarô", "tarot"], atalho: true }),
  c("artesanato", "Artesanato", "Artesanato", OUTROS, "🧶", cor.roxo, { sinonimos: ["artesã", "crochê"], atalho: true }),

  // Comércios
  c("mercado", "Mercado", "Mercados", COMERCIOS, "🛒", cor.verde, { sinonimos: ["supermercado"] }),
  c("padaria", "Padaria", "Padarias", COMERCIOS, "🥖", cor.laranja),
  c("acougue", "Açougue", "Açougues", COMERCIOS, "🥩", cor.vermelho),
  c("hortifruti", "Hortifrúti", "Hortifrútis", COMERCIOS, "🥦", cor.verde),
  c("farmacia", "Farmácia", "Farmácias", COMERCIOS, "💊", cor.vermelho, { sinonimos: ["drogaria", "remédio"] }),
  c("restaurante", "Restaurante", "Restaurantes", COMERCIOS, "🍽️", cor.verde, { atalho: true }),
  c("lanchonete", "Lanchonete", "Lanchonetes", COMERCIOS, "🍔", cor.amarelo),
  c("pizzaria", "Pizzaria", "Pizzarias", COMERCIOS, "🍕", cor.vermelho, { sinonimos: ["pizza"] }),
  c("pet-shop", "Pet shop", "Pet shops", COMERCIOS, "🐶", cor.amarelo, { sinonimos: ["ração"], atalho: true }),
  c("agropecuaria", "Agropecuária", "Agropecuárias", COMERCIOS, "🌾", cor.marrom),
  c("horto", "Horto", "Hortos", COMERCIOS, "🌱", cor.verde),
  c("material-de-construcao", "Material de construção", "Lojas de material de construção", COMERCIOS, "🏗️", cor.laranja),
  c("loja-de-tintas", "Loja de tintas", "Lojas de tintas", COMERCIOS, "🪣", cor.vermelho),
  c("ferragens", "Ferragens", "Lojas de ferragens", COMERCIOS, "🔨", cor.grafite),
  c("papelaria", "Papelaria", "Papelarias", COMERCIOS, "📎", cor.azul),
  c("grafica", "Gráfica", "Gráficas", COMERCIOS, "🖨️", cor.grafite),
  c("descartaveis", "Loja de descartáveis", "Lojas de descartáveis", COMERCIOS, "🥤", cor.celeste),
  c("loja-de-roupas", "Loja de roupas", "Lojas de roupas", COMERCIOS, "👗", cor.magenta),
  c("otica", "Ótica", "Óticas", COMERCIOS, "👓", cor.azul),
  c("pousada", "Pousada", "Pousadas", COMERCIOS, "🏖️", cor.turquesa, { sinonimos: ["hospedagem", "hotel"], atalho: true }),
];

/** Ordem dos atalhos da página inicial, a mesma do flyer. */
export const ordemAtalhos = [
  "pet-shop",
  "faz-tudo",
  "marceneiro",
  "medico",
  "advogado",
  "pousada",
  "cartomante",
  "bombeiro-hidraulico",
  "eletricista",
  "pintor",
  "artesanato",
  "comida-caseira",
  "restaurante",
  "limpa-fossa",
  "montador-de-moveis",
];
