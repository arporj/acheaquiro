// Mensagens prontas dos botões de WhatsApp (item 4.5 da especificação).
export const MENSAGEM_ORCAMENTO = "Olá! Encontrei você no Ache Aqui RO e gostaria de um orçamento.";
export const MENSAGEM_INFORMACAO = "Olá! Encontrei você no Ache Aqui RO e gostaria de uma informação.";

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
