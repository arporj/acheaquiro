// Conferência dos arquivos enviados (Especificação Técnica, seção 10.4): tipo
// real pelos primeiros bytes, dimensões e remoção dos metadados (localização
// do celular, câmera, data) sem abrir a imagem, o que gastaria processamento.
// O navegador já converte a foto antes do envio, e a conversão descarta os
// metadados; a remoção aqui vale para quem enviar o arquivo de outro jeito.

export type TipoArquivo = "webp" | "jpeg" | "png" | "pdf";
export type FormatoFoto = "webp" | "jpeg";

/**
 * A foto de perfil é sempre gravada em JPEG, porque é ela que vai para a
 * prévia do link no WhatsApp, que só garante JPEG (decisão de 28/10/2026). O
 * anunciante escolhe a foto em qualquer formato que o navegador abra (JPG,
 * PNG, WebP, HEIC no iPhone); a tela de envio converte para JPEG.
 */
export const FORMATO_FOTO_PERFIL: FormatoFoto = "jpeg";

/**
 * Cada foto é gravada em três versões, com o lado maior de até 400, 800 e
 * 1.600 px; a página indica as três ao navegador, que escolhe a da tela.
 * Nada é redimensionado na hora de mostrar (sem limite de transformações).
 */
export const TAMANHOS_FOTO = [400, 800, 1600] as const;
export type TamanhoFoto = (typeof TAMANHOS_FOTO)[number];
export const TAMANHO_MAXIMO_FOTO = 2 * 1024 * 1024;
export const TAMANHO_MAXIMO_PDF = 5 * 1024 * 1024;

export class ArquivoInvalido extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "ArquivoInvalido";
  }
}

const texto = (bytes: Uint8Array, inicio: number, tamanho: number) =>
  String.fromCharCode(...bytes.subarray(inicio, inicio + tamanho));
const le32 = (b: Uint8Array, i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;
const le24 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;

/** Tipo real do arquivo pelos primeiros bytes; vazio quando não é um dos aceitos. */
export function identificarArquivo(bytes: Uint8Array): TipoArquivo | null {
  if (bytes.length >= 12 && texto(bytes, 0, 4) === "RIFF" && texto(bytes, 8, 4) === "WEBP") return "webp";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && texto(bytes, 1, 3) === "PNG") return "png";
  if (bytes.length >= 5 && texto(bytes, 0, 5) === "%PDF-") return "pdf";
  return null;
}

interface PedacoWebp {
  tipo: string;
  inicio: number;
  /** Tamanho dos dados, sem o cabeçalho de 8 bytes e sem o byte de preenchimento. */
  tamanho: number;
  fim: number;
}

function pedacosWebp(bytes: Uint8Array): PedacoWebp[] {
  if (identificarArquivo(bytes) !== "webp") throw new ArquivoInvalido("O arquivo não é WebP.");
  if (le32(bytes, 4) + 8 !== bytes.length) throw new ArquivoInvalido("WebP com tamanho inconsistente.");
  const pedacos: PedacoWebp[] = [];
  let posicao = 12;
  while (posicao < bytes.length) {
    if (posicao + 8 > bytes.length) throw new ArquivoInvalido("WebP cortado.");
    const tamanho = le32(bytes, posicao + 4);
    const fim = posicao + 8 + tamanho + (tamanho % 2);
    if (fim > bytes.length) throw new ArquivoInvalido("WebP cortado.");
    pedacos.push({ tipo: texto(bytes, posicao, 4), inicio: posicao, tamanho, fim });
    posicao = fim;
  }
  return pedacos;
}

interface SegmentoJpeg {
  marcador: number;
  inicio: number;
  fim: number;
}

/** Segmentos antes da imagem em si (até o marcador SOS, 0xDA). */
function segmentosJpeg(bytes: Uint8Array): { segmentos: SegmentoJpeg[]; inicioImagem: number } {
  if (identificarArquivo(bytes) !== "jpeg") throw new ArquivoInvalido("O arquivo não é JPEG.");
  const segmentos: SegmentoJpeg[] = [];
  let posicao = 2;
  while (posicao + 4 <= bytes.length) {
    if (bytes[posicao] !== 0xff) throw new ArquivoInvalido("JPEG com estrutura inválida.");
    const marcador = bytes[posicao + 1]!;
    if (marcador === 0xda) return { segmentos, inicioImagem: posicao };
    const fim = posicao + 2 + be16(bytes, posicao + 2);
    if (fim > bytes.length) throw new ArquivoInvalido("JPEG cortado.");
    segmentos.push({ marcador, inicio: posicao, fim });
    posicao = fim;
  }
  throw new ArquivoInvalido("JPEG sem imagem.");
}

