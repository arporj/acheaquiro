import { describe, expect, it } from "vitest";
import {
  ArquivoInvalido,
  conferirVersaoFoto,
  identificarArquivo,
  lerDimensoes,
  limparMetadados,
  TAMANHO_MAXIMO_FOTO,
} from "./arquivos";

// Arquivos montados byte a byte: só a estrutura, sem imagem de verdade.
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const le32 = (n: number) => Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
const le24 = (n: number) => Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff);
const be16 = (n: number) => Uint8Array.of((n >>> 8) & 0xff, n & 0xff);
const juntar = (...partes: Uint8Array[]) => {
  const total = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of partes) {
    total.set(p, i);
    i += p.length;
  }
  return total;
};
const contem = (bytes: Uint8Array, s: string) => new TextDecoder("latin1").decode(bytes).includes(s);

const pedaco = (tipo: string, dados: Uint8Array) =>
  juntar(ascii(tipo), le32(dados.length), dados, dados.length % 2 ? Uint8Array.of(0) : new Uint8Array());
const webp = (...pedacos: Uint8Array[]) => {
  const corpo = juntar(ascii("WEBP"), ...pedacos);
  return juntar(ascii("RIFF"), le32(corpo.length), corpo);
};
const vp8 = (largura: number, altura: number) =>
  pedaco("VP8 ", juntar(Uint8Array.of(0, 0, 0, 0x9d, 0x01, 0x2a), Uint8Array.of(largura & 0xff, largura >> 8, altura & 0xff, altura >> 8)));
const vp8x = (flags: number, largura: number, altura: number) =>
  pedaco("VP8X", juntar(Uint8Array.of(flags, 0, 0, 0), le24(largura - 1), le24(altura - 1)));
const exif = pedaco("EXIF", ascii("Exif\0\0GPS -22.52,-41.94 iPhone"));
const xmp = pedaco("XMP ", ascii("<x:xmpmeta>GPS</x:xmpmeta>"));

