// Botões "Copiar", no navegador: [data-copiar] leva o texto a copiar e
// [data-copiado] (o mais próximo dentro de [data-copiar-grupo], ou o da
// página) mostra o resultado. Sem alert(): o aviso aparece na própria tela.

export function ligarBotoesCopiar(): void {
  for (const botao of document.querySelectorAll<HTMLButtonElement>("[data-copiar]")) {
    botao.addEventListener("click", async () => {
      const grupo = botao.closest("[data-copiar-grupo]") ?? document;
      const aviso = grupo.querySelector<HTMLElement>("[data-copiado]");
      try {
        await navigator.clipboard.writeText(botao.dataset.copiar ?? "");
        if (aviso) aviso.textContent = botao.dataset.copiadoTexto ?? "Copiado.";
      } catch (erro) {
        // Navegador sem permissão de copiar: a pessoa copia do texto na tela.
        console.error("Copiar falhou", erro);
        if (aviso) aviso.textContent = "Não deu para copiar. Toque e segure no texto para copiar.";
      }
    });
  }
}