const MARCADORES_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Largura e altura em pixels, lidas do cabeçalho. */
export function lerDimensoes(bytes: Uint8Array, formato: FormatoFoto): { largura: number; altura: number } {
  if (formato === "jpeg") {
    const sof = segmentosJpeg(bytes).segmentos.find((s) => MARCADORES_SOF.has(s.marcador));
    if (!sof || sof.fim - sof.inicio < 9) throw new ArquivoInvalido("JPEG sem dimensões.");
    return { altura: be16(bytes, sof.inicio + 5), largura: be16(bytes, sof.inicio + 7) };
  }
  for (const pedaco of pedacosWebp(bytes)) {
    const d = pedaco.inicio + 8;
    if (pedaco.tipo === "VP8X" && pedaco.tamanho >= 10) return { largura: le24(bytes, d + 4) + 1, altura: le24(bytes, d + 7) + 1 };
    if (pedaco.tipo === "VP8 " && pedaco.tamanho >= 10 && bytes[d + 3] === 0x9d && bytes[d + 4] === 0x01 && bytes[d + 5] === 0x2a) {
      return { largura: (bytes[d + 6]! | (bytes[d + 7]! << 8)) & 0x3fff, altura: (bytes[d + 8]! | (bytes[d + 9]! << 8)) & 0x3fff };
    }
    if (pedaco.tipo === "VP8L" && pedaco.tamanho >= 5 && bytes[d] === 0x2f) {
      const bits = le32(bytes, d + 1);
      return { largura: (bits & 0x3fff) + 1, altura: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  throw new ArquivoInvalido("WebP sem dimensões.");
}

/** Pedaços do WebP com metadados: EXIF (inclui a localização) e XMP. */
const PEDACOS_METADADOS_WEBP = new Set(["EXIF", "XMP "]);
/** No VP8X, os bits que avisam que há EXIF (0x08) e XMP (0x04). */
const BITS_METADADOS_VP8X = 0x08 | 0x04;
/** Segmentos do JPEG com metadados: APP1 (EXIF e XMP) e APP13 (IPTC). */
const SEGMENTOS_METADADOS_JPEG = new Set([0xe1, 0xed]);

/** Devolve o arquivo sem os metadados. Recusa arquivo com estrutura inválida. */
export function limparMetadados(bytes: Uint8Array, formato: FormatoFoto): Uint8Array {
  const partes: Uint8Array[] = [];
  if (formato === "jpeg") {
    const { segmentos, inicioImagem } = segmentosJpeg(bytes);
    partes.push(bytes.subarray(0, 2));
    for (const s of segmentos) if (!SEGMENTOS_METADADOS_JPEG.has(s.marcador)) partes.push(bytes.subarray(s.inicio, s.fim));
    partes.push(bytes.subarray(inicioImagem));
  } else {
    partes.push(bytes.slice(0, 12));
    for (const p of pedacosWebp(bytes)) {
      if (PEDACOS_METADADOS_WEBP.has(p.tipo)) continue;
      const pedaco = bytes.slice(p.inicio, p.fim);
      if (p.tipo === "VP8X") pedaco[8] = pedaco[8]! & ~BITS_METADADOS_VP8X;
      partes.push(pedaco);
    }
  }
  const total = partes.reduce((soma, parte) => soma + parte.length, 0);
  const resultado = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    resultado.set(parte, posicao);
    posicao += parte.length;
  }
  if (formato === "webp") {
    const tamanhoRiff = total - 8;
    resultado[4] = tamanhoRiff & 0xff;
    resultado[5] = (tamanhoRiff >>> 8) & 0xff;
    resultado[6] = (tamanhoRiff >>> 16) & 0xff;
    resultado[7] = (tamanhoRiff >>> 24) & 0xff;
  }
  return resultado;
}

/**
 * Confere uma das três versões da foto: tipo real, tamanho do arquivo e lado
 * maior (nunca acima do da versão; menor quando a foto original já era
 * pequena). Devolve o arquivo limpo e as dimensões.
 */
export function conferirVersaoFoto(
  bytes: Uint8Array,
  tamanho: TamanhoFoto,
): { formato: FormatoFoto; largura: number; altura: number; arquivo: Uint8Array } {
  if (bytes.length === 0) throw new ArquivoInvalido("Arquivo vazio.");
  if (bytes.length > TAMANHO_MAXIMO_FOTO) throw new ArquivoInvalido("Foto maior que 2 MB.");
  const tipo = identificarArquivo(bytes);
  if (tipo !== "webp" && tipo !== "jpeg") throw new ArquivoInvalido("A foto precisa ser WebP ou JPEG.");
  const { largura, altura } = lerDimensoes(bytes, tipo);
  if (largura < 1 || altura < 1 || Math.max(largura, altura) > tamanho) {
    throw new ArquivoInvalido(`Foto maior que o esperado para a versão de ${tamanho} px.`);
  }
  return { formato: tipo, largura, altura, arquivo: limparMetadados(bytes, tipo) };
}
