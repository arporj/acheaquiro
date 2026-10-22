import type { Anunciante } from "@acheaqui/types";

// Mensagens prontas dos botões de WhatsApp (item 4.5 da especificação).
export const MENSAGEM_ORCAMENTO = "Olá! Encontrei você no Ache Aqui RO e gostaria de um orçamento.";
export const MENSAGEM_INFORMACAO = "Olá! Encontrei você no Ache Aqui RO e gostaria de uma informação.";

/** WhatsApp da equipe, destino de todos os botões de contato (decisão de 22/10/2026). */
export const WHATSAPP_EQUIPE = "5521988520666";

export function linkWhatsApp(numero: string, mensagem: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export function linkTelefone(numero: string): string {
  return `tel:+${numero}`;
}

export function linkComoChegar(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

export function formatarTelefone(numero: string): string {
  const local = numero.replace(/^55/, "");
  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  const meio = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`;
}

export function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Links dos botões de contato do perfil (cartão no computador e barra no celular). */
export function linksContato(anunciante: Anunciante) {
  const endereco = anunciante.tipo === "comercio" ? anunciante.enderecos[0] : undefined;
  return {
    orcamento: linkWhatsApp(anunciante.whatsapp, MENSAGEM_ORCAMENTO),
    mensagem: linkWhatsApp(anunciante.whatsapp, MENSAGEM_INFORMACAO),
    telefone: linkTelefone(anunciante.telefone ?? anunciante.whatsapp),
    comoChegar: endereco && linkComoChegar(endereco.latitude, endereco.longitude),
  };
}
