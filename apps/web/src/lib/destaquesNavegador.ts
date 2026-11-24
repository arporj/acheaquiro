// Troca dos destaques do bloco "Acontece em Rio das Ostras" (decisão H3 de
// 24/11/2026): um destaque por vez, passando para o próximo a cada
// SEGUNDOS_POR_DESTAQUE. Ao tocar, arrastar, passar o mouse, usar o teclado ou
// os pontinhos, para e volta a andar alguns segundos depois, como o Carrossel
// (carrosselNavegador.ts). Com "reduzir movimento" no aparelho, não anda
// sozinho, mas continua arrastável e com os pontinhos.
import { SEGUNDOS_POR_DESTAQUE } from "@acheaqui/domain";

const PAUSA_DEPOIS_DO_TOQUE_MS = 4000;
const ESPERA_FIM_DA_ROLAGEM_MS = 150;

export function ligarDestaques(bloco: HTMLElement): void {
  const lista = bloco.querySelector<HTMLUListElement>("[data-destaques-lista]");
  const pontos = [...bloco.querySelectorAll<HTMLButtonElement>("[data-destaques-ponto]")];
  if (!lista || lista.children.length < 2) return;
  const quantidade = lista.children.length;
  const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");

  let atual = 0;
  let pausadoAte = 0;
  let mouseDentro = false;
  let focoDentro = false;

  const marcar = (indice: number) => {
    atual = indice;
    pontos.forEach((p, i) => (i === indice ? p.setAttribute("aria-current", "true") : p.removeAttribute("aria-current")));
  };

  const irPara = (indice: number) => {
    const destino = ((indice % quantidade) + quantidade) % quantidade;
    lista.scrollTo({ left: destino * lista.clientWidth, behavior: reduzirMovimento.matches ? "auto" : "smooth" });
    marcar(destino);
  };

  const pausar = () => {
    pausadoAte = Date.now() + PAUSA_DEPOIS_DO_TOQUE_MS;
  };

  window.setInterval(() => {
    if (reduzirMovimento.matches || document.hidden || mouseDentro || focoDentro || Date.now() < pausadoAte) return;
    irPara(atual + 1);
  }, SEGUNDOS_POR_DESTAQUE * 1000);

  // Arrasto com o dedo (rolagem nativa): ao parar, marca o destaque que ficou na tela.
  let esperaRolagem: number | undefined;
  lista.addEventListener(
    "scroll",
    () => {
      window.clearTimeout(esperaRolagem);
      esperaRolagem = window.setTimeout(() => {
        if (lista.clientWidth > 0) marcar(Math.min(quantidade - 1, Math.round(lista.scrollLeft / lista.clientWidth)));
      }, ESPERA_FIM_DA_ROLAGEM_MS);
    },
    { passive: true },
  );

  lista.addEventListener("pointerdown", pausar, { passive: true });
  lista.addEventListener("touchstart", pausar, { passive: true });
  bloco.addEventListener("mouseenter", () => (mouseDentro = true));
  bloco.addEventListener("mouseleave", () => {
    mouseDentro = false;
    pausar();
  });
  bloco.addEventListener("focusin", () => (focoDentro = true));
  bloco.addEventListener("focusout", () => {
    focoDentro = false;
    pausar();
  });

  pontos.forEach((ponto, i) =>
    ponto.addEventListener("click", () => {
      pausar();
      irPara(i);
    }),
  );

  // Ao mudar a largura da tela, mantém o destaque atual no lugar.
  window.addEventListener("resize", () => lista.scrollTo({ left: atual * lista.clientWidth }));
}
