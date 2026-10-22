// Mapa inicial CNAE → categoria (slug_lista), aprovado em 22/10/2026. Vale o
// prefixo mais longo: subclasse (7 dígitos), classe (5), grupo (3) ou divisão (2).
// null = fora da importação (sem atendimento ao público, atacado, indústria,
// organizações políticas e sindicais). Depois da primeira carga, a fonte é a
// tabela cnae_categoria, editável na administração; este arquivo só preenche
// os CNAEs que ainda não estão nela.

export const MAPA_CNAE = [
  // Fora por padrão: agropecuária, extração, indústria, energia, água, atacado,
  // transporte de carga, finanças, administração pública, organismos.
  ["01", null], ["02", null], ["03", null], ["05", null], ["06", null], ["07", null], ["08", null], ["09", null],
  ["10", null], ["11", null], ["12", null], ["13", null], ["14", null], ["15", null], ["16", null], ["17", null],
  ["18", null], ["19", null], ["20", null], ["21", null], ["22", null], ["23", null], ["24", null], ["25", null],
  ["26", null], ["27", null], ["28", null], ["29", null], ["30", null], ["31", null], ["32", null], ["33", null],
  ["35", null], ["36", null], ["37", null], ["38", null], ["39", null], ["46", null], ["49", null], ["50", null],
  ["51", null], ["52", null], ["53", null], ["58", null], ["59", null], ["60", null], ["61", null], ["63", null],
  ["64", null], ["65", null], ["66", null], ["70", null], ["72", null], ["78", null], ["80", null], ["81", null],
  ["82", null], ["84", null], ["94", null], ["97", null], ["99", null],

  // Comer e beber
  ["5611201", "restaurantes"], ["5611203", "lanchonetes"], ["5611204", "bares"], ["5611205", "bares"],
  ["5612100", "lanchonetes"], ["5620101", "comida-caseira-e-marmitas"], ["5620102", "buffets-e-salgadeiras"],
  ["5620103", "lanchonetes"], ["5620104", "comida-caseira-e-marmitas"], ["5611202", "restaurantes"],
  ["1091102", "padarias"], ["4721102", "padarias"], ["4721104", "docerias"], ["1092900", "docerias"],
  ["1093701", "docerias"], ["1096100", "comida-caseira-e-marmitas"], ["1053800", "sorveterias"],

  // Mercados e alimentos
  ["4711301", "mercados"], ["4711302", "mercados"], ["4712100", "mercados"], ["4729699", "mercados"],
  ["4729602", "mercados"], ["4721103", "mercados"], ["4729", "mercados"],
  ["4724500", "hortifrutis"], ["4722901", "acougues"], ["4722902", "peixarias"], ["4723700", "depositos-de-bebidas"],
  ["4721101", "padarias"],

  // Lojas
  ["4781400", "lojas-de-roupas"], ["4782201", "calcados"], ["4782202", "calcados"], ["4772500", "cosmeticos-e-perfumaria"],
  ["4783101", "joias-e-bijuterias"], ["4783102", "joias-e-bijuterias"], ["4789001", "presentes"],
  ["4752100", "celulares"], ["4751201", "informatica"], ["4751202", "informatica"], ["4754701", "moveis-e-colchoes"],
  ["4754702", "moveis-e-colchoes"], ["4754703", "moveis-e-colchoes"], ["4753900", "eletrodomesticos"],
  ["4757100", "eletrodomesticos"], ["4759801", "cama-mesa-e-banho"], ["4755503", "cama-mesa-e-banho"],
  ["4755501", "armarinhos-e-tecidos"], ["4755502", "armarinhos-e-tecidos"], ["4763603", "bicicletas"],
  ["4763602", "esporte-pesca-e-camping"], ["4763604", "esporte-pesca-e-camping"], ["4763601", "brinquedos"],
  ["4789002", "floriculturas"], ["4713002", "lojas-de-variedades"], ["4713004", "lojas-de-variedades"],
  ["4713005", "lojas-de-variedades"], ["4784900", "gas-de-cozinha"], ["4729601", "tabacarias"],
  ["4761001", "livrarias"], ["4761002", "livrarias"], ["4761003", "papelarias"], ["4774100", "oticas"],
  ["4771701", "farmacias"], ["4771702", "farmacias"], ["4771703", "farmacias"], ["4773300", "farmacias"],
  ["4756300", "instrumentos-musicais"], ["4789004", "pet-shops"], ["4789005", "lojas-de-descartaveis"],
  ["4789099", "lojas-de-variedades"], ["4759899", "lojas-de-variedades"], ["4789003", "presentes"],
  ["4785799", "lojas-de-variedades"], ["4785701", "lojas-de-variedades"], ["4762800", "lojas-de-variedades"],
  ["4789007", "lojas-de-variedades"], ["4789008", "presentes"], ["4789009", "esporte-pesca-e-camping"],
  ["4771704", "farmacias"], ["4789006", "lojas-de-variedades"], ["4783", "joias-e-bijuterias"],
  ["1813", "graficas"], ["1821100", "graficas"], ["1822901", "graficas"], ["1822999", "graficas"],
  ["4623108", "agropecuarias"], ["4771", "farmacias"], ["4789", "lojas-de-variedades"], ["4759", "lojas-de-variedades"],
  ["4713", "lojas-de-variedades"], ["4732600", "autopecas"], ["4731800", "postos-de-combustivel"],
  ["4744099", "lojas-de-material-de-construcao"], ["4744001", "lojas-de-ferragens"], ["4744002", "madeireiras"],
  ["4744003", "material-eletrico-e-hidraulico"], ["4744004", "lojas-de-material-de-construcao"],
  ["4744005", "lojas-de-material-de-construcao"], ["4744006", "marmorarias"], ["4741500", "lojas-de-tintas"],
  ["4742300", "material-eletrico-e-hidraulico"], ["4743100", "vidraceiros"], ["4744", "lojas-de-material-de-construcao"],
  ["2391503", "marmorarias"], ["4789099", "lojas-de-variedades"],

  // Serviços para casa e construção
  ["4399103", "pedreiros"], ["4399199", "pedreiros"], ["4330404", "pintores"], ["4330403", "gesseiros"],
  ["4330499", "pedreiros"], ["4330401", "pintores"], ["4330402", "armarios-e-moveis-planejados"],
  ["4330405", "pedreiros"], ["4321500", "eletricistas"], ["4322301", "bombeiros-hidraulicos"],
  ["4322302", "tecnicos-de-ar-condicionado"], ["4322303", "bombeiros-hidraulicos"], ["4329103", "pedreiros"],
  ["4329104", "pedreiros"], ["4329105", "pedreiros"], ["4329199", "pedreiros"], ["4120400", "construtoras"],
  ["4110700", null], ["4211", "construtoras"], ["4212", "construtoras"], ["4213", "construtoras"],
  ["4221", "construtoras"], ["4222", "construtoras"], ["4223", "construtoras"], ["4291", "construtoras"],
  ["4292", "construtoras"], ["4299", "construtoras"], ["4311", "construtoras"], ["4312", "construtoras"],
  ["4313", "construtoras"], ["4319", "construtoras"], ["4391", "construtoras"], ["4399101", "construtoras"],
  ["4399102", "aluguel-de-equipamentos"], ["4399104", "aluguel-de-equipamentos"], ["4399105", "pocos-artesianos"],
  ["4292801", "serralheiros"], ["2542000", "serralheiros"], ["2512800", "serralheiros"], ["2539001", "tornearia-e-solda"],
  ["3101200", "marceneiros"], ["3102100", "marceneiros"], ["3329501", "montadores-de-moveis"],
  ["9529105", "marceneiros"], ["9521500", "tecnicos-de-eletrodomesticos"], ["3313999", "tecnicos-de-eletrodomesticos"],
  ["9511800", "assistencia-tecnica"], ["9512600", "assistencia-tecnica"], ["9529101", "sapateiros"],
  ["9529102", "chaveiros"], ["9529103", "assistencia-tecnica"], ["9529104", "bicicletas"],
  ["8122200", "dedetizacao"], ["8121400", "empresas-de-limpeza"], ["8129000", "empresas-de-limpeza"],
  ["8130300", "jardineiros"], ["3702900", "limpa-fossa"], ["3701100", "limpa-fossa"], ["3811400", "reciclagem"],
  ["3831999", "reciclagem"], ["3831901", "reciclagem"], ["3832700", "reciclagem"], ["3839499", "reciclagem"],
  ["3812200", "reciclagem"], ["4687703", "ferros-velhos"], ["8020001", "seguranca-eletronica"],
  ["4321500", "eletricistas"], ["3321000", "tecnicos-de-ar-condicionado"], ["3314707", "tecnicos-de-ar-condicionado"],
  ["7732201", "aluguel-de-equipamentos"], ["7732202", "aluguel-de-equipamentos"],
  ["7739099", "aluguel-de-equipamentos"], ["7739002", "aluguel-de-equipamentos"], ["7731400", "aluguel-de-equipamentos"],
  ["4399105", "pocos-artesianos"], ["9700500", null], ["9529199", "assistencia-tecnica"],

  // Beleza
  ["9602501", "saloes-de-beleza"], ["9602502", "esteticistas-e-clinicas-de-estetica"],
  ["9609206", "estudios-de-tatuagem"], ["9609205", "esteticistas-e-clinicas-de-estetica"],

  // Esporte e academias
  ["9313100", "academias"], ["8591100", "escolas-de-esportes"], ["9312300", "escolas-de-esportes"],
  ["8592901", "estudios-de-danca"], ["9319101", "escolas-de-esportes"], ["9319199", "escolas-de-esportes"],

  // Saúde
  ["8630501", "medicos"], ["8630502", "medicos"], ["8630503", "medicos"], ["8630504", "dentistas"],
  ["8630506", "medicos"], ["8630507", "medicos"], ["8630599", "medicos"], ["8610101", "medicos"],
  ["8610102", "medicos"], ["8650003", "psicologos"], ["8650004", "fisioterapia"], ["8650002", "nutricionistas"],
  ["8650006", "fonoaudiologos"], ["8650005", "fisioterapia"], ["8650001", "home-care"], ["8650007", "home-care"],
  ["8650099", "medicos"], ["8640202", "laboratorios"], ["8640201", "laboratorios"], ["8640203", "laboratorios"],
  ["8640204", "laboratorios"], ["8640205", "laboratorios"], ["8640206", "laboratorios"], ["8640207", "laboratorios"],
  ["8640208", "laboratorios"], ["8640209", "laboratorios"], ["8640210", "laboratorios"], ["8640211", "laboratorios"],
  ["8640212", "laboratorios"], ["8640213", "laboratorios"], ["8640214", "laboratorios"], ["8640299", "laboratorios"],
  ["8690901", "terapias-holisticas"], ["8690902", "medicos"], ["8690903", "medicos"], ["8690904", "podologos"],
  ["8690999", "medicos"], ["8712300", "home-care"], ["8711502", "casas-de-repouso"], ["8711501", "casas-de-repouso"],
  ["8711503", "casas-de-repouso"], ["8711504", "casas-de-repouso"], ["8711505", "casas-de-repouso"],
  ["8720499", "casas-de-repouso"], ["8730199", "casas-de-repouso"], ["8730101", "casas-de-repouso"],
  ["8621601", "medicos"], ["8621602", "medicos"], ["8622400", "medicos"], ["8630505", "medicos"],
  ["8660700", null], ["7500100", "veterinarios"], ["6550200", "planos-de-saude"],

  // Educação
  ["8511200", "creches"], ["8512100", "colegios"], ["8513900", "colegios"], ["8520100", "colegios"],
  ["8531700", "colegios"], ["8532500", "colegios"], ["8533300", "colegios"], ["8541400", "cursos-em-geral"],
  ["8542200", "cursos-em-geral"], ["8593700", "cursos-de-ingles"], ["8599603", "cursos-de-informatica"],
  ["8599605", "cursos-preparatorios"], ["8592903", "escolas-de-musica"], ["8592902", "cursos-em-geral"],
  ["8592999", "cursos-em-geral"], ["8599699", "cursos-em-geral"], ["8599604", "cursos-em-geral"],
  ["8599601", "autoescolas"], ["8599602", "cursos-em-geral"], ["8550301", null], ["8550302", "cursos-em-geral"],

  // Pessoas e família, pets
  ["4923001", "motoristas"], ["4923002", "motoristas"], ["4924800", "motoristas"], ["4929901", "motoristas"],
  ["4929902", "motoristas"], ["4929903", "agencias-de-viagens"], ["4929904", "agencias-de-viagens"],
  ["4930204", "mudancas-e-fretes"], ["9609208", "banho-e-tosa"], ["9609207", "hoteis-para-caes"],
  ["0159802", null], ["8011101", "seguranca-eletronica"],

  // Eventos
  ["8230001", "organizacao-de-eventos"], ["8230002", "casas-de-festas"], ["7420004", "fotografos"],
  ["7420001", "fotografos"], ["7420003", "fotografos"], ["9001906", "djs-e-som"], ["9001902", "djs-e-som"],
  ["7729202", "aluguel-para-festas"], ["7739001", "offshore"], ["7739003", "aluguel-para-festas"], ["7729203", "aluguel-para-festas"],
  ["7729201", "aluguel-para-festas"], ["7721700", "aluguel-para-festas"], ["9001901", "djs-e-som"],
  ["9001999", "organizacao-de-eventos"], ["9329899", "organizacao-de-eventos"], ["9329801", "bares"],
  ["9329804", null],

  // Veículos
  ["4520001", "mecanicos"], ["4520002", "funilaria-e-pintura"], ["4520003", "eletricistas-de-autos"],
  ["4520004", "mecanicos"], ["4520005", "lava-jatos"], ["4520006", "borracheiros"], ["4520007", "mecanicos"],
  ["4520008", "funilaria-e-pintura"], ["4530703", "autopecas"], ["4530704", "autopecas"], ["4530705", "autopecas"],
  ["4530701", "autopecas"], ["4530702", "autopecas"], ["4530706", "autopecas"], ["4541205", "autopecas"],
  ["4541206", "autopecas"], ["4543900", "oficinas-de-motos"], ["4511101", "revendas-de-veiculos"],
  ["4511102", "revendas-de-veiculos"], ["4511103", "revendas-de-veiculos"], ["4512902", "revendas-de-veiculos"],
  ["4541201", "revendas-de-veiculos"], ["4541202", "revendas-de-veiculos"], ["4541203", "revendas-de-veiculos"],
  ["4541204", "revendas-de-veiculos"], ["4731800", "postos-de-combustivel"], ["5223100", "estacionamentos"],
  ["7711000", "locadoras-de-veiculos"], ["7719599", "locadoras-de-veiculos"], ["5229002", "reboques"],
  ["5229001", null], ["4687702", "reciclagem"], ["4530", "autopecas"], ["2950600", "mecanicos"],

  // Turismo e hospedagem
  ["5510801", "hoteis"], ["5510802", "hoteis"], ["5510803", "hoteis"], ["5590601", "pousadas"],
  ["5590602", "pousadas"], ["5590603", "pousadas"], ["5590699", "pousadas"], ["7911200", "agencias-de-viagens"],
  ["7912100", "agencias-de-viagens"], ["7990200", "agencias-de-viagens"], ["5099801", "passeios-de-barco"],
  ["5099899", "passeios-de-barco"], ["5022001", "passeios-de-barco"], ["5021102", null],
  ["7490101", null], ["7721700", "aluguel-para-festas"], ["3317101", "nautica"], ["3317102", "nautica"],
  ["4763605", "nautica"], ["4294000", "construtoras"], ["7719501", "nautica"], ["7719502", null],

  // Serviços profissionais
  ["6920601", "contabilidade"], ["6920602", "contabilidade"], ["6911701", "advogados"], ["6911702", "advogados"],
  ["6911703", "consultoria-empresarial"], ["6912500", "cartorios"], ["6821801", "imobiliarias"], ["6821802", "imobiliarias"],
  ["6822600", "imobiliarias"], ["6810201", null], ["6810202", null], ["6810203", null], ["6622300", "corretores-de-seguros"],
  ["7111100", "engenharia-e-arquitetura"], ["7112000", "engenharia-e-arquitetura"], ["7119701", "engenharia-e-arquitetura"],
  ["7119702", "engenharia-e-arquitetura"], ["7119703", "engenharia-e-arquitetura"], ["7119704", "engenharia-e-arquitetura"],
  ["7119799", "engenharia-e-arquitetura"], ["7120100", "engenharia-e-arquitetura"], ["7410202", "engenharia-e-arquitetura"],
  ["7020400", "consultoria-empresarial"], ["7490104", "consultoria-empresarial"], ["7490199", "consultoria-empresarial"],
  ["7311400", "publicidade-e-marketing"], ["7312200", "publicidade-e-marketing"], ["7319001", "publicidade-e-marketing"],
  ["7319003", "publicidade-e-marketing"], ["7319004", "publicidade-e-marketing"], ["7319099", "publicidade-e-marketing"],
  ["7319002", null], ["7410201", "publicidade-e-marketing"], ["7410203", "publicidade-e-marketing"],
  ["7410299", "publicidade-e-marketing"], ["6202300", "assistencia-tecnica"], ["6201501", "assistencia-tecnica"],
  ["6201502", "assistencia-tecnica"], ["6203100", "assistencia-tecnica"], ["6204000", "assistencia-tecnica"],
  ["6209100", "assistencia-tecnica"], ["6190601", "assistencia-tecnica"], ["6190602", "assistencia-tecnica"],
  ["6190699", "assistencia-tecnica"], ["8299706", "lotericas"], ["8299707", null], ["6619302", null], ["8291100", null],
  ["0910600", "offshore"], ["3314714", "offshore"], ["7739002", "aluguel-de-equipamentos"], ["5030101", "offshore"],
  ["5030102", "offshore"], ["5030103", "offshore"], ["3317101", "nautica"], ["4299501", "construtoras"],
  ["7490103", "consultoria-empresarial"], ["7490105", "organizacao-de-eventos"], ["7120100", "engenharia-e-arquitetura"],

  // Completados depois da primeira carga (CNAEs sem regra em Rio das Ostras).
  ["7490102", "mergulho"], ["7420002", "fotografos"], ["7723300", "aluguel-para-festas"], ["7729299", "aluguel-para-festas"],
  ["9311500", "escolas-de-esportes"], ["9329803", "bares"], ["8720401", "ongs"], ["8800600", "ongs"],
  ["4541207", "autopecas"], ["4542102", "revendas-de-veiculos"], ["9001903", "organizacao-de-eventos"],
  ["9001904", "organizacao-de-eventos"], ["9003500", "organizacao-de-eventos"], ["4329101", "publicidade-e-marketing"],
  ["4329102", null], ["4511104", null], ["4511105", null], ["4511106", null], ["4512901", null], ["7320300", null],
  ["7420005", null], ["7722500", null], ["7733100", null], ["7740300", null], ["9002701", null], ["9002702", null],
  ["9101500", null], ["9102301", null], ["9102302", null], ["9103100", null], ["9321200", null],

  // Religião e espiritualidade (igreja, centro espírita e ordem são separados pelo nome)
  ["9491000", "igrejas"], ["9609202", null], ["9609204", null],

  // Outros serviços e ONGs
  ["9601701", "lavanderias"], ["9601702", "lavanderias"], ["9601703", "lavanderias"], ["9603301", "funerarias"],
  ["9603302", "funerarias"], ["9603303", "funerarias"], ["9603304", "funerarias"], ["9603305", "funerarias"],
  ["9603399", "funerarias"], ["1412602", "costureiras"], ["1412603", null], ["1413402", "costureiras"],
  ["9529106", "joias-e-bijuterias"], ["9430800", "ongs"], ["9499500", "ongs"], ["9493600", "ongs"], ["9609299", null],
  // Apostas e bingo ficam fora (regra do site: nada de apostas).
  ["9200", null], ["5310502", null],
];

