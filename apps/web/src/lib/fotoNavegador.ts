// Preparo da foto no navegador, antes do envio: a imagem escolhida (qualquer
// formato que o celular abra) vira três versões em JPEG, com o lado maior de
// 400, 800 e 1.600 px. JPEG porque a prévia do link no WhatsApp só garante esse
// formato; a conversão descarta os metadados, como a localização. O Worker
// gratuito não aguenta converter imagem no servidor, que só confere o que chega.
// Usado pelo cartaz do evento (cartazNavegador.ts) e pelas fotos do perfil.
import { TAMANHO_MAXIMO_FOTO, TAMANHOS_FOTO, type TamanhoFoto } from "@acheaqui/validation";

const QUALIDADE = 0.85;

async function versao(imagem: ImageBitmap, lado: number, nome: string): Promise<File> {
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
  if (blob.size > TAMANHO_MAXIMO_FOTO) throw new Error("A imagem ficou maior que 2 MB. Escolha outra.");
  return new File([blob], `${nome}-${lado}.jpg`, { type: "image/jpeg" });
}

export interface FotoPreparada {
  versoes: Map<TamanhoFoto, File>;
  /** Medidas da imagem original, para o aviso de foto pequena. */
  largura: number;
  altura: number;
}

/** As três versões em JPEG. Erro com mensagem para a pessoa quando a imagem não abre. */
export async function prepararFoto(arquivo: File, nome: string): Promise<FotoPreparada> {
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(arquivo);
  } catch (erro) {
    console.error("Foto: o navegador não abriu a imagem", erro);
    throw new Error("Não foi possível abrir esta imagem. Escolha uma foto em JPG, PNG ou WebP.");
  }
  try {
    const versoes = new Map<TamanhoFoto, File>();
    for (const tamanho of TAMANHOS_FOTO) versoes.set(tamanho, await versao(imagem, tamanho, nome));
    return { versoes, largura: imagem.width, altura: imagem.height };
  } finally {
    imagem.close();
  }
}
