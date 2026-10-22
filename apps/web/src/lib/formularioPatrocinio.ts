// Formulário de patrocínio na administração (src/pages/admin/patrocinadores.astro),
// no navegador: monta os campos a partir do <template>, mostra o grupo ou a
// categoria conforme a cota e converte o logo escolhido para WebP no tamanho
// exato da cota, mantendo a transparência e sem cortar (a imagem é encaixada
// no centro). O servidor confere de novo tipo, tamanho e dimensões.

const LIMITE_LOGO = 2 * 1024 * 1024;

interface Valores {
  cota?: string;
  grupo?: string | null;
  categoria_id?: string | null;
  nome?: string;
  ramo?: string;
  frase?: string;
  whatsapp?: string | null;
  logo?: string | null;
}

/** 5522999990000 → (22) 99999-0000, para editar no mesmo formato em que se digita. */
function telefoneLegivel(numero: string): string {
  const local = numero.replace(/^55/, "");
  const meio = local.length === 11 ? 7 : 6;
  return `(${local.slice(0, 2)}) ${local.slice(2, meio)}-${local.slice(meio)}`;
}

async function converterLogo(arquivo: File, largura: number, altura: number): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  const contexto = tela.getContext("2d")!;
  const escala = Math.min(largura / imagem.width, altura / imagem.height);
  const w = Math.round(imagem.width * escala);
  const h = Math.round(imagem.height * escala);
  contexto.drawImage(imagem, Math.round((largura - w) / 2), Math.round((altura - h) / 2), w, h);
  imagem.close();
  const blob = await new Promise<Blob | null>((r) => tela.toBlob(r, "image/webp", 0.9));
  // Navegadores sem WebP devolvem PNG no lugar: o servidor recusaria.
  if (!blob || blob.type !== "image/webp") throw new Error("Este navegador não gera WebP. Use o Chrome, o Edge ou o Firefox.");
  if (blob.size > LIMITE_LOGO) throw new Error("O logo convertido passou de 2 MB. Use uma imagem mais simples.");
  return blob;
}

export function ligarFormularioPatrocinio(form: HTMLFormElement): void {
  const alvo = form.querySelector<HTMLElement>("[data-campos-patrocinio]")!;
  const modelo = document.querySelector<HTMLTemplateElement>("#campos-patrocinio")!;
  alvo.replaceChildren(modelo.content.cloneNode(true));

  // Ids únicos por formulário, para os rótulos funcionarem com vários formulários na página.
  const prefixo = `f${Math.random().toString(36).slice(2, 8)}`;
  for (const rotulo of alvo.querySelectorAll<HTMLLabelElement>("label[data-for]")) {
    const campo = rotulo.nextElementSibling as HTMLElement | null;
    if (campo) {
      campo.id = `${prefixo}-${rotulo.dataset.for}`;
      rotulo.htmlFor = campo.id;
    }
  }

  const valores = JSON.parse(alvo.dataset.valores || "{}") as Valores;
  const preencher = (campo: string, valor: string | null | undefined) => {
    const elemento = alvo.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-campo="${campo}"]`);
    if (elemento && valor) elemento.value = valor;
  };
  preencher("cota", valores.cota);
  preencher("grupo", valores.grupo);
  preencher("categoria_id", valores.categoria_id);
  preencher("nome", valores.nome);
  preencher("ramo", valores.ramo);
  preencher("frase", valores.frase);
  preencher("whatsapp", valores.whatsapp ? telefoneLegivel(valores.whatsapp) : "");

  const cota = alvo.querySelector<HTMLSelectElement>('[data-campo="cota"]')!;
  const escolher = alvo.querySelector<HTMLInputElement>("[data-escolher-logo]")!;
  const pronto = alvo.querySelector<HTMLInputElement>("[data-logo-pronto]")!;
  const previa = alvo.querySelector<HTMLImageElement>("[data-previa-logo]")!;
  const tamanho = alvo.querySelector<HTMLElement>("[data-tamanho-logo]")!;
  const erro = alvo.querySelector<HTMLElement>("[data-erro-logo]")!;
  const enviar = alvo.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  if (valores.logo) {
    previa.src = valores.logo;
    previa.hidden = false;
  }

  const dimensoes = () => {
    const opcao = cota.selectedOptions[0]!;
    return { largura: Number(opcao.dataset.largura), altura: Number(opcao.dataset.altura) };
  };

  async function prepararLogo(): Promise<void> {
    const arquivo = escolher.files?.[0];
    erro.hidden = true;
    if (!arquivo) return;
    const { largura, altura } = dimensoes();
    enviar.disabled = true;
    try {
      const blob = await converterLogo(arquivo, largura, altura);
      const lista = new DataTransfer();
      lista.items.add(new File([blob], "logo.webp", { type: "image/webp" }));
      pronto.files = lista.files;
      previa.src = URL.createObjectURL(blob);
      previa.hidden = false;
    } catch (e) {
      console.error("Logo do patrocinador: conversão falhou", e);
      pronto.value = "";
      erro.textContent = e instanceof Error && e.message ? e.message : "Não foi possível ler esta imagem.";
      erro.hidden = false;
    } finally {
      enviar.disabled = false;
    }
  }

  const atualizarCota = () => {
    for (const bloco of alvo.querySelectorAll<HTMLElement>("[data-so-cota]")) bloco.hidden = bloco.dataset.soCota !== cota.value;
    const { largura, altura } = dimensoes();
    tamanho.textContent = `PNG, JPEG ou WebP. O logo é ajustado para ${largura} × ${altura} pixels, sem cortar; prefira fundo transparente.`;
    void prepararLogo();
  };

  cota.addEventListener("change", atualizarCota);
  escolher.addEventListener("change", () => void prepararLogo());
  atualizarCota();
}

/**
 * Formulários com data-confirmar pedem confirmação no modal da própria
 * interface (#modal-confirmar), nunca no confirm() do navegador.
 */
export function ligarConfirmacoes(): void {
  const modal = document.querySelector<HTMLDialogElement>("#modal-confirmar");
  if (!modal) return;
  const texto = modal.querySelector<HTMLElement>("[data-confirmar-texto]")!;
  const sim = modal.querySelector<HTMLButtonElement>("[data-confirmar-sim]")!;
  let pendente: HTMLFormElement | null = null;

  for (const form of document.querySelectorAll<HTMLFormElement>("form[data-confirmar]")) {
    form.addEventListener("submit", (evento) => {
      evento.preventDefault();
      pendente = form;
      texto.textContent = form.dataset.confirmar ?? "Confirmar?";
      modal.showModal();
    });
  }
  sim.addEventListener("click", () => {
    const form = pendente;
    pendente = null;
    modal.close();
    // submit() não dispara o evento "submit", então não volta a pedir confirmação.
    form?.submit();
  });
}