const ordenado = [...MAPA_CNAE].sort((a, b) => b[0].length - a[0].length);

/** Categoria do CNAE pelo prefixo mais longo: slug, null (fora) ou undefined (sem regra). */
export function categoriaDoCnae(cnae) {
  for (const [prefixo, slug] of ordenado) {
    if (cnae.startsWith(prefixo)) return slug;
  }
  return undefined;
}

// Ajustes pelo nome, para CNAEs que juntam ramos diferentes. A ordem importa.
const AJUSTES_PELO_NOME = [
  { de: ["saloes-de-beleza"], termos: ["barbearia", "barber", "barba"], para: "barbearias" },
  { de: ["igrejas"], termos: ["espirita", "kardec", "umbanda", "candomble"], para: "centros-espiritas" },
  { de: ["igrejas", "ongs"], termos: ["maconaria", "maconica", "loja simbolica", "rosa cruz", "rosacruz", "amorc", "grande oriente"], para: "ordens-e-fraternidades" },
  { de: ["ongs"], termos: ["animal", "animais", " pet", "caes", "gatos", "bicho", "felino", "canino"], para: "ongs-de-protecao-animal" },
  { de: ["lanchonetes"], termos: ["pastel", "pastelaria"], para: "pastelarias" },
  { de: ["lanchonetes"], termos: ["cafe", "cafeteria", "coffee"], para: "cafeterias" },
  { de: ["lanchonetes"], termos: ["acai", "sorvete", "sorveteria", "gelato"], para: "sorveterias" },
  { de: ["lanchonetes", "restaurantes"], termos: ["pizza", "pizzaria"], para: "pizzarias" },
  { de: ["mercados", "lojas-de-variedades"], termos: ["tabacaria", "charutaria", "tabaco"], para: "tabacarias" },
  { de: ["lojas-de-variedades"], termos: ["agropecuaria", "agro "], para: "agropecuarias" },
  { de: ["floriculturas", "lojas-de-variedades"], termos: ["horto", "plantas", "jardinagem"], para: "hortos" },
  { de: ["lojas-de-material-de-construcao", "construtoras", "eletricistas"], termos: ["solar", "fotovoltaic"], para: "energia-solar" },
  { de: ["consultoria-empresarial", "engenharia-e-arquitetura", "tornearia-e-solda"], termos: ["offshore", "oil", "petroleo", "subsea", "marine"], para: "offshore" },
];

/** Corrige a categoria pelo nome normalizado (sem acento, minúsculo). */
export function ajustarPeloNome(slug, nomeNormalizado) {
  const nome = ` ${nomeNormalizado} `;
  for (const ajuste of AJUSTES_PELO_NOME) {
    if (ajuste.de.includes(slug) && ajuste.termos.some((t) => nome.includes(t))) return ajuste.para;
  }
  return slug;
}
