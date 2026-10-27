// DADOS FICTÍCIOS para o layout. No sistema real, planos, extras, valores e
// limites ficam em tabela no banco, editável pela administração (itens 6.2 a
// 6.4). Os números abaixo são os mesmos das migrations de dados iniciais e de extras.
import type { Extra, Plano, RegrasCobranca } from "@acheaqui/types";

const anual = { mesesCobradosNoAnual: 10 };

/** Limites na ordem: fotos, categorias adicionais, encartes por semana, produtos. */
function plano(
  base: Pick<Plano, "id" | "tipo" | "nome" | "nivel" | "selo" | "valorMensalCentavos" | "temRelatorio">,
  [limiteFotos, limiteCategoriasAdicionais, limiteEncartesSemana, limiteProdutos]: [number, number, number, number],
): Plano {
  return { ...base, ...anual, limiteFotos, limiteCategoriasAdicionais, limiteEncartesSemana, limiteProdutos };
}

export const planos: Plano[] = [
  plano({ id: "prof-basico", tipo: "profissional", nome: "Básico", nivel: 1, selo: "nenhum", valorMensalCentavos: 199, temRelatorio: false }, [1, 0, 0, 0]),
  plano({ id: "prof-profissional", tipo: "profissional", nome: "Profissional", nivel: 2, selo: "transparente", valorMensalCentavos: 990, temRelatorio: false }, [5, 1, 0, 0]),
  plano({ id: "prof-premium", tipo: "profissional", nome: "Premium", nivel: 3, selo: "prata", valorMensalCentavos: 2990, temRelatorio: true }, [10, 3, 0, 0]),
  plano({ id: "prof-superpremium", tipo: "profissional", nome: "SuperPremium", nivel: 4, selo: "ouro", valorMensalCentavos: 4990, temRelatorio: true }, [30, 5, 0, 0]),
  plano({ id: "com-gratuito", tipo: "comercio", nome: "Gratuito", nivel: 1, selo: "nenhum", valorMensalCentavos: 0, temRelatorio: false }, [0, 0, 0, 0]),
  plano({ id: "com-basico", tipo: "comercio", nome: "Básico", nivel: 2, selo: "transparente", valorMensalCentavos: 1990, temRelatorio: false }, [5, 1, 2, 10]),
  plano({ id: "com-vitrine", tipo: "comercio", nome: "Vitrine", nivel: 3, selo: "prata", valorMensalCentavos: 5990, temRelatorio: true }, [15, 3, 4, 30]),
  plano({ id: "com-premium", tipo: "comercio", nome: "Premium", nivel: 4, selo: "ouro", valorMensalCentavos: 9990, temRelatorio: true }, [40, 5, 7, 200]),
];

const mensal = { cobranca: "mensal" as const, ...anual };
const destaque = { aceitaDescontoFundador: false, permiteAnual: true };
const pacote = { aceitaDescontoFundador: true, permiteAnual: true };

export const extrasDisponiveis: Extra[] = [
  {
    id: "destaque-exclusivo",
    nome: "Destaque Exclusivo",
    descricao: "Área acima do carrossel, no topo de todas as páginas, só para você nos dias que escolher no calendário.",
    valorMensalCentavos: 50000,
    ...anual,
    cobranca: "por_dia",
    porDia: {
      diariaCentavos: 2490,
      valorBlocoCentavos: 50000,
      diasPorBloco: 30,
      minimoDiasParaBloco: 21,
      antecedenciaDias: 2,
    },
    aceitaDescontoFundador: false,
    permiteAnual: false,
  },
  {
    id: "super-destaque",
    nome: "Super Destaque",
    descricao:
      "Uma vaga no carrossel do topo de todas as páginas do site. São no máximo 8 vagas, e a ordem é sorteada a cada visita.",
    valorMensalCentavos: 8990,
    ...mensal,
    ...destaque,
  },
  {
    id: "link-destacado-cidade",
    nome: "Link destacado na cidade toda",
    descricao:
      "Uma das 3 primeiras posições da lista da sua categoria em todas as buscas, com ou sem bairro escolhido. No máximo 3 por categoria. Você continua também na sua posição normal da lista.",
    valorMensalCentavos: 7990,
    unidade: "por categoria",
    ...mensal,
    ...destaque,
  },
  {
    id: "link-destacado",
    nome: "Link destacado nos bairros",
    descricao:
      "Uma das 3 primeiras posições da lista da sua categoria, quando o visitante escolhe um dos 3 bairros do pacote. Com mais de 3 destacados, há sorteio a cada busca. Você continua também na sua posição normal da lista.",
    valorMensalCentavos: 3990,
    unidade: "por categoria, em 3 bairros",
    ...mensal,
    ...destaque,
  },
  {
    id: "destacado-plus",
    nome: "Destacado Plus nos bairros",
    descricao: "Igual ao link destacado nos bairros, com o dobro de chance no sorteio.",
    valorMensalCentavos: 5990,
    unidade: "por categoria, em 3 bairros",
    ...mensal,
    ...destaque,
  },
  {
    id: "categoria-adicional",
    nome: "Categoria adicional",
    descricao: "Apareça em mais 1 categoria, além das incluídas no plano.",
    valorMensalCentavos: 190,
    unidade: "por categoria",
    ...mensal,
    ...pacote,
  },
  {
    id: "pacote-fotos",
    nome: "Pacote de fotos",
    descricao: "Mais 10 fotos, além das incluídas no plano.",
    valorMensalCentavos: 490,
    ...mensal,
    ...pacote,
  },
  {
    id: "encarte-adicional",
    nome: "Encarte adicional",
    descricao: "Mais 1 encarte de ofertas por semana, além dos incluídos no plano. Para comércios.",
    valorMensalCentavos: 490,
    ...mensal,
    ...pacote,
  },
  {
    id: "pacote-produtos",
    nome: "Pacote de produtos",
    descricao: "Mais 50 produtos na vitrine, além dos incluídos no plano. Para comércios.",
    valorMensalCentavos: 1490,
    ...mensal,
    ...pacote,
  },
  {
    id: "endereco-adicional",
    nome: "Endereço adicional",
    descricao: "Mais 1 loja na mesma cidade, com endereço e horário próprios. Para comércios.",
    valorMensalCentavos: 990,
    ...mensal,
    ...pacote,
  },
];

export const regrasCobranca: RegrasCobranca = {
  // Decisão de 21/10/2026: 50% nos 3 primeiros anos e 25% do 4º em diante.
  escalaDescontoFundador: [{ ateAno: 3, percentual: 50 }, { percentual: 25 }],
  prazoFundador: "2026-11-26",
  toleranciaVencimentoDias: 7,
  percentualCarteira: 5,
};
