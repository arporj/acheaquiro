// Cartaz do evento, no navegador: a imagem escolhida (qualquer formato que o
// celular abra) vira três versões em JPEG, com o lado maior de 400, 800 e
// 1.600 px. JPEG porque a prévia do link no WhatsApp só garante esse formato;
// a conversão descarta os metadados, como a localização. O Worker gratuito não
// aguenta converter imagem no servidor, que só confere o que chega.
import { TAMANHOS_FOTO } from "@acheaqui/validation";

const QUALIDADE = 0.85;
/** Limite do servidor por versão (TAMANHO_MAXIMO_FOTO). */
const LIMITE = 2 * 1024 * 1024;

async function versao(imagem: ImageBitmap, lado: number): Promise<File> {
  const escala = Math.min(1, lado / Math.max(imagem.width, imagem.height));
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(imagem.width * escala));
  tela.height = Math.max(1, Math.round(imagem.height * escala));
  const contexto = tela.getContext("2d")!;
  // Fundo branco: o PNG transparente ficaria preto no JPEG.
  contexto.fillStyle = "#ffffff";
  contexto.fillRect(0, 0, tela.width, tela.height);
  contexto.drawImage(imagem, 0, 0, tela.width, tela.height);
  const blob = await new Promise<Blob | null>((r) => tela.toBlob(r, "image/jpeg", QUALIDADE));
  if (!blob || blob.type !== "image/jpeg") throw new Error("Este navegador não gerou o JPEG. Use o Chrome, o Edge ou o Firefox.");
  if (blob.size > LIMITE) throw new Error("A imagem ficou maior que 2 MB. Escolha outra.");
  return new File([blob], `cartaz-${lado}.jpg`, { type: "image/jpeg" });
}

/**
 * Liga o campo [data-escolher-cartaz] aos campos enviados [data-cartaz-versao="400|800|1600"].
 * Enquanto converte, o botão de envio fica desabilitado.
 */
export function ligarCartaz(form: HTMLFormElement): void {
  const escolher = form.querySelector<HTMLInputElement>("[data-escolher-cartaz]");
  const erro = form.querySelector<HTMLElement>("[data-erro-cartaz]");
  const enviar = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const campos = new Map(TAMANHOS_FOTO.map((t) => [t, form.querySelector<HTMLInputElement>(`[data-cartaz-versao="${t}"]`)]));
  if (!escolher || !erro || !enviar || [...campos.values()].some((c) => !c)) return;

  escolher.addEventListener("change", async () => {
    const arquivo = escolher.files?.[0];
    erro.hidden = true;
    for (const campo of campos.values()) campo!.value = "";
    if (!arquivo) return;
    enviar.disabled = true;
    try {
      const imagem = await createImageBitmap(arquivo);
      try {
        for (const [tamanho, campo] of campos) {
          const lista = new DataTransfer();
          lista.items.add(await versao(imagem, tamanho));
          campo!.files = lista.files;
        }
      } finally {
        imagem.close();
      }
    } catch (e) {
      console.error("Cartaz: preparo da imagem falhou", e);
      escolher.value = "";
      erro.textContent = e instanceof Error && e.message ? e.message : "Não foi possível ler esta imagem.";
      erro.hidden = false;
    } finally {
      enviar.disabled = false;
    }
  });
}
