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

/**
 * Rota no Google Maps: pela coordenada, quando o endereço já foi localizado no
 * mapa; senão, pelo endereço escrito (comércio importado da Receita).
 */
export function linkComoChegar(destino: { latitude?: number; longitude?: number; endereco: string }): string {
  const ponto =
    destino.latitude !== undefined && destino.longitude !== undefined
      ? `${destino.latitude},${destino.longitude}`
      : encodeURIComponent(destino.endereco);
  return `https://www.google.com/maps/dir/?api=1&destination=${ponto}`;
}

/** Endereço escrito para a rota, com a cidade (o Google acha a rua certa). */
export function enderecoParaRota(endereco: { logradouro: string; numero: string }, bairro: string): string {
  const numero = endereco.numero === "S/N" ? "" : `, ${endereco.numero}`;
  return `${endereco.logradouro}${numero} - ${bairro}, Rio das Ostras - RJ`;
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

/**
 * Links dos botões de contato do perfil (cartão no computador e barra no
 * celular). Sem WhatsApp nem telefone (comércio importado da Receita), só a rota.
 */
export function linksContato(anunciante: Anunciante, comoChegar?: string) {
  const numero = anunciante.telefone ?? anunciante.whatsapp;
  return {
    orcamento: anunciante.whatsapp && linkWhatsApp(anunciante.whatsapp, MENSAGEM_ORCAMENTO),
    mensagem: anunciante.whatsapp && linkWhatsApp(anunciante.whatsapp, MENSAGEM_INFORMACAO),
    telefone: numero && linkTelefone(numero),
    numero,
    comoChegar,
  };
}
