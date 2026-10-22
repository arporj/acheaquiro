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


// Grupos na ordem do catálogo de produção (migration 20261022180000_catalogo_ampliado.sql);
// a página inicial mostra os grupos na ordem em que aparecem nesta lista.
const COMER = "Comer e beber";
const MERCADOS = "Mercados e alimentos";
const LOJAS = "Lojas";
const CASA = "Serviços para casa";
const CONSTRUCAO = "Construção e reforma";
const LIMPEZA = "Limpeza e cuidados com a casa";
const BELEZA = "Beleza e bem-estar";
const ESPORTE = "Esporte e academias";
const SAUDE = "Saúde";
const EDUCACAO = "Educação";
const FAMILIA = "Pessoas e família";
const PETS = "Pets";
const EVENTOS = "Eventos e comida";
const VEICULOS = "Veículos";
const TURISMO = "Turismo e hospedagem";
const PROFISSIONAIS = "Serviços profissionais";
const RELIGIAO = "Religião e espiritualidade";
const ONGS = "ONGs";
const OUTROS = "Outros serviços";

export const categorias: Categoria[] = [
  // Comer e beber
  c("restaurante", "Restaurante", "Restaurantes", COMER, "utensils-crossed", cor.verde, { atalho: true }),
  c("lanchonete", "Lanchonete", "Lanchonetes", COMER, "sandwich", cor.amarelo),
  c("pizzaria", "Pizzaria", "Pizzarias", COMER, "pizza", cor.vermelho, { sinonimos: ["pizza"] }),
  c("padaria", "Padaria", "Padarias", COMER, "croissant", cor.laranja),
  c("bar", "Bar e quiosque", "Bares e quiosques", COMER, "beer", cor.laranja, { sinonimos: ["bar", "quiosque", "musica ao vivo", "show"] }),
  c("doceria", "Doceria e confeitaria", "Docerias e confeitarias", COMER, "cake-slice", cor.rosa),
  c("sorveteria", "Sorveteria e açaí", "Sorveterias e açaí", COMER, "ice-cream-cone", cor.roxo, { sinonimos: ["açaí", "sorvete"] }),
  c("pastelaria", "Pastelaria", "Pastelarias", COMER, "utensils", cor.amarelo, { sinonimos: ["pastel"] }),
  c("cafeteria", "Cafeteria", "Cafeterias", COMER, "coffee", cor.marrom, { sinonimos: ["café"] }),

  // Mercados e alimentos
  c("mercado", "Mercado", "Mercados", MERCADOS, "shopping-cart", cor.verde, { sinonimos: ["supermercado"] }),
  c("hortifruti", "Hortifrúti", "Hortifrútis", MERCADOS, "carrot", cor.verde),
  c("acougue", "Açougue", "Açougues", MERCADOS, "beef", cor.vermelho),
  c("peixaria", "Peixaria", "Peixarias", MERCADOS, "fish", cor.celeste),
  c("deposito-de-bebidas", "Depósito de bebidas", "Depósitos de bebidas", MERCADOS, "wine", cor.vinho, {
    sinonimos: ["depósito", "distribuidora de bebidas"],
  }),

  // Lojas
  c("loja-de-roupas", "Loja de roupas", "Lojas de roupas", LOJAS, "shopping-bag", cor.magenta),
  c("calcados", "Calçados", "Lojas de calçados", LOJAS, "footprints", cor.marrom),
  c("cosmeticos", "Cosméticos e perfumaria", "Cosméticos e perfumarias", LOJAS, "sparkles", cor.magenta, { sinonimos: ["perfumaria"] }),
  c("joias", "Joias e bijuterias", "Joias e bijuterias", LOJAS, "gem", cor.roxo),
  c("celulares", "Celulares e acessórios", "Celulares e acessórios", LOJAS, "smartphone", cor.azul),
  c("informatica", "Informática", "Lojas de informática", LOJAS, "monitor", cor.grafite),
  c("moveis-e-colchoes", "Móveis e colchões", "Móveis e colchões", LOJAS, "sofa", cor.marrom),
  c("eletrodomesticos", "Eletrodomésticos", "Lojas de eletrodomésticos", LOJAS, "refrigerator", cor.celeste),
  c("cama-mesa-e-banho", "Cama, mesa e banho", "Cama, mesa e banho", LOJAS, "bed-double", cor.turquesa),
  c("armarinho", "Armarinho e tecidos", "Armarinhos e tecidos", LOJAS, "spool", cor.rosa),
  c("bicicletas", "Bicicletas", "Lojas de bicicletas", LOJAS, "bike", cor.verde),
  c("esporte-pesca-camping", "Esporte, pesca e camping", "Esporte, pesca e camping", LOJAS, "tent", cor.verde),
  c("brinquedos", "Brinquedos", "Lojas de brinquedos", LOJAS, "blocks", cor.laranja),
  c("floricultura", "Floricultura", "Floriculturas", LOJAS, "flower", cor.rosa),
  c("variedades", "Loja de variedades", "Lojas de variedades", LOJAS, "store", cor.azul),
  c("gas-de-cozinha", "Gás de cozinha", "Gás de cozinha", LOJAS, "flame", cor.vermelho, { sinonimos: ["botijão"] }),
  c("tabacaria", "Tabacaria e charutaria", "Tabacarias e charutarias", LOJAS, "cigarette", cor.grafite, { sinonimos: ["charutaria", "charuto"] }),
  c("livraria", "Livraria", "Livrarias", LOJAS, "book", cor.vinho),
  c("presentes", "Presentes e artesanato", "Lojas de presentes e artesanato", LOJAS, "gift", cor.magenta),
  c("instrumentos-musicais", "Instrumentos musicais e som", "Instrumentos musicais e som", LOJAS, "guitar", cor.roxo),
  c("farmacia", "Farmácia", "Farmácias", LOJAS, "pill", cor.vermelho, { sinonimos: ["drogaria", "remédio"] }),
  c("otica", "Ótica", "Óticas", LOJAS, "glasses", cor.azul),
  c("papelaria", "Papelaria", "Papelarias", LOJAS, "paperclip", cor.azul),
  c("grafica", "Gráfica", "Gráficas", LOJAS, "printer", cor.grafite),
  c("descartaveis", "Loja de descartáveis", "Lojas de descartáveis", LOJAS, "cup-soda", cor.celeste),

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
  c("vidraceiro", "Vidraceiro", "Vidraceiros", CASA, "frame", cor.celeste, { sinonimos: ["vidraçaria"] }),
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

  // Construção e reforma
  c("material-de-construcao", "Material de construção", "Lojas de material de construção", CONSTRUCAO, "hard-hat", cor.laranja),
  c("ferragens", "Ferragens", "Lojas de ferragens", CONSTRUCAO, "hammer", cor.grafite),
  c("loja-de-tintas", "Loja de tintas", "Lojas de tintas", CONSTRUCAO, "paint-bucket", cor.vermelho),
  c("material-eletrico", "Material elétrico e hidráulico", "Material elétrico e hidráulico", CONSTRUCAO, "plug", cor.amarelo),
  c("marmoraria", "Marmoraria", "Marmorarias", CONSTRUCAO, "layers", cor.grafite),
  c("madeireira", "Madeireira", "Madeireiras", CONSTRUCAO, "tree-pine", cor.marrom),
  c("construtora", "Construtora", "Construtoras", CONSTRUCAO, "building", cor.grafite),
  c("aluguel-de-equipamentos", "Aluguel de equipamentos e caçambas", "Aluguel de equipamentos e caçambas", CONSTRUCAO, "container", cor.laranja, {
    sinonimos: ["aluguel de máquinas", "caçamba"],
  }),
  c("energia-solar", "Energia solar", "Energia solar", CONSTRUCAO, "sun", cor.amarelo),

  // Limpeza e cuidados com a casa
  c("diarista", "Diarista", "Diaristas", LIMPEZA, "brush-cleaning", cor.rosa, { sinonimos: ["faxina", "faxineira"] }),
  c("passadeira", "Passadeira", "Passadeiras", LIMPEZA, "shirt", cor.roxo),
  c("jardineiro", "Jardineiro", "Jardineiros", LIMPEZA, "flower-2", cor.verde),
  c("piscineiro", "Piscineiro", "Piscineiros", LIMPEZA, "waves-ladder", cor.celeste),
  c("caseiro", "Caseiro", "Caseiros", LIMPEZA, "house", cor.verde),
  c("limpeza-de-sofas", "Limpeza de sofás e estofados", "Limpeza de sofás e estofados", LIMPEZA, "sofa", cor.roxo),
  c("horto", "Horto", "Hortos", LIMPEZA, "sprout", cor.verde),

  // Beleza e bem-estar
  c("cabeleireiro", "Salão de beleza", "Salões de beleza", BELEZA, "scissors", cor.magenta, {
    sinonimos: ["cabeleireiro", "cabeleireira", "corte de cabelo"],
  }),
  c("barbeiro", "Barbearia", "Barbearias", BELEZA, "scissors-line-dashed", cor.vermelho, { sinonimos: ["barbeiro", "barba"] }),
  c("manicure", "Manicure e pedicure", "Manicures e pedicures", BELEZA, "hand", cor.rosa),
  c("maquiador", "Maquiador(a)", "Maquiadores", BELEZA, "brush", cor.rosa),
  c("esteticista", "Esteticista e clínica de estética", "Esteticistas e clínicas de estética", BELEZA, "sparkles", cor.roxo),
  c("massagista", "Massagista", "Massagistas", BELEZA, "hand-heart", cor.turquesa),
  c("tatuagem", "Estúdio de tatuagem", "Estúdios de tatuagem", BELEZA, "pen-tool", cor.grafite, { sinonimos: ["tatuador"] }),

  // Esporte e academias
  c("academia", "Academia", "Academias", ESPORTE, "dumbbell", cor.vermelho, { sinonimos: ["treino funcional", "crossfit"] }),
  c("pilates", "Pilates", "Pilates", ESPORTE, "activity", cor.turquesa),
  c("danca", "Estúdio de dança", "Estúdios de dança", ESPORTE, "music", cor.magenta, { sinonimos: ["dança", "pole dance"] }),
  c("escola-de-esportes", "Escola de esportes", "Escolas de esportes", ESPORTE, "trophy", cor.verde),
  c("personal-trainer", "Personal trainer", "Personal trainers", ESPORTE, "dumbbell", cor.laranja),

  // Saúde
  c("medico", "Médico", "Médicos", SAUDE, "stethoscope", cor.celeste, {
    sinonimos: ["clínico geral", "consulta"],
    conselho: true,
    atalho: true,
  }),
  c("dentista", "Dentista", "Dentistas", SAUDE, "smile", cor.azul, { conselho: true }),
  c("podologo", "Podólogo(a)", "Podólogos", SAUDE, "footprints", cor.turquesa, { conselho: true }),
  c("psicologo", "Psicólogo(a)", "Psicólogos", SAUDE, "brain", cor.roxo, { sinonimos: ["psicologia"], conselho: true }),
  c("fisioterapia", "Fisioterapia", "Fisioterapia", SAUDE, "activity", cor.celeste, { conselho: true }),
  c("nutricionista", "Nutricionista", "Nutricionistas", SAUDE, "apple", cor.verde, { sinonimos: ["nutrição"], conselho: true }),
  c("fonoaudiologo", "Fonoaudiólogo(a)", "Fonoaudiólogos", SAUDE, "ear", cor.turquesa, { conselho: true }),
  c("laboratorio", "Laboratório e exames", "Laboratórios e exames", SAUDE, "flask-conical", cor.azul),
  c("home-care", "Home care", "Home care", SAUDE, "house-plus", cor.vermelho),
  c("casa-de-repouso", "Casa de repouso", "Casas de repouso", SAUDE, "hand-heart", cor.vinho),
  c("plano-de-saude", "Plano de saúde", "Planos de saúde", SAUDE, "heart-pulse", cor.verde, { sinonimos: ["convênio", "plano médico"] }),

  // Educação
  c("colegio", "Colégio", "Colégios", EDUCACAO, "school", cor.azul),
  c("creche", "Creche", "Creches", EDUCACAO, "baby", cor.amarelo),
  c("curso-de-ingles", "Curso de inglês", "Cursos de inglês", EDUCACAO, "languages", cor.vermelho),
  c("curso-de-informatica", "Curso de informática", "Cursos de informática", EDUCACAO, "laptop", cor.grafite),
  c("escola-de-musica", "Escola de música", "Escolas de música", EDUCACAO, "music", cor.roxo),
  c("curso-preparatorio", "Curso preparatório", "Cursos preparatórios", EDUCACAO, "book-open", cor.azul),
  c("cursos", "Cursos em geral", "Cursos em geral", EDUCACAO, "book-open", cor.laranja),
  c("professor-particular", "Professor particular", "Professores particulares", EDUCACAO, "graduation-cap", cor.amarelo),

  // Pessoas e família
  c("baba", "Babá", "Babás", FAMILIA, "baby", cor.rosa),
  c("cuidador-de-idosos", "Cuidador de idosos", "Cuidadores de idosos", FAMILIA, "heart-handshake", cor.turquesa),
  c("motorista-particular", "Motorista particular e por aplicativo", "Motoristas particulares e por aplicativo", FAMILIA, "car", cor.grafite, {
    sinonimos: ["uber", "motorista de aplicativo"],
  }),

  // Pets
  c("veterinario", "Veterinário", "Veterinários", PETS, "paw-print", cor.verde, { conselho: true }),
  c("pet-shop", "Pet shop", "Pet shops", PETS, "cat", cor.amarelo, { sinonimos: ["ração"], atalho: true }),
  c("agropecuaria", "Agropecuária", "Agropecuárias", PETS, "wheat", cor.marrom),
  c("banho-e-tosa", "Banho e tosa", "Banho e tosa", PETS, "bath", cor.celeste),
  c("adestrador", "Adestrador", "Adestradores", PETS, "bone", cor.marrom),
  c("passeador-de-caes", "Passeador de cães", "Passeadores de cães", PETS, "dog", cor.amarelo),
  c("hotel-para-caes", "Hotel para cães", "Hotéis para cães", PETS, "dog", cor.laranja),

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
  c("casa-de-festas", "Casa de festas", "Casas de festas", EVENTOS, "party-popper", cor.magenta),
  c("organizacao-de-eventos", "Organização de eventos", "Organização de eventos", EVENTOS, "calendar", cor.roxo),
  c("aluguel-para-festas", "Aluguel para festas", "Aluguel para festas", EVENTOS, "armchair", cor.laranja),

  // Veículos
  c("mecanico", "Mecânico", "Mecânicos", VEICULOS, "cog", cor.grafite),
  c("eletricista-de-autos", "Eletricista de autos", "Eletricistas de autos", VEICULOS, "battery-charging", cor.amarelo),
  c("borracheiro", "Borracheiro", "Borracheiros", VEICULOS, "life-buoy", cor.grafite),
  c("lava-jato", "Lava-jato", "Lava-jatos", VEICULOS, "spray-can", cor.celeste),
  c("ferro-velho", "Ferro-velho", "Ferros-velhos", VEICULOS, "recycle", cor.verde),
  c("autopecas", "Autopeças", "Autopeças", VEICULOS, "cog", cor.grafite),
  c("revenda-de-veiculos", "Revenda de veículos", "Revendas de veículos", VEICULOS, "car-front", cor.azul),
  c("funilaria", "Funilaria e pintura", "Funilaria e pintura", VEICULOS, "paint-bucket", cor.vermelho),
  c("posto", "Posto de combustível", "Postos de combustível", VEICULOS, "fuel", cor.laranja),
  c("oficina-de-motos", "Oficina de motos", "Oficinas de motos", VEICULOS, "bike", cor.grafite),
  c("estacionamento", "Estacionamento", "Estacionamentos", VEICULOS, "square-parking", cor.azul),
  c("locadora", "Locadora de veículos", "Locadoras de veículos", VEICULOS, "car", cor.turquesa, { sinonimos: ["aluguel de carros"] }),
  c("autoescola", "Autoescola", "Autoescolas", VEICULOS, "car-front", cor.amarelo),
  c("reboque", "Reboque", "Reboques", VEICULOS, "truck", cor.vermelho, { sinonimos: ["guincho"] }),

  // Turismo e hospedagem
  c("pousada", "Pousada", "Pousadas", TURISMO, "bed-double", cor.turquesa, { sinonimos: ["hospedagem"], atalho: true }),
  c("hotel", "Hotel", "Hotéis", TURISMO, "hotel", cor.azul),
  c("agencia-de-viagens", "Agência de viagens", "Agências de viagens", TURISMO, "plane", cor.celeste),
  c("passeio-de-barco", "Passeio de barco", "Passeios de barco", TURISMO, "sailboat", cor.turquesa),
  c("mergulho", "Mergulho", "Mergulho", TURISMO, "anchor", cor.azul),
  c("nautica", "Náutica: barcos e jet ski", "Náutica: barcos e jet ski", TURISMO, "ship", cor.celeste, { sinonimos: ["jet ski", "lancha"] }),

  // Serviços profissionais
  c("advogado", "Advogado(a)", "Advogados", PROFISSIONAIS, "scale", cor.roxo, { sinonimos: ["advocacia", "advogada"], atalho: true }),
  c("contabilidade", "Contabilidade", "Contabilidade", PROFISSIONAIS, "calculator", cor.grafite, { sinonimos: ["contador"] }),
  c("imobiliaria", "Imobiliária", "Imobiliárias", PROFISSIONAIS, "key-round", cor.azul),
  c("corretor-de-seguros", "Corretor de seguros", "Corretores de seguros", PROFISSIONAIS, "shield-check", cor.turquesa),
  c("engenharia-e-arquitetura", "Engenharia e arquitetura", "Engenharia e arquitetura", PROFISSIONAIS, "drafting-compass", cor.grafite, {
    sinonimos: ["arquiteto", "engenheiro"],
  }),
  c("consultoria", "Consultoria empresarial", "Consultoria empresarial", PROFISSIONAIS, "briefcase", cor.vinho),
  c("publicidade", "Publicidade e marketing", "Publicidade e marketing", PROFISSIONAIS, "megaphone", cor.magenta),
  c("cartorio", "Cartório", "Cartórios", PROFISSIONAIS, "stamp", cor.grafite),
  c("loterica", "Lotérica", "Lotéricas", PROFISSIONAIS, "ticket", cor.verde),
  c("offshore", "Serviços offshore", "Serviços offshore", PROFISSIONAIS, "ship", cor.azul),

  // Religião e espiritualidade
  c("igreja", "Igreja", "Igrejas", RELIGIAO, "church", cor.roxo),
  c("centro-espirita", "Centro espírita", "Centros espíritas", RELIGIAO, "heart", cor.celeste, { sinonimos: ["kardecista", "espiritismo"] }),
  c("ordem-e-fraternidade", "Ordem e fraternidade", "Ordens e fraternidades", RELIGIAO, "compass", cor.grafite, {
    sinonimos: ["maçonaria", "rosa cruz"],
  }),
  c("cartomante", "Místico e esotérico", "Místicos e esotéricos", RELIGIAO, "moon-star", cor.magenta, {
    sinonimos: ["cartomante", "tarô", "tarot"],
    atalho: true,
  }),
  c("terapias-holisticas", "Terapias holísticas", "Terapias holísticas", RELIGIAO, "leaf", cor.verde),

  // ONGs
  c("ong", "ONG e projeto social", "ONGs e projetos sociais", ONGS, "hand-heart", cor.vermelho, { sinonimos: ["ong", "projeto social"] }),
  c("ong-protecao-animal", "ONG de proteção animal", "ONGs de proteção animal", ONGS, "heart", cor.verde),

  // Outros serviços
  c("artesanato", "Artesanato", "Artesanato", OUTROS, "palette", cor.roxo, { sinonimos: ["artesã", "crochê"], atalho: true }),
  c("lavanderia", "Lavanderia", "Lavanderias", OUTROS, "washing-machine", cor.celeste),
  c("funeraria", "Funerária", "Funerárias", OUTROS, "flower-2", cor.grafite),
  c("costureira", "Costureira", "Costureiras", OUTROS, "scissors", cor.rosa),
  c("sapateiro", "Sapateiro", "Sapateiros", OUTROS, "footprints", cor.marrom),
  c("seguranca-eletronica", "Segurança eletrônica", "Segurança eletrônica", OUTROS, "cctv", cor.grafite),
  c("mudancas", "Mudanças e fretes", "Mudanças e fretes", OUTROS, "truck", cor.laranja),
  c("empresa-de-limpeza", "Empresa de limpeza", "Empresas de limpeza", OUTROS, "spray-can", cor.turquesa),
  c("assistencia-tecnica", "Assistência técnica de informática e celular", "Assistência técnica de informática e celular", OUTROS, "laptop", cor.azul, {
    sinonimos: ["manutenção de computador", "conserto de celular"],
  }),
  c("tornearia", "Tornearia e solda", "Tornearia e solda", OUTROS, "cog", cor.grafite),
  c("poco-artesiano", "Poço artesiano", "Poços artesianos", OUTROS, "droplets", cor.celeste),
  c("reciclagem", "Reciclagem", "Reciclagem", OUTROS, "recycle", cor.verde),
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
