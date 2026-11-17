// Carrossel do topo (decisão de 17/11/2026): anda sozinho, a pessoa arrasta com
// o dedo para a frente e para trás (rolagem nativa do navegador) e, no
// computador, usa as setas. Ao tocar, arrastar, usar as setas ou passar o mouse,
// ele para e volta a andar alguns segundos depois. Com "reduzir movimento" no
// aparelho, não anda sozinho, mas continua arrastável.
//
// Giro contínuo: a faixa tem várias cópias da lista, e a posição é mantida
// entre o início da 2ª cópia e o da 3ª. Como as cópias são iguais, o salto de
// uma cópia inteira não aparece na tela.
import { criarAleatorio, embaralhar } from "@acheaqui/domain";

const VELOCIDADE_PX_POR_SEGUNDO = 30;
const PAUSA_DEPOIS_DO_TOQUE_MS = 4000;
const ESPERA_FIM_DA_ROLAGEM_MS = 150;
/** Quadro muito longo (aba em segundo plano) não vira um salto. */
const MAIOR_INTERVALO_MS = 100;

/**
 * Ordem sorteada a cada visita, com a mesma chance para todos (decisão de
 * 20/10/2026). A página fica em cache, então o sorteio é feito aqui; todas as
 * cópias recebem a mesma ordem.
 */
function sortear(listas: HTMLUListElement[]): void {
  const quantidade = listas[0]?.children.length ?? 0;
  const [semente] = crypto.getRandomValues(new Uint32Array(1));
  const ordem = embaralhar(
    Array.from({ length: quantidade }, (_, i) => i),
    criarAleatorio(semente ?? 0),
  );
  for (const lista of listas) {
    const itens = [...lista.children];
    if (itens.length !== quantidade) {
      console.error("Carrossel: as cópias têm quantidades diferentes de itens.");
      continue;
    }
    lista.replaceChildren(...ordem.map((i) => itens[i]!));
  }
}

/** Posição equivalente dentro da faixa [periodo, 2 × periodo). */
function noCiclo(posicao: number, periodo: number): number {
  return periodo + ((((posicao - periodo) % periodo) + periodo) % periodo);
}

export function iniciarCarrossel(raiz: HTMLElement): void {
  const trilho = raiz.querySelector<HTMLElement>("[data-carrossel-trilho]");
  const faixa = raiz.querySelector<HTMLElement>("[data-carrossel-faixa]");
  const listas = faixa ? [...faixa.querySelectorAll<HTMLUListElement>(":scope > ul")] : [];
  const [original, copia] = listas;
  if (!trilho || !faixa || !original || !copia) {
    console.error("Carrossel: faltam o trilho, a faixa ou as duas cópias da lista.");
    return;
  }
  sortear(listas);

  const menosMovimento = matchMedia("(prefers-reduced-motion: reduce)");
  let posicao = 0;
  let pausadoAte = 0;
  let mouseEmCima = false;
  let ultimoQuadro: number | undefined;
  let quadroPedido: number | undefined;
  let esperaRolagem: ReturnType<typeof setTimeout> | undefined;

  const periodo = () => copia.offsetLeft - original.offsetLeft;
  const focoDentro = () => trilho.contains(document.activeElement);
  const parado = () => menosMovimento.matches || mouseEmCima || focoDentro() || performance.now() < pausadoAte;
  const pausar = () => {
    pausadoAte = performance.now() + PAUSA_DEPOIS_DO_TOQUE_MS;
  };

  /** Cópias suficientes para sobrar uma lista inteira dos dois lados da tela. */
  function garantirCopias(): void {
    const p = periodo();
    if (p <= 0) return;
    const necessarias = 3 + Math.ceil(trilho!.clientWidth / p);
    while (faixa!.children.length < necessarias) faixa!.append(copia!.cloneNode(true));
  }

  /** Volta para a faixa do meio. Não mexe com o foco do teclado num anúncio, para ele não sumir da tela. */
  function ajustar(): void {
    const p = periodo();
    if (p <= 0 || focoDentro()) return;
    const destino = noCiclo(trilho!.scrollLeft, p);
    if (Math.abs(destino - trilho!.scrollLeft) >= 1) trilho!.scrollLeft = destino;
    posicao = trilho!.scrollLeft;
  }

  function quadro(agora: number): void {
    const intervalo = ultimoQuadro === undefined ? 0 : Math.min(agora - ultimoQuadro, MAIOR_INTERVALO_MS);
    ultimoQuadro = agora;
    if (parado()) {
      posicao = trilho!.scrollLeft;
    } else {
      const p = periodo();
      posicao += (VELOCIDADE_PX_POR_SEGUNDO * intervalo) / 1000;
      if (p > 0) posicao = noCiclo(posicao, p);
      trilho!.scrollLeft = posicao;
    }
    quadroPedido = requestAnimationFrame(quadro);
  }

  function ligar(): void {
    if (quadroPedido !== undefined) return;
    ultimoQuadro = undefined;
    quadroPedido = requestAnimationFrame(quadro);
  }

  function desligar(): void {
    if (quadroPedido !== undefined) cancelAnimationFrame(quadroPedido);
    quadroPedido = undefined;
  }

  /** Avança ou volta quantos cards cabem em três quartos da largura visível. */
  function andar(sentido: 1 | -1): void {
    pausar();
    ajustar();
    const card = original.firstElementChild as HTMLElement | null;
    const espaco = Number.parseFloat(getComputedStyle(original).columnGap) || 0;
    const largura = (card?.offsetWidth ?? 0) + espaco;
    const passo = largura > 0 ? Math.max(1, Math.floor((trilho!.clientWidth * 0.75) / largura)) * largura : trilho!.clientWidth * 0.75;
    trilho!.scrollBy({ left: sentido * passo, behavior: menosMovimento.matches ? "auto" : "smooth" });
  }

  garantirCopias();
  trilho.scrollLeft = periodo();
  posicao = trilho.scrollLeft;

  for (const evento of ["pointerdown", "touchstart", "wheel", "keydown"] as const) {
    trilho.addEventListener(evento, pausar, { passive: true });
  }
  // Só o mouse de verdade: no celular, o toque dispara "pointerenter" sem "pointerleave".
  raiz.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") mouseEmCima = true;
  });
  raiz.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") mouseEmCima = false;
  });
  // Rolagem feita pela pessoa (dedo, setas, trackpad): ajusta quando ela termina.
  trilho.addEventListener(
    "scroll",
    () => {
      if (!parado()) return;
      clearTimeout(esperaRolagem);
      esperaRolagem = setTimeout(ajustar, ESPERA_FIM_DA_ROLAGEM_MS);
    },
    { passive: true },
  );
  raiz.querySelector("[data-carrossel-voltar]")?.addEventListener("click", () => andar(-1));
  raiz.querySelector("[data-carrossel-avancar]")?.addEventListener("click", () => andar(1));
  addEventListener("resize", () => {
    garantirCopias();
    ajustar();
  });

  // Só anda enquanto aparece na tela.
  new IntersectionObserver(([registro]) => (registro?.isIntersecting ? ligar() : desligar())).observe(raiz);
}
