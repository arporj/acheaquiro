// Linha de ajuda do campo "Meses pagos no plano anual" em /admin/catalogo
// (decisão S1, 28/10/2026): mostra o valor do anual e quantos meses saem
// grátis, no servidor e enquanto o administrador digita.
import { formatarPreco } from "./contato";

/** "Anual: R$ 499,00 (2 meses grátis)"; vazio quando não há valor por mês. */
export function resumoDoAnual(valorMensalCentavos: number, meses: number): string {
  if (!(valorMensalCentavos > 0) || !Number.isInteger(meses) || meses < 1 || meses > 12) return "";
  const gratis = 12 - meses;
  const desconto = gratis === 0 ? "sem desconto" : gratis === 1 ? "1 mês grátis" : `${gratis} meses grátis`;
  return `Anual: ${formatarPreco((valorMensalCentavos * meses) / 100)} (${desconto})`;
}

/** Liga cada campo [data-anual] ao "valor" do mesmo formulário e à linha [data-anual-resumo] seguinte. */
export function ligarResumoDoAnual(): void {
  for (const meses of document.querySelectorAll<HTMLInputElement>("input[data-anual]")) {
    const valor = meses.form?.elements.namedItem("valor");
    const resumo = meses.parentElement?.querySelector<HTMLElement>("[data-anual-resumo]");
    if (!(valor instanceof HTMLInputElement) || !resumo) continue;
    const atualizar = () => {
      // Mesmo formato aceito pelo servidor (reaisEmCentavos): "1.800,00" ou "59,90".
      const reais = Number(valor.value.replace(/\./g, "").replace(",", "."));
      resumo.textContent = resumoDoAnual(Math.round(reais * 100), Number(meses.value));
    };
    valor.addEventListener("input", atualizar);
    meses.addEventListener("input", atualizar);
  }
}
