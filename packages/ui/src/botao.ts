// Classes de botão compartilhadas por <button> e <a>.
export type VarianteBotao = "amarelo" | "azul" | "zap" | "contorno" | "contornoZap" | "contornoClaro" | "fantasma" | "perigo";
export type TamanhoBotao = "p" | "m" | "g";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors duration-150 " +
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-azul-500 " +
  "disabled:opacity-50 disabled:pointer-events-none select-none";

const variantes: Record<VarianteBotao, string> = {
  amarelo: "bg-amarelo-400 text-azul-900 hover:bg-amarelo-300 shadow-[0_3px_0_0_#C99A00]",
  azul: "bg-azul-600 text-white hover:bg-azul-700",
  zap: "bg-zap-600 text-white hover:bg-zap-700",
  contorno: "border-2 border-azul-100 bg-white text-azul-700 hover:border-azul-500 hover:bg-azul-50",
  contornoZap: "border-2 border-zap-600 bg-white text-zap-700 hover:bg-zap-50",
  // Para fundos escuros (faixas azuis e o bloco final das páginas institucionais).
  contornoClaro: "border-2 border-white/40 text-white hover:border-white hover:bg-white/10",
  fantasma: "text-azul-700 hover:bg-azul-50",
  perigo: "bg-vermelho-600 text-white hover:bg-vermelho-700",
};

const tamanhos: Record<TamanhoBotao, string> = {
  p: "h-9 px-4 text-sm",
  m: "h-11 px-5 text-[0.95rem]",
  g: "h-13 px-6 text-base",
};

export function classesBotao(variante: VarianteBotao = "azul", tamanho: TamanhoBotao = "m", extra = ""): string {
  return `${base} ${variantes[variante]} ${tamanhos[tamanho]} ${extra}`.trim();
}
