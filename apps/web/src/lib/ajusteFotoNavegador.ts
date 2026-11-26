// Tela do ajuste da foto (AjusteDaFoto.astro): desenha o recorte na moldura,
// converte o arrasto, a roda do mouse, as teclas e o controle de zoom em
// mudanças do recorte (contas em packages/domain/enquadramento.ts) e atualiza a
// prévia do topo do perfil com a foto ainda no aparelho. Devolve as três
// versões em JPEG do recorte, ou null quando a pessoa cancela.
import {
  ZOOM_MAXIMO,
  aplicarZoom,
  arrastoParaImagem,
  comecaInteira,
  moverRecorte,
  recorteInicial,
  recorteInteiro,
  zoomDoRecorte,
  type Recorte,
} from "@acheaqui/domain";
import { MEDIDAS_FOTO, avisoDeMedida, type FinalidadeFotoPerfil } from "@acheaqui/validation";
import { abrirImagem, versoesDaImagem, type FotoPreparada } from "./fotoNavegador";

const TITULOS: Record<FinalidadeFotoPerfil, string> = {
  perfil: "Ajustar a foto de perfil",
  capa: "Ajustar a foto de capa",
  galeria: "Ajustar a foto da galeria",
};
/** Lado maior da imagem usada na prévia: basta para o quadro do computador. */
const LADO_PREVIA = 800;
const PASSO_TECLA = 12;
const PASSO_ZOOM = 0.25;

// Reduz cada quadro da prévia (o perfil na largura real) até caber no modal.
function ajustarQuadros(raiz: HTMLElement): void {
  for (const quadro of raiz.querySelectorAll<HTMLElement>("[data-quadro]")) {
    const interno = quadro.querySelector<HTMLElement>("[data-quadro-interno]");
    const largura = Number(quadro.dataset.largura);
    if (!interno || !largura) continue;
    const disponivel = quadro.clientWidth - 16; // p-2 dos dois lados
    interno.style.zoom = String(Math.min(1, disponivel / largura));
  }
}

async function imagemDaPrevia(imagem: ImageBitmap, recorte: Recorte): Promise<string> {
  const escala = Math.min(1, LADO_PREVIA / Math.max(recorte.largura, recorte.altura));
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(recorte.largura * escala));
  tela.height = Math.max(1, Math.round(recorte.altura * escala));
  const contexto = tela.getContext("2d")!;
  contexto.fillStyle = "#ffffff";
  contexto.fillRect(0, 0, tela.width, tela.height);
  contexto.drawImage(imagem, recorte.x, recorte.y, recorte.largura, recorte.altura, 0, 0, tela.width, tela.height);
  const blob = await new Promise<Blob | null>((r) => tela.toBlob(r, "image/jpeg", 0.8));
  if (!blob) throw new Error("O navegador não gerou a prévia.");
  return URL.createObjectURL(blob);
}

/**
 * Abre o ajuste para a foto escolhida. Resolve com a foto pronta para o envio,
 * ou null quando a pessoa cancela. Erro (com mensagem para a pessoa) quando a
 * imagem não abre.
 */
