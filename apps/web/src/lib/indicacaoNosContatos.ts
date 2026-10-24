// Script do navegador: acrescenta a indicação do representante (cookie do link
// /r/codigo) no fim da mensagem dos links de contato com a equipe
// (a[data-contato-equipe]). Fica no navegador porque as páginas ficam no cache.
// Basta importar: o módulo roda uma vez por página, mesmo importado por mais
// de um componente.
import { WHATSAPP_EQUIPE, linkWhatsApp } from "./contato";
import { lerIndicacao, linhaIndicacao } from "./indicacao";

const codigo = lerIndicacao(document.cookie);
if (codigo) {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-contato-equipe]")) {
    link.href = linkWhatsApp(WHATSAPP_EQUIPE, `${link.dataset.contatoEquipe}${linhaIndicacao(codigo)}`);
  }
}
