import { describe, expect, it } from "vitest";
import {
  ZOOM_MAXIMO,
  aplicarZoom,
  arrastoParaImagem,
  moverRecorte,
  recorteInicial,
  recorteInteiro,
  zoomDoRecorte,
} from "./enquadramento";

describe("recorteInicial", () => {
  it("foto deitada numa moldura quadrada: altura inteira, no centro", () => {
    expect(recorteInicial(1600, 900, 1)).toEqual({ x: 350, y: 0, largura: 900, altura: 900 });
  });

  it("foto em pé numa moldura quadrada: largura inteira, no centro", () => {
    expect(recorteInicial(900, 1600, 1)).toEqual({ x: 0, y: 350, largura: 900, altura: 900 });
  });

  it("arte de 3 por 1 na capa de 4 por 1: largura inteira e corta em cima e embaixo", () => {
    expect(recorteInicial(1600, 533, 4)).toEqual({ x: 0, y: 66.5, largura: 1600, altura: 400 });
  });

  it("foto já na proporção: a imagem inteira", () => {
    expect(recorteInicial(1600, 400, 4)).toEqual({ x: 0, y: 0, largura: 1600, altura: 400 });
  });

  it("recusa medidas inválidas", () => {
    expect(() => recorteInicial(0, 100, 1)).toThrow(RangeError);
    expect(() => recorteInicial(100, 100, 0)).toThrow(RangeError);
    expect(() => recorteInicial(Number.NaN, 100, 1)).toThrow(RangeError);
  });
});

describe("recorteInteiro", () => {
  it("a imagem toda", () => {
    expect(recorteInteiro(1600, 533)).toEqual({ x: 0, y: 0, largura: 1600, altura: 533 });
  });

  it("recusa medidas inválidas", () => {
    expect(() => recorteInteiro(-1, 10)).toThrow(RangeError);
  });
});

describe("moverRecorte", () => {
  const inicial = recorteInicial(1600, 900, 1);

  it("desloca dentro da imagem", () => {
    expect(moverRecorte(inicial, -100, 0, 1600, 900)).toMatchObject({ x: 250, y: 0 });
  });

  it("para na borda esquerda e na direita", () => {
    expect(moverRecorte(inicial, -1000, 0, 1600, 900).x).toBe(0);
    expect(moverRecorte(inicial, 1000, 0, 1600, 900).x).toBe(700);
  });

  it("não sobe nem desce quando o recorte já ocupa a altura toda", () => {
    expect(moverRecorte(inicial, 0, 50, 1600, 900).y).toBe(0);
    expect(moverRecorte(inicial, 0, -50, 1600, 900).y).toBe(0);
  });
});

describe("aplicarZoom e zoomDoRecorte", () => {
  const inicial = recorteInicial(1600, 900, 1);

  it("aproximar 2 vezes deixa o recorte com metade do lado, no mesmo centro", () => {
    const perto = aplicarZoom(inicial, 2, 1600, 900, 1);
    expect(perto).toEqual({ x: 575, y: 225, largura: 450, altura: 450 });
    expect(zoomDoRecorte(perto, 1600, 900, 1)).toBe(2);
  });

  it("fica entre 1 e o máximo", () => {
    expect(aplicarZoom(inicial, 0.5, 1600, 900, 1)).toEqual(inicial);
    expect(zoomDoRecorte(aplicarZoom(inicial, 10, 1600, 900, 1), 1600, 900, 1)).toBe(ZOOM_MAXIMO);
  });

  it("zoom inválido volta para 1", () => {
    expect(aplicarZoom(inicial, Number.NaN, 1600, 900, 1)).toEqual(inicial);
  });

  it("afastar perto da borda puxa o recorte para dentro da imagem", () => {
    const perto = moverRecorte(aplicarZoom(inicial, 4, 1600, 900, 1), -2000, -2000, 1600, 900);
    expect(perto).toMatchObject({ x: 0, y: 0 });
    const longe = aplicarZoom(perto, 1, 1600, 900, 1);
    expect(longe).toEqual({ x: 0, y: 0, largura: 900, altura: 900 });
  });
});

describe("arrastoParaImagem", () => {
  it("converte o arrasto da tela para a imagem, com o sinal invertido", () => {
    const recorte = { x: 0, y: 0, largura: 900, altura: 900 };
    expect(arrastoParaImagem(recorte, 300, 30, -15)).toEqual({ dx: -90, dy: 45 });
  });

  it("moldura sem largura não move", () => {
    expect(arrastoParaImagem({ x: 0, y: 0, largura: 900, altura: 900 }, 0, 30, 30)).toEqual({ dx: 0, dy: 0 });
  });
});
