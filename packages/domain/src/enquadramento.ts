// Enquadramento da foto antes do envio: a pessoa arrasta e aproxima a foto
// dentro de uma moldura de proporção fixa (perfil e galeria quadradas, capa de
// 4 por 1), e o recorte escolhido é o que vai para o site. O recorte fica em
// pixels da imagem original e nunca sai dela. A tela (AjusteDaFoto.astro) só
// desenha e converte o movimento do dedo; as contas ficam aqui.

/** Parte da imagem original que vai para o site, em pixels. */
export interface Recorte {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/** Quanto a pessoa pode aproximar: 4 vezes o maior recorte possível. */
export const ZOOM_MAXIMO = 4;

function conferirMedidas(largura: number, altura: number, proporcao: number): void {
  if (!(largura > 0 && altura > 0 && proporcao > 0)) {
    throw new RangeError("Medidas inválidas para o enquadramento.");
  }
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

/** Maior recorte com a proporção pedida (largura ÷ altura), no centro da imagem. */
export function recorteInicial(largura: number, altura: number, proporcao: number): Recorte {
  conferirMedidas(largura, altura, proporcao);
  const recorteLargura = Math.min(largura, altura * proporcao);
  const recorteAltura = recorteLargura / proporcao;
  return { x: (largura - recorteLargura) / 2, y: (altura - recorteAltura) / 2, largura: recorteLargura, altura: recorteAltura };
}

/** A imagem inteira, sem corte (capa com "Usar a foto inteira"). */
export function recorteInteiro(largura: number, altura: number): Recorte {
  conferirMedidas(largura, altura, 1);
  return { x: 0, y: 0, largura, altura };
}

/** Desloca o recorte em pixels da imagem, parando na borda dela. */
export function moverRecorte(atual: Recorte, dx: number, dy: number, largura: number, altura: number): Recorte {
  return {
    ...atual,
    x: limitar(atual.x + dx, 0, largura - atual.largura),
    y: limitar(atual.y + dy, 0, altura - atual.altura),
  };
}

/** Aproximação atual: 1 é o maior recorte possível; ZOOM_MAXIMO, o menor. */
export function zoomDoRecorte(atual: Recorte, largura: number, altura: number, proporcao: number): number {
  return recorteInicial(largura, altura, proporcao).largura / atual.largura;
}

/** Aproxima ou afasta mantendo o centro do recorte (limitado de 1 a ZOOM_MAXIMO), sem sair da imagem. */
export function aplicarZoom(atual: Recorte, zoom: number, largura: number, altura: number, proporcao: number): Recorte {
  const maior = recorteInicial(largura, altura, proporcao);
  const z = limitar(Number.isFinite(zoom) ? zoom : 1, 1, ZOOM_MAXIMO);
  const novaLargura = maior.largura / z;
  const novaAltura = maior.altura / z;
  const centroX = atual.x + atual.largura / 2;
  const centroY = atual.y + atual.altura / 2;
  return {
    largura: novaLargura,
    altura: novaAltura,
    x: limitar(centroX - novaLargura / 2, 0, largura - novaLargura),
    y: limitar(centroY - novaAltura / 2, 0, altura - novaAltura),
  };
}

/**
 * Converte o arrasto na tela (em pixels da moldura) em deslocamento do recorte
 * (em pixels da imagem). Arrastar a foto para a direita mostra o que está à
 * esquerda dela, por isso o sinal se inverte.
 */
export function arrastoParaImagem(atual: Recorte, larguraMoldura: number, dxTela: number, dyTela: number): { dx: number; dy: number } {
  if (!(larguraMoldura > 0)) return { dx: 0, dy: 0 };
  const escala = atual.largura / larguraMoldura;
  return { dx: -dxTela * escala, dy: -dyTela * escala };
}
