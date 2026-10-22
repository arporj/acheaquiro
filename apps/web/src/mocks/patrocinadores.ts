// DADOS FICTÍCIOS para o layout dos patrocinadores (proposta Patrocinadores
// v3). Empresas inventadas; no sistema real, cotas e valores ficam no banco.
import type { Patrocinador } from "@acheaqui/types";

const WHATS = "5522999990000";

export const patrocinadores: Patrocinador[] = [
  { id: "p01", nome: "Construmar Materiais", ramo: "Material de construção", frase: "Tudo para a sua obra, do alicerce ao acabamento.", whatsapp: WHATS, cor: "#F57C00", cota: "master" },
  { id: "p02", nome: "Costa Net Fibra", ramo: "Provedor de internet", frase: "Internet de fibra em todos os bairros da cidade.", whatsapp: WHATS, cor: "#2563EB", cota: "ouro" },
  { id: "p03", nome: "Cooperativa Litoral", ramo: "Cooperativa de crédito", frase: "Crédito justo para quem empreende na cidade.", whatsapp: WHATS, cor: "#1E9E4A", cota: "ouro" },
  { id: "p04", nome: "Imobiliária Maré Alta", ramo: "Imobiliária", frase: "Compra, venda e aluguel em Rio das Ostras.", whatsapp: WHATS, cor: "#0E9F94", cota: "ouro" },
  { id: "p05", nome: "Autoescola Rota Certa", ramo: "Autoescola", frase: "Sua habilitação sem complicação.", whatsapp: WHATS, cor: "#E53935", cota: "apoio" },
  { id: "p06", nome: "Clínica Bem Viver", ramo: "Clínica", frase: "Consultas e exames perto de você.", whatsapp: WHATS, cor: "#7E3FC4", cota: "apoio" },
  { id: "p07", nome: "Ótica Visão Clara", ramo: "Ótica", frase: "Óculos e lentes com exame de vista.", whatsapp: WHATS, cor: "#475569", cota: "apoio" },
  { id: "p08", nome: "Gráfica Ponto Final", ramo: "Gráfica", frase: "Cartões, banners e adesivos em 24 horas.", whatsapp: WHATS, cor: "#D81B7A", cota: "apoio" },
  { id: "p09", nome: "Academia Movimento", ramo: "Academia", frase: "Treine perto de casa, de segunda a sábado.", whatsapp: WHATS, cor: "#A2264A", cota: "apoio" },
  { id: "p10", nome: "Contábil Âncora", ramo: "Contabilidade", frase: "Abra e mantenha sua empresa em dia.", whatsapp: WHATS, cor: "#9A5B2E", cota: "apoio" },
  { id: "p11", nome: "Depósito Pedra Forte", ramo: "Material de construção", frase: "Areia, pedra e cimento com entrega no mesmo dia.", whatsapp: WHATS, cor: "#9A5B2E", cota: "grupo", grupo: "Comércios" },
  { id: "p12", nome: "Ferragens Âncora", ramo: "Ferragens", frase: "Ferramentas e ferragens para o profissional.", whatsapp: WHATS, cor: "#475569", cota: "grupo", grupo: "Serviços para casa" },
  { id: "p13", nome: "Laticínios Serra Azul", ramo: "Distribuidora de laticínios", frase: "Queijos e frios para pizzarias e restaurantes.", whatsapp: WHATS, cor: "#1E9BE0", cota: "categoria", categoriaId: "pizzaria" },
  { id: "p14", nome: "Elétrica Faísca", ramo: "Loja de material elétrico", frase: "Fios, disjuntores e lâmpadas com preço de atacado.", whatsapp: WHATS, cor: "#F2A900", cota: "categoria", categoriaId: "eletricista" },
];
