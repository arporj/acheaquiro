// Comprovante do pagamento, no navegador (src/pages/admin/pagamentos/registrar.astro):
// a foto escolhida (inclusive a captura de tela em PNG) é convertida para WebP,
// com o lado maior de até 1.600 px. A conversão descarta os metadados, como a
// localização do celular. PDF vai como está. O servidor confere tudo de novo.

const LADO_MAXIMO = 1600;
const LIMITE = 5 * 1024 * 1024;

async function converterFoto(arquivo: File): Promise<File> {
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(imagem.width * escala);
  tela.height = Math.round(imagem.height * escala);
  tela.getContext("2d")!.drawImage(imagem, 0, 0, tela.width, tela.height);
  imagem.close();
  const blob = await new Promise<Blob | null>((r) => tela.toBlob(r, "image/webp", 0.85));
  // Navegadores sem WebP devolvem PNG no lugar: o servidor recusaria.
  if (!blob || blob.type !== "image/webp") throw new Error("Este navegador não gera WebP. Use o Chrome, o Edge ou o Firefox.");
  return new File([blob], "comprovante.webp", { type: "image/webp" });
}

/** Liga o campo [data-escolher-comprovante] ao campo enviado [data-comprovante-pronto]. */
export function ligarComprovante(form: HTMLFormElement): void {
  const escolher = form.querySelector<HTMLInputElement>("[data-escolher-comprovante]");
  const pronto = form.querySelector<HTMLInputElement>("[data-comprovante-pronto]");
  const erro = form.querySelector<HTMLElement>("[data-erro-comprovante]");
  const enviar = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!escolher || !pronto || !erro || !enviar) return;

  escolher.addEventListener("change", async () => {
    const arquivo = escolher.files?.[0];
    erro.hidden = true;
    pronto.value = "";
    if (!arquivo) return;
    enviar.disabled = true;
    try {
      const final = arquivo.type === "application/pdf" ? arquivo : await converterFoto(arquivo);
      if (final.size > LIMITE) throw new Error("O comprovante passou de 5 MB.");
      const lista = new DataTransfer();
      lista.items.add(final);
      pronto.files = lista.files;
    } catch (e) {
      console.error("Comprovante: preparo do arquivo falhou", e);
      escolher.value = "";
      erro.textContent = e instanceof Error && e.message ? e.message : "Não foi possível ler este arquivo.";
      erro.hidden = false;
    } finally {
      enviar.disabled = false;
    }
  });
}
