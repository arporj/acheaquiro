// Versões que o envio grava no bucket público: <chave>-400, -800 e -1600, com o
// lado maior nessas medidas (apps/web/src/lib/fotoNavegador.ts). O endereço
// guardado no banco é o da versão de 800 px.
const VERSAO_800 = /^(.*)-800\.(jpg|webp)$/;
const LARGURAS = [400, 800, 1600] as const;

/** Atributo srcset com as três versões, ou undefined quando a foto não segue o padrão do bucket. */
export function srcsetDaFoto(url: string): string | undefined {
  const partes = url.match(VERSAO_800);
  if (!partes) return undefined;
  const [, chave, extensao] = partes;
  return LARGURAS.map((largura) => `${chave}-${largura}.${extensao} ${largura}w`).join(", ");
}

/** Endereço da versão maior (1.600 px), para ver a foto ampliada; o próprio endereço quando não segue o padrão. */
export function versaoAmpliada(url: string): string {
  return url.replace(VERSAO_800, "$1-1600.$2");
}
