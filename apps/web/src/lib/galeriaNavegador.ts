// Foto ampliada da galeria do perfil (Galeria.astro, decisão de 26/11/2026):
// tocar numa foto abre a tela cheia com a foto inteira (versão de 1.600 px), a
// legenda e o contador; as setas, as teclas ← e →, e o arrasto para o lado
// trocam a foto, com volta ao começo. Esc e o botão Fechar fecham.

interface FotoAmpliada {
  url: string;
  legenda: string;
  rotulo: string;
}

/** Arrasto mínimo, em pixels, para trocar a foto. */
const ARRASTO_MINIMO = 50;

/** Índice da foto depois de andar `passo` fotos, voltando ao começo (ou ao fim) da galeria. */
export function indiceVizinho(atual: number, passo: number, total: number): number {
  if (total <= 0) return 0;
  return (((atual + passo) % total) + total) % total;
}

function lerFotos(dialogo: HTMLElement): FotoAmpliada[] {
  try {
    const fotos: unknown = JSON.parse(dialogo.dataset.fotos ?? "[]");
    return Array.isArray(fotos) ? (fotos as FotoAmpliada[]) : [];
  } catch (erro) {
    console.error("Galeria: lista de fotos ilegível", erro);
    return [];
  }
}

export function ligarGaleriaAmpliada(): void {
  const dialogo = document.querySelector<HTMLDialogElement>("dialog[data-galeria-ampliada]");
  if (!dialogo) return;
  const fotos = lerFotos(dialogo);
  if (fotos.length === 0) return;

  const q = <T extends Element>(seletor: string) => dialogo.querySelector<T>(seletor)!;
  const imagem = q<HTMLImageElement>("[data-imagem-ampliada]");
  const contador = q<HTMLElement>("[data-contador]");
  const legenda = q<HTMLElement>("[data-legenda-ampliada]");
  const palco = q<HTMLElement>("[data-palco]");
  const anterior = q<HTMLButtonElement>("[data-anterior]");
  const proxima = q<HTMLButtonElement>("[data-proxima]");
  const variasFotos = fotos.length > 1;
  anterior.hidden = !variasFotos;
  proxima.hidden = !variasFotos;

  let atual = 0;
  let origem: HTMLElement | null = null;

  const mostrar = (indice: number) => {
    atual = indiceVizinho(indice, 0, fotos.length);
    const foto = fotos[atual]!;
    imagem.src = foto.url;
    imagem.alt = foto.legenda || (foto.rotulo ? `Foto de ${foto.rotulo.toLowerCase()}` : "Foto da galeria");
    contador.textContent = [foto.rotulo, variasFotos ? `${atual + 1} de ${fotos.length}` : ""].filter(Boolean).join(" · ");
    legenda.textContent = foto.legenda;
    // Já carrega as vizinhas, para a troca ser imediata.
    if (variasFotos) {
      for (const passo of [1, -1]) new Image().src = fotos[indiceVizinho(atual, passo, fotos.length)]!.url;
    }
  };
  const andar = (passo: number) => mostrar(atual + passo);

  for (const botao of document.querySelectorAll<HTMLButtonElement>("[data-ampliar]")) {
    botao.addEventListener("click", () => {
      origem = botao;
      mostrar(Number(botao.dataset.ampliar));
      // A página não rola por trás da foto ampliada.
      document.documentElement.style.overflow = "hidden";
      dialogo.showModal();
    });
  }

  q<HTMLButtonElement>("[data-fechar-ampliada]").addEventListener("click", () => dialogo.close());
  anterior.addEventListener("click", () => andar(-1));
  proxima.addEventListener("click", () => andar(1));
  dialogo.addEventListener("keydown", (evento) => {
    if (!variasFotos) return;
    if (evento.key === "ArrowLeft") andar(-1);
    else if (evento.key === "ArrowRight") andar(1);
    else return;
    evento.preventDefault();
  });

  let inicio: { id: number; x: number; y: number } | null = null;
  palco.addEventListener("pointerdown", (evento) => {
    if (evento.target instanceof Element && evento.target.closest("button")) return;
    inicio = { id: evento.pointerId, x: evento.clientX, y: evento.clientY };
  });
  palco.addEventListener("pointerup", (evento) => {
    if (!inicio || evento.pointerId !== inicio.id) return;
    const dx = evento.clientX - inicio.x;
    const dy = evento.clientY - inicio.y;
    inicio = null;
    if (variasFotos && Math.abs(dx) >= ARRASTO_MINIMO && Math.abs(dx) > Math.abs(dy)) andar(dx < 0 ? 1 : -1);
  });
  palco.addEventListener("pointercancel", () => (inicio = null));

  dialogo.addEventListener("close", () => {
    document.documentElement.style.overflow = "";
    imagem.removeAttribute("src");
    origem?.focus();
  });
}
