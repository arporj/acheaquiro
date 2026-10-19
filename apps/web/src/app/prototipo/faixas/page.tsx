import type { Metadata } from "next";
import { Cabecalho } from "@/components/Cabecalho";
import { ComparadorFaixas } from "@/components/prototipo/ComparadorFaixas";

// TEMPORÁRIO: sai junto com o painel do protótipo, depois da escolha.
export const metadata: Metadata = {
  title: "Comparar faixas de anúncio",
  robots: { index: false },
};

export default function PaginaComparacaoFaixas() {
  return (
    <>
      <Cabecalho />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-azul-900">Qual versão das faixas de anúncio?</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          As três telas abaixo mostram o mesmo conteúdo num celular. Muda só o tamanho do{" "}
          <strong>Destaque do mês</strong> e do carrossel <strong>Super Destaque</strong>. Repare em quanto cada versão
          empurra a busca e os resultados para baixo. Role dentro de cada celular e troque a página nos botões.
        </p>
        <div className="mt-6">
          <ComparadorFaixas />
        </div>
      </main>
    </>
  );
}