const segmento = (marcador: number, dados: Uint8Array) => juntar(Uint8Array.of(0xff, marcador), be16(dados.length + 2), dados);
const jpeg = (largura: number, altura: number, ...extras: Uint8Array[]) =>
  juntar(
    Uint8Array.of(0xff, 0xd8),
    segmento(0xe0, ascii("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    ...extras,
    segmento(0xc0, juntar(Uint8Array.of(8), be16(altura), be16(largura), Uint8Array.of(3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1))),
    segmento(0xda, Uint8Array.of(3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0)),
    Uint8Array.of(0x12, 0x34, 0x56, 0xff, 0xd9),
  );
const app1Exif = segmento(0xe1, ascii("Exif\0\0GPS -22.52,-41.94 iPhone"));
const app13Iptc = segmento(0xed, ascii("Photoshop 3.0\0GPS"));

describe("identificarArquivo", () => {
  it("reconhece WebP, JPEG, PNG e PDF pelos primeiros bytes", () => {
    expect(identificarArquivo(webp(vp8(10, 10)))).toBe("webp");
    expect(identificarArquivo(jpeg(10, 10))).toBe("jpeg");
    expect(identificarArquivo(juntar(Uint8Array.of(0x89), ascii("PNG\r\n\x1a\n")))).toBe("png");
    expect(identificarArquivo(ascii("%PDF-1.7\n"))).toBe("pdf");
  });

  it("não se engana com o nome: um GIF ou um HTML não passam", () => {
    expect(identificarArquivo(ascii("GIF89a"))).toBeNull();
    expect(identificarArquivo(ascii("<html><script>"))).toBeNull();
    expect(identificarArquivo(new Uint8Array())).toBeNull();
  });
});

describe("lerDimensoes", () => {
  it("lê WebP com cabeçalho VP8X, VP8 (com perda) e VP8L (sem perda)", () => {
    expect(lerDimensoes(webp(vp8x(0, 1600, 1200), vp8(1600, 1200)), "webp")).toEqual({ largura: 1600, altura: 1200 });
    expect(lerDimensoes(webp(vp8(800, 600)), "webp")).toEqual({ largura: 800, altura: 600 });
    // VP8L: largura-1 nos 14 primeiros bits e altura-1 nos 14 seguintes.
    const bits = (400 - 1) | ((300 - 1) << 14);
    expect(lerDimensoes(webp(pedaco("VP8L", juntar(Uint8Array.of(0x2f), le32(bits)))), "webp")).toEqual({ largura: 400, altura: 300 });
  });

  it("lê JPEG pelo marcador de início da imagem", () => {
    expect(lerDimensoes(jpeg(1200, 1600, app1Exif), "jpeg")).toEqual({ largura: 1200, altura: 1600 });
  });

  it("recusa arquivo sem dimensões", () => {
    expect(() => lerDimensoes(webp(pedaco("ICCP", ascii("cor"))), "webp")).toThrow(ArquivoInvalido);
  });
});

describe("limparMetadados", () => {
  it("tira do WebP os pedaços EXIF e XMP, desliga os avisos no VP8X e acerta o tamanho", () => {
    const original = webp(vp8x(0x08 | 0x04 | 0x10, 800, 600), exif, xmp, vp8(800, 600));
    const limpo = limparMetadados(original, "webp");
    expect(contem(original, "GPS")).toBe(true);
    expect(contem(limpo, "GPS")).toBe(false);
    expect(contem(limpo, "EXIF")).toBe(false);
    expect(limpo[20]! & 0x0c).toBe(0); // bits de EXIF e XMP desligados
    expect(limpo[20]! & 0x10).toBe(0x10); // o aviso de transparência continua
    expect(new DataView(limpo.buffer).getUint32(4, true)).toBe(limpo.length - 8);
    expect(lerDimensoes(limpo, "webp")).toEqual({ largura: 800, altura: 600 });
  });

  it("tira do JPEG os segmentos APP1 (EXIF e XMP) e APP13 (IPTC) e mantém a imagem", () => {
    const original = jpeg(800, 600, app1Exif, app13Iptc);
    const limpo = limparMetadados(original, "jpeg");
    expect(contem(limpo, "GPS")).toBe(false);
    expect(contem(limpo, "JFIF")).toBe(true);
    expect(lerDimensoes(limpo, "jpeg")).toEqual({ largura: 800, altura: 600 });
    expect([...limpo.slice(-5)]).toEqual([0x12, 0x34, 0x56, 0xff, 0xd9]);
  });

  it("não muda arquivo que já vem sem metadados", () => {
    const semMetadados = webp(vp8(400, 300));
    expect([...limparMetadados(semMetadados, "webp")]).toEqual([...semMetadados]);
  });

  it("recusa WebP cortado ou com tamanho inconsistente", () => {
    const inteiro = webp(vp8(400, 300));
    expect(() => limparMetadados(inteiro.slice(0, inteiro.length - 4), "webp")).toThrow(ArquivoInvalido);
    const mentiroso = inteiro.slice();
    mentiroso[4] = mentiroso[4]! + 50;
    expect(() => limparMetadados(mentiroso, "webp")).toThrow(ArquivoInvalido);
  });

  it("recusa JPEG sem imagem, cortado ou com estrutura quebrada", () => {
    expect(() => limparMetadados(juntar(Uint8Array.of(0xff, 0xd8), segmento(0xe0, ascii("JFIF"))), "jpeg")).toThrow(ArquivoInvalido);
    expect(() => limparMetadados(juntar(Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0x10, 0x00)), "jpeg")).toThrow(ArquivoInvalido);
    expect(() => limparMetadados(juntar(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0x00, 0x00)), "jpeg")).toThrow(ArquivoInvalido);
  });

  it("recusa conteúdo de outro tipo", () => {
    expect(() => limparMetadados(jpeg(10, 10), "webp")).toThrow(ArquivoInvalido);
    expect(() => limparMetadados(webp(vp8(10, 10)), "jpeg")).toThrow(ArquivoInvalido);
  });
});

describe("conferirVersaoFoto", () => {
  it("aceita WebP e JPEG dentro do tamanho e devolve o arquivo limpo", () => {
    const r = conferirVersaoFoto(webp(vp8x(0x08, 1600, 1200), exif, vp8(1600, 1200)), 1600);
    expect(r).toMatchObject({ formato: "webp", largura: 1600, altura: 1200 });
    expect(contem(r.arquivo, "GPS")).toBe(false);
    expect(conferirVersaoFoto(jpeg(300, 400, app1Exif), 400)).toMatchObject({ formato: "jpeg", largura: 300, altura: 400 });
  });

  it("aceita foto em pé, medida pelo lado maior", () => {
    expect(conferirVersaoFoto(webp(vp8(600, 800)), 800)).toMatchObject({ largura: 600, altura: 800 });
  });

  it("recusa foto maior que a versão, vazia, acima de 2 MB ou em outro formato", () => {
    expect(() => conferirVersaoFoto(webp(vp8(801, 600)), 800)).toThrow("Foto maior que o esperado para a versão de 800 px.");
    expect(() => conferirVersaoFoto(webp(vp8(600, 801)), 800)).toThrow(ArquivoInvalido);
    expect(() => conferirVersaoFoto(new Uint8Array(), 400)).toThrow("Arquivo vazio.");
    expect(() => conferirVersaoFoto(new Uint8Array(TAMANHO_MAXIMO_FOTO + 1), 1600)).toThrow("Foto maior que 2 MB.");
    expect(() => conferirVersaoFoto(juntar(Uint8Array.of(0x89), ascii("PNG\r\n\x1a\n")), 400)).toThrow("A foto precisa ser WebP ou JPEG.");
  });
});
