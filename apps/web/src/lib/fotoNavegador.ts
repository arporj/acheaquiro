// Preparo da foto no navegador, antes do envio: a imagem escolhida (qualquer
// formato que o celular abra) vira três versões em JPEG, com o lado maior de
// 400, 800 e 1.600 px. JPEG porque a prévia do link no WhatsApp só garante esse
// formato; a conversão descarta os metadados, como a localização. O Worker
// gratuito não aguenta converter imagem no servidor, que só confere o que chega.
// Usado pelo cartaz do evento (cartazNavegador.ts) e pelas fotos do perfil, que
// mandam também o recorte escolhido no enquadramento (AjusteDaFoto.astro).
import type { Recorte } from "@acheaqui/domain";
import { TAMANHO_MAXIMO_FOTO, TAMANHOS_FOTO, type TamanhoFoto } from "@acheaqui/validation";

const QUALIDADE = 0.85;

async function versao(imagem: ImageBitmap, recorte: Recorte, lado: number, nome: string): Promise<File> {
  const escala = Math.min(1, lado / Math.max(recorte.largura, recorte.altura));
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(recorte.largura * escala));
  tela.height = Math.max(1, Math.round(recorte.altura * escala));
  const contexto = tela.getContext("2d")!;
  // Fundo branco: o PNG transparente ficaria preto no JPEG.
  contexto.fillStyle = "#ffffff";
  contexto.fillRect(0, 0, tela.width, tela.height);
  contexto.drawImage(imagem, recorte.x, recorte.y, recorte.largura, recorte.altura, 0, 0, tela.width, tela.height);
  const blob = await new Promise<Blob | null>((r) => tela.toBlob(r, "image/jpeg", QUALIDADE));
  if (!blob || blob.type !== "image/jpeg") throw new Error("Este navegador não gerou o JPEG. Use o Chrome, o Edge ou o Firefox.");
  if (blob.size > TAMANHO_MAXIMO_FOTO) throw new Error("A imagem ficou maior que 2 MB. Escolha outra.");
  return new File([blob], `${nome}-${lado}.jpg`, { type: "image/jpeg" });
}

export interface FotoPreparada {
  versoes: Map<TamanhoFoto, File>;
  /** Medidas da parte enviada (o recorte, ou a imagem inteira), para o aviso de foto pequena. */
  largura: number;
  altura: number;
}

/** Abre a imagem escolhida. Erro com mensagem para a pessoa quando o navegador não consegue. */
export async function abrirImagem(arquivo: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(arquivo);
  } catch (erro) {
    console.error("Foto: o navegador não abriu a imagem", erro);
    throw new Error("Não foi possível abrir esta imagem. Escolha uma foto em JPG, PNG ou WebP.");
  }
}

/** As três versões em JPEG de uma imagem já aberta, do recorte (ou da imagem inteira). Não fecha a imagem. */
export async function versoesDaImagem(imagem: ImageBitmap, nome: string, recorte?: Recorte): Promise<FotoPreparada> {
  const parte = recorte ?? { x: 0, y: 0, largura: imagem.width, altura: imagem.height };
  const versoes = new Map<TamanhoFoto, File>();
  for (const tamanho of TAMANHOS_FOTO) versoes.set(tamanho, await versao(imagem, parte, tamanho, nome));
  return { versoes, largura: Math.round(parte.largura), altura: Math.round(parte.altura) };
}

/** As três versões em JPEG da imagem inteira. Erro com mensagem para a pessoa quando a imagem não abre. */
export async function prepararFoto(arquivo: File, nome: string): Promise<FotoPreparada> {
  const imagem = await abrirImagem(arquivo);
  try {
    return await versoesDaImagem(imagem, nome);
  } finally {
    imagem.close();
  }
}