export async function ajustarFoto(arquivo: File, finalidade: FinalidadeFotoPerfil): Promise<FotoPreparada | null> {
  const modal = document.querySelector<HTMLDialogElement>("#modal-ajuste-foto");
  const raiz = modal?.querySelector<HTMLElement>("[data-ajuste-foto]");
  if (!modal || !raiz) throw new Error("A tela de ajuste da foto não está nesta página.");

  const imagem = await abrirImagem(arquivo);
  const { width: largura, height: altura } = imagem;
  const [idealLargura, idealAltura] = MEDIDAS_FOTO[finalidade].ideal;
  const proporcao = idealLargura / idealAltura;
  const circulo = finalidade === "perfil" && raiz.dataset.tipo === "profissional";

  const q = <T extends Element>(seletor: string) => raiz.querySelector<T>(seletor)!;
  const moldura = q<HTMLElement>("[data-moldura]");
  const tela = q<HTMLCanvasElement>("[data-tela]");
  const zoom = q<HTMLInputElement>("[data-zoom]");
  const afastar = q<HTMLButtonElement>("[data-afastar]");
  const aproximar = q<HTMLButtonElement>("[data-aproximar]");
  const opcaoInteira = q<HTMLElement>("[data-opcao-inteira]");
  const inteira = q<HTMLInputElement>("[data-inteira]");
  const aviso = q<HTMLElement>("[data-aviso-medida]");
  const previa = q<HTMLElement>("[data-previa]");
  const previaGaleria = q<HTMLElement>("[data-previa-galeria]");
  const erro = q<HTMLElement>("[data-erro-ajuste]");
  const confirmar = q<HTMLButtonElement>("[data-confirmar-ajuste]");
  const titulo = modal.querySelector<HTMLElement>("[data-modal-titulo]");

  let recorte = recorteInicial(largura, altura, proporcao);
  // Na galeria, folheto ou foto fora do quadrado começa inteira (comecaInteira); na capa, a pessoa escolhe.
  let usarInteira = finalidade === "galeria" && comecaInteira(largura, altura, proporcao);
  let urlPrevia = "";
  let quadroPedido = 0;
  let previaPedida = 0;
  const fotosDaPrevia = [...raiz.querySelectorAll<HTMLElement>(`[data-foto="${finalidade}"]`)].flatMap((el) =>
    el instanceof HTMLImageElement ? [el] : [...el.querySelectorAll("img")],
  );
  const originais = fotosDaPrevia.map((img) => img.src);

  if (titulo) titulo.textContent = TITULOS[finalidade];
  opcaoInteira.hidden = finalidade === "perfil";
  inteira.checked = usarInteira;
  moldura.classList.toggle("cursor-grab", !usarInteira);
  previa.hidden = finalidade === "galeria";
  previaGaleria.hidden = finalidade !== "galeria";
  erro.hidden = true;
  confirmar.disabled = false;
  confirmar.textContent = "Enviar foto";
  moldura.style.aspectRatio = String(proporcao);

  const desenhar = () => {
    quadroPedido = 0;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(moldura.clientWidth * dpr));
    const h = Math.max(1, Math.round(w / proporcao));
    if (tela.width !== w || tela.height !== h) {
      tela.width = w;
      tela.height = h;
    }
    const c = tela.getContext("2d")!;
    c.clearRect(0, 0, w, h);
    if (usarInteira) {
      // A foto inteira, sem corte (no site, as sobras ficam com a própria foto desfocada; aqui, escuras).
      const escala = Math.min(w / largura, h / altura);
      const dw = largura * escala;
      const dh = altura * escala;
      c.drawImage(imagem, (w - dw) / 2, (h - dh) / 2, dw, dh);
      return;
    }
    c.drawImage(imagem, recorte.x, recorte.y, recorte.largura, recorte.altura, 0, 0, w, h);
    if (circulo) {
      // O autônomo aparece no círculo: os cantos ficam escurecidos.
      c.save();
      c.fillStyle = "rgba(20, 33, 61, 0.55)";
      c.beginPath();
      c.rect(0, 0, w, h);
      c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2, true);
      c.fill();
      c.restore();
    }
  };
  const pedirDesenho = () => {
    if (!quadroPedido) quadroPedido = requestAnimationFrame(desenhar);
  };

  const recorteFinal = () => (usarInteira ? recorteInteiro(largura, altura) : recorte);

  const atualizarAviso = () => {
    const final = recorteFinal();
    const texto = avisoDeMedida(finalidade, Math.round(final.largura), Math.round(final.altura), { inteira: usarInteira });
    aviso.hidden = !texto;
    const conselho = usarInteira ? "Se tiver, escolha uma foto maior." : "Afaste um pouco ou escolha outra foto.";
    aviso.textContent = texto ? `${texto} ${conselho}` : "";
  };

  const atualizarPrevia = () => {
    window.clearTimeout(previaPedida);
    previaPedida = window.setTimeout(async () => {
      if (finalidade === "galeria" || fotosDaPrevia.length === 0) return;
      try {
        const nova = await imagemDaPrevia(imagem, recorteFinal());
        if (urlPrevia) URL.revokeObjectURL(urlPrevia);
        urlPrevia = nova;
        for (const img of fotosDaPrevia) {
          img.removeAttribute("srcset");
          img.src = nova;
        }
      } catch (falha) {
        console.error("Ajuste da foto: prévia falhou", falha);
      }
    }, 120);
  };

  const mudou = () => {
    zoom.value = String(zoomDoRecorte(recorte, largura, altura, proporcao));
    afastar.disabled = usarInteira || Number(zoom.value) <= 1;
    aproximar.disabled = usarInteira || Number(zoom.value) >= ZOOM_MAXIMO;
    zoom.disabled = usarInteira;
    pedirDesenho();
    atualizarAviso();
    atualizarPrevia();
  };

  const definirZoom = (valor: number) => {
    recorte = aplicarZoom(recorte, valor, largura, altura, proporcao);
    mudou();
  };
  const mover = (dxTela: number, dyTela: number) => {
    const { dx, dy } = arrastoParaImagem(recorte, moldura.clientWidth, dxTela, dyTela);
    recorte = moverRecorte(recorte, dx, dy, largura, altura);
    mudou();
  };

  const controle = new AbortController();
  const { signal } = controle;
  let arrasto: { id: number; x: number; y: number } | null = null;

  moldura.addEventListener(
    "pointerdown",
    (e) => {
      if (usarInteira) return;
      arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY };
      moldura.setPointerCapture(e.pointerId);
    },
    { signal },
  );
  moldura.addEventListener(
    "pointermove",
    (e) => {
      if (!arrasto || e.pointerId !== arrasto.id) return;
      const dx = e.clientX - arrasto.x;
      const dy = e.clientY - arrasto.y;
      arrasto = { ...arrasto, x: e.clientX, y: e.clientY };
      mover(dx, dy);
    },
    { signal },
  );
  const soltar = (e: PointerEvent) => {
    if (arrasto && e.pointerId === arrasto.id) arrasto = null;
  };
  moldura.addEventListener("pointerup", soltar, { signal });
  moldura.addEventListener("pointercancel", soltar, { signal });
  moldura.addEventListener(
    "wheel",
    (e) => {
      if (usarInteira) return;
      e.preventDefault();
      definirZoom(Number(zoom.value) * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    },
    { signal, passive: false },
  );
  moldura.addEventListener(
    "keydown",
    (e) => {
      if (usarInteira) return;
      const teclas: Record<string, () => void> = {
        ArrowLeft: () => mover(PASSO_TECLA, 0),
        ArrowRight: () => mover(-PASSO_TECLA, 0),
        ArrowUp: () => mover(0, PASSO_TECLA),
        ArrowDown: () => mover(0, -PASSO_TECLA),
        "+": () => definirZoom(Number(zoom.value) + PASSO_ZOOM),
        "=": () => definirZoom(Number(zoom.value) + PASSO_ZOOM),
        "-": () => definirZoom(Number(zoom.value) - PASSO_ZOOM),
      };
      const acao = teclas[e.key];
      if (!acao) return;
      e.preventDefault();
      acao();
    },
    { signal },
  );
  zoom.addEventListener("input", () => definirZoom(Number(zoom.value)), { signal });
  afastar.addEventListener("click", () => definirZoom(Number(zoom.value) - PASSO_ZOOM), { signal });
  aproximar.addEventListener("click", () => definirZoom(Number(zoom.value) + PASSO_ZOOM), { signal });
  inteira.addEventListener(
    "change",
    () => {
      usarInteira = inteira.checked;
      moldura.classList.toggle("cursor-grab", !usarInteira);
      mudou();
    },
    { signal },
  );
  const observador = new ResizeObserver(() => {
    ajustarQuadros(raiz);
    pedirDesenho();
  });
  observador.observe(moldura);
  observador.observe(previa);

  return new Promise<FotoPreparada | null>((resolver) => {
    let resultado: FotoPreparada | null = null;

    confirmar.addEventListener(
      "click",
      async () => {
        confirmar.disabled = true;
        confirmar.textContent = "Preparando…";
        erro.hidden = true;
        try {
          resultado = await versoesDaImagem(imagem, finalidade, recorteFinal());
          modal.close();
        } catch (falha) {
          console.error("Ajuste da foto: preparo falhou", falha);
          erro.textContent = falha instanceof Error && falha.message ? falha.message : "Não foi possível preparar a foto. Tente de novo.";
          erro.hidden = false;
          confirmar.disabled = false;
          confirmar.textContent = "Enviar foto";
        }
      },
      { signal },
    );

    // Fechar (Cancelar, Esc, clique fora ou depois de preparar) limpa tudo e devolve a prévia como estava.
    modal.addEventListener(
      "close",
      () => {
        controle.abort();
        observador.disconnect();
        window.clearTimeout(previaPedida);
        if (quadroPedido) cancelAnimationFrame(quadroPedido);
        fotosDaPrevia.forEach((img, i) => (img.src = originais[i] ?? img.src));
        if (urlPrevia) URL.revokeObjectURL(urlPrevia);
        imagem.close();
        resolver(resultado);
      },
      { signal },
    );

    modal.showModal();
    ajustarQuadros(raiz);
    mudou();
    moldura.focus();
  });
}
