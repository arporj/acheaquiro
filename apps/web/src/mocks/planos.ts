// DADOS FICTÍCIOS para o layout. No sistema real, planos, extras, valores e
// limites ficam em tabela no banco, editável pela administração (itens 6.2 a
// 6.4). Os números abaixo são os mesmos da migration de dados iniciais.
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

export const extrasDisponiveis: Extra[] = [
  {
    id: "destaque-exclusivo",
    nome: "Destaque Exclusivo do Mês",
    descricao: "Área acima do carrossel, no topo de todas as páginas, só para você durante 1 mês.",
    valorMensalCentavos: 50000,
    ...anual,
    aceitaDescontoFundador: false,
    permiteAnual: false,
  },
  {
    id: "super-destaque",
    nome: "Super Destaque",
    descricao: "Uma vaga no carrossel do topo de todas as páginas do site. São no máximo 8 vagas.",
    valorMensalCentavos: 8990,
    ...anual,
    aceitaDescontoFundador: false,
    permiteAnual: true,
  },
  {
    id: "link-patrocinado",
    nome: "Link patrocinado",
    descricao: "Uma das 3 primeiras posições da lista, na categoria e no bairro que você escolher. Com mais de 3 patrocinados, há sorteio a cada busca.",
    valorMensalCentavos: 3990,
    unidade: "por categoria e bairro",
    ...anual,
    aceitaDescontoFundador: false,
    permiteAnual: true,
  },
  {
    id: "patrocinado-plus",
    nome: "Patrocinado Plus",
    descricao: "Igual ao link patrocinado, com o dobro de chance no sorteio.",
    valorMensalCentavos: 5990,
    unidade: "por categoria e bairro",
    ...anual,
    aceitaDescontoFundador: false,
    permiteAnual: true,
  },
  {
    id: "categoria-adicional",
    nome: "Categoria adicional",
    descricao: "Apareça em mais 1 categoria, além das incluídas no plano.",
    valorMensalCentavos: 190,
    unidade: "por categoria",
    ...anual,
    aceitaDescontoFundador: true,
    permiteAnual: true,
  },
  {
    id: "pacote-fotos",
    nome: "Pacote de fotos",
    descricao: "Mais 10 fotos, além das incluídas no plano.",
    valorMensalCentavos: 490,
    ...anual,
    aceitaDescontoFundador: true,
    permiteAnual: true,
  },
  {
    id: "encarte-adicional",
    nome: "Encarte adicional",
    descricao: "Mais 1 encarte de ofertas por semana, além dos incluídos no plano. Para comércios.",
    valorMensalCentavos: 490,
    ...anual,
    aceitaDescontoFundador: true,
    permiteAnual: true,
  },
  {
    id: "pacote-produtos",
    nome: "Pacote de produtos",
    descricao: "Mais 50 produtos na vitrine, além dos incluídos no plano. Para comércios.",
    valorMensalCentavos: 1490,
    ...anual,
    aceitaDescontoFundador: true,
    permiteAnual: true,
  },
  {
    id: "endereco-adicional",
    nome: "Endereço adicional",
    descricao: "Mais 1 loja na mesma cidade, com endereço e horário próprios. Para comércios.",
    valorMensalCentavos: 990,
    ...anual,
    aceitaDescontoFundador: true,
    permiteAnual: true,
  },
];

export const regrasCobranca: RegrasCobranca = {
  percentualDescontoFundador: 50,
  prazoFundador: "2026-11-26",
  toleranciaVencimentoDias: 7,
};
