// DADOS FICTÍCIOS para o layout. No sistema real, planos, valores e limites
// ficam em tabela no banco, editável pela administração (itens 6.2 e 6.3).
import type { Plano } from "@acheaqui/types";

export const planos: Plano[] = [
  { id: "prof-basico", tipo: "profissional", nome: "Básico", selo: "nenhum", nivel: 1, valorMensal: 1.99 },
  { id: "prof-profissional", tipo: "profissional", nome: "Profissional", selo: "transparente", nivel: 2, valorMensal: 9.9 },
  { id: "prof-premium", tipo: "profissional", nome: "Premium", selo: "prata", nivel: 3, valorMensal: 29.9 },
  { id: "prof-superpremium", tipo: "profissional", nome: "SuperPremium", selo: "ouro", nivel: 4, valorMensal: 49.9 },
  { id: "com-gratuito", tipo: "comercio", nome: "Gratuito", selo: "nenhum", nivel: 1, valorMensal: 0 },
  { id: "com-basico", tipo: "comercio", nome: "Básico", selo: "transparente", nivel: 2, valorMensal: 19.9 },
  { id: "com-vitrine", tipo: "comercio", nome: "Vitrine", selo: "prata", nivel: 3, valorMensal: 59.9 },
  { id: "com-premium", tipo: "comercio", nome: "Premium", selo: "ouro", nivel: 4, valorMensal: 99.9 },
];
