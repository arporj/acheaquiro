import { normalizar } from "@/lib/texto";

/**
 * Busca de artistas no navegador: esconde os itens [data-artista] que não
 * contêm o termo digitado em [data-busca-artista] e mostra [data-sem-artista]
 * quando nenhum sobra. Usada em /agenda e /artistas.
 */
export function ligarBuscaArtista(): void {
  const campo = document.querySelector<HTMLInputElement>("[data-busca-artista]");
  const itens = [...document.querySelectorAll<HTMLElement>("[data-artista]")];
  const vazio = document.querySelector<HTMLElement>("[data-sem-artista]");
  campo?.addEventListener("input", () => {
    const termo = normalizar(campo.value);
    let visiveis = 0;
    for (const item of itens) {
      item.hidden = termo !== "" && !(item.dataset.artista ?? "").includes(termo);
      if (!item.hidden) visiveis++;
    }
    if (vazio) vazio.hidden = visiveis > 0;
  });
}
