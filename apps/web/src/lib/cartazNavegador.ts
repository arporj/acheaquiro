// Cartaz do evento, no navegador: as três versões em JPEG saem de prepararFoto
// (fotoNavegador.ts), a mesma conversão das fotos do perfil.
import { TAMANHOS_FOTO } from "@acheaqui/validation";
import { prepararFoto } from "./fotoNavegador";

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
      const { versoes } = await prepararFoto(arquivo, "cartaz");
      for (const [tamanho, campo] of campos) {
        const lista = new DataTransfer();
        lista.items.add(versoes.get(tamanho)!);
        campo!.files = lista.files;
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
