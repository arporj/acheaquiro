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
  c("eletricista", "Eletricista", "Eletricistas", CASA, "zap", cor.amarelo, { atalho: true }),
  c("bombeiro-hidraulico", "Bombeiro hidráulico", "Bombeiros hidráulicos", CASA, "droplets", cor.celeste, {
    sinonimos: ["encanador", "vazamento", "caixa d'água"],
    atalho: true,
  }),
  c("pedreiro", "Pedreiro", "Pedreiros", CASA, "brick-wall", cor.marrom),
  c("pintor", "Pintor", "Pintores", CASA, "paint-roller", cor.vermelho, { sinonimos: ["pintura"], atalho: true }),
  c("gesseiro", "Gesseiro", "Gesseiros", CASA, "layers", cor.grafite),
  c("marceneiro", "Marceneiro", "Marceneiros", CASA, "ruler", cor.marrom, { atalho: true }),
  c("serralheiro", "Serralheiro", "Serralheiros", CASA, "anvil", cor.grafite),
  c("vidraceiro", "Vidraceiro", "Vidraceiros", CASA, "frame", cor.celeste),
  c("chaveiro", "Chaveiro", "Chaveiros", CASA, "key-round", cor.amarelo),
  c("tecnico-ar-condicionado", "Técnico de ar-condicionado", "Técnicos de ar-condicionado", CASA, "air-vent", cor.celeste),
  c("tecnico-eletrodomesticos", "Técnico de eletrodomésticos", "Técnicos de eletrodomésticos", CASA, "washing-machine", cor.grafite),
  c("montador-de-moveis", "Montador de móveis", "Montadores de móveis", CASA, "drill", cor.magenta, {
    sinonimos: ["montagem de móveis"],
    atalho: true,
  }),
  c("moveis-planejados", "Armários e móveis planejados", "Armários e móveis planejados", CASA, "armchair", cor.marrom),
  c("faz-tudo", "Faz tudo", "Faz tudo", CASA, "wrench", cor.vermelho, {
    sinonimos: ["marido de aluguel", "pequenos reparos"],
    atalho: true,
  }),
  c("desentupidora", "Desentupidora", "Desentupidoras", CASA, "shower-head", cor.turquesa),
  c("limpa-fossa", "Limpa fossa", "Limpa fossa", CASA, "truck", cor.celeste, { sinonimos: ["fossa", "esgoto"], atalho: true }),
  c("dedetizacao", "Dedetização", "Dedetização", CASA, "bug", cor.verde),

  // Limpeza e cuidados com a casa
  c("diarista", "Diarista", "Diaristas", LIMPEZA, "brush-cleaning", cor.rosa, { sinonimos: ["faxina", "faxineira"] }),
  c("passadeira", "Passadeira", "Passadeiras", LIMPEZA, "shirt", cor.roxo),
  c("jardineiro", "Jardineiro", "Jardineiros", LIMPEZA, "flower-2", cor.verde),
  c("piscineiro", "Piscineiro", "Piscineiros", LIMPEZA, "waves-ladder", cor.celeste),
  c("caseiro", "Caseiro", "Caseiros", LIMPEZA, "house", cor.verde),
  c("limpeza-de-sofas", "Limpeza de sofás e estofados", "Limpeza de sofás e estofados", LIMPEZA, "sofa", cor.roxo),

  // Beleza e bem-estar
  c("cabeleireiro", "Cabeleireiro(a)", "Cabeleireiros", BELEZA, "scissors", cor.magenta),
  c("barbeiro", "Barbeiro", "Barbeiros", BELEZA, "scissors-line-dashed", cor.vermelho),
  c("manicure", "Manicure e pedicure", "Manicures e pedicures", BELEZA, "hand", cor.rosa),
  c("maquiador", "Maquiador(a)", "Maquiadores", BELEZA, "brush", cor.rosa),
  c("esteticista", "Esteticista e clínica de estética", "Esteticistas e clínicas de estética", BELEZA, "sparkles", cor.roxo),
  c("massagista", "Massagista", "Massagistas", BELEZA, "hand-heart", cor.turquesa),
  c("tatuagem", "Estúdio de tatuagem", "Estúdios de tatuagem", BELEZA, "pen-tool", cor.grafite),
  c("personal-trainer", "Personal trainer", "Personal trainers", BELEZA, "dumbbell", cor.laranja),

  // Saúde
  c("medico", "Médico", "Médicos", SAUDE, "stethoscope", cor.celeste, {
    sinonimos: ["clínico geral", "consulta"],
    conselho: true,
    atalho: true,
  }),
  c("dentista", "Dentista", "Dentistas", SAUDE, "smile", cor.azul, { conselho: true }),
  c("podologo", "Podólogo(a)", "Podólogos", SAUDE, "footprints", cor.turquesa, { conselho: true }),

  // Educação
  c("colegio", "Colégio", "Colégios", EDUCACAO, "school", cor.azul),
  c("curso-de-ingles", "Curso de inglês", "Cursos de inglês", EDUCACAO, "languages", cor.vermelho),
  c("curso-de-informatica", "Curso de informática", "Cursos de informática", EDUCACAO, "laptop", cor.grafite),
  c("cursos", "Cursos em geral", "Cursos em geral", EDUCACAO, "book-open", cor.laranja),
  c("professor-particular", "Professor particular", "Professores particulares", EDUCACAO, "graduation-cap", cor.amarelo),

  // Pessoas e família
  c("baba", "Babá", "Babás", FAMILIA, "baby", cor.rosa),
  c("cuidador-de-idosos", "Cuidador de idosos", "Cuidadores de idosos", FAMILIA, "heart-handshake", cor.turquesa),
  c("motorista-particular", "Motorista particular", "Motoristas particulares", FAMILIA, "car", cor.grafite),

  // Pets
  c("veterinario", "Veterinário", "Veterinários", PETS, "paw-print", cor.verde, { conselho: true }),
  c("banho-e-tosa", "Banho e tosa", "Banho e tosa", PETS, "bath", cor.celeste),
  c("adestrador", "Adestrador", "Adestradores", PETS, "bone", cor.marrom),
  c("passeador-de-caes", "Passeador de cães", "Passeadores de cães", PETS, "dog", cor.amarelo),
  c("ong-protecao-animal", "ONG de proteção animal", "ONGs de proteção animal", PETS, "heart", cor.verde),

  // Eventos e comida
  c("fotografo", "Fotógrafo", "Fotógrafos", EVENTOS, "camera", cor.grafite),
  c("buffet", "Buffet e salgadeira", "Buffets e salgadeiras", EVENTOS, "chef-hat", cor.laranja),
  c("confeiteira", "Confeiteira", "Confeiteiras", EVENTOS, "cake-slice", cor.rosa),
  c("decoracao-de-festas", "Decoração de festas", "Decoração de festas", EVENTOS, "party-popper", cor.magenta),
  c("dj-e-som", "DJ e som", "DJs e som", EVENTOS, "headphones", cor.roxo),
  c("musico", "Músico e banda", "Músicos e bandas", EVENTOS, "music", cor.azul, { sinonimos: ["musico", "banda", "cantor", "cantora", "show"] }),
  c("comida-caseira", "Comida caseira e marmitas", "Comida caseira e marmitas", EVENTOS, "soup", cor.laranja, {
    sinonimos: ["marmita", "quentinha", "almoço"],
    atalho: true,
  }),

  // Veículos
  c("mecanico", "Mecânico", "Mecânicos", VEICULOS, "cog", cor.grafite),
  c("eletricista-de-autos", "Eletricista de autos", "Eletricistas de autos", VEICULOS, "battery-charging", cor.amarelo),
  c("borracheiro", "Borracheiro", "Borracheiros", VEICULOS, "life-buoy", cor.grafite),
  c("lava-jato", "Lava-jato", "Lava-jatos", VEICULOS, "spray-can", cor.celeste),
  c("ferro-velho", "Ferro-velho", "Ferros-velhos", VEICULOS, "recycle", cor.verde),

  // Outros serviços (vindos do flyer)
  c("advogado", "Advogado(a)", "Advogados", OUTROS, "scale", cor.roxo, { sinonimos: ["advocacia", "advogada"], atalho: true }),
  c("cartomante", "Cartomante", "Cartomantes", OUTROS, "moon-star", cor.magenta, { sinonimos: ["tarô", "tarot"], atalho: true }),
  c("artesanato", "Artesanato", "Artesanato", OUTROS, "palette", cor.roxo, { sinonimos: ["artesã", "crochê"], atalho: true }),

  // Comércios
  c("mercado", "Mercado", "Mercados", COMERCIOS, "shopping-cart", cor.verde, { sinonimos: ["supermercado"] }),
  c("padaria", "Padaria", "Padarias", COMERCIOS, "croissant", cor.laranja),
  c("acougue", "Açougue", "Açougues", COMERCIOS, "beef", cor.vermelho),
  c("hortifruti", "Hortifrúti", "Hortifrútis", COMERCIOS, "carrot", cor.verde),
  c("farmacia", "Farmácia", "Farmácias", COMERCIOS, "pill", cor.vermelho, { sinonimos: ["drogaria", "remédio"] }),
  c("restaurante", "Restaurante", "Restaurantes", COMERCIOS, "utensils-crossed", cor.verde, { atalho: true }),
  c("lanchonete", "Lanchonete", "Lanchonetes", COMERCIOS, "sandwich", cor.amarelo),
  c("bar", "Bar e quiosque", "Bares e quiosques", COMERCIOS, "beer", cor.laranja, { sinonimos: ["bar", "quiosque", "musica ao vivo", "show"] }),
  c("pizzaria", "Pizzaria", "Pizzarias", COMERCIOS, "pizza", cor.vermelho, { sinonimos: ["pizza"] }),
  c("pet-shop", "Pet shop", "Pet shops", COMERCIOS, "cat", cor.amarelo, { sinonimos: ["ração"], atalho: true }),
  c("agropecuaria", "Agropecuária", "Agropecuárias", COMERCIOS, "wheat", cor.marrom),
  c("horto", "Horto", "Hortos", COMERCIOS, "sprout", cor.verde),
  c("material-de-construcao", "Material de construção", "Lojas de material de construção", COMERCIOS, "hard-hat", cor.laranja),
  c("loja-de-tintas", "Loja de tintas", "Lojas de tintas", COMERCIOS, "paint-bucket", cor.vermelho),
  c("ferragens", "Ferragens", "Lojas de ferragens", COMERCIOS, "hammer", cor.grafite),
  c("papelaria", "Papelaria", "Papelarias", COMERCIOS, "paperclip", cor.azul),
  c("grafica", "Gráfica", "Gráficas", COMERCIOS, "printer", cor.grafite),
  c("descartaveis", "Loja de descartáveis", "Lojas de descartáveis", COMERCIOS, "cup-soda", cor.celeste),
  c("loja-de-roupas", "Loja de roupas", "Lojas de roupas", COMERCIOS, "shopping-bag", cor.magenta),
  c("otica", "Ótica", "Óticas", COMERCIOS, "glasses", cor.azul),
  c("pousada", "Pousada", "Pousadas", COMERCIOS, "bed-double", cor.turquesa, { sinonimos: ["hospedagem", "hotel"], atalho: true }),
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
