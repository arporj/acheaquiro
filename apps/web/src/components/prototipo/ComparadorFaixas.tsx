"use client";

// TEMPORÁRIO: mostra as três versões das faixas de anúncio lado a lado,
// no tamanho de um celular, para a escolha da versão final.
import { useState } from "react";
import type { ModoAnuncios } from "./ProvedorAnuncios";

const paginas = [
  { caminho: "/", rotulo: "Página inicial" },
  { caminho: "/eletricistas", rotulo: "Lista de resultados" },
  { caminho: "/perfil/carlos-eletricista", rotulo: "Perfil" },
];

const versoes: { modo: ModoAnuncios; titulo: string; descricao: string }[] = [
  {
    modo: "completas",
    titulo: "A · Completas em todas",
    descricao: "Destaque do mês e carrossel em tamanho cheio em todas as páginas, como diz a especificação.",
  },
  {
    modo: "compactas-internas",
    titulo: "B · Completas só na inicial",
    descricao: "Tamanho cheio na página inicial; uma linha fina nos resultados e nos perfis.",
  },
  {
    modo: "compactas-todas",
    titulo: "C · Compactas em todas",
    descricao: "Uma linha fina em todas as páginas, inclusive na inicial.",
  },
];

export function ComparadorFaixas() {
  const [pagina, setPagina] = useState(paginas[1].caminho);

  return (
    <div>
      <div role="tablist" aria-label="Página exibida" className="flex flex-wrap gap-2">
        {paginas.map((p) => (
          <button
            key={p.caminho}
            role="tab"
            type="button"
            aria-selected={pagina === p.caminho}
            onClick={() => setPagina(p.caminho)}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${
              pagina === p.caminho ? "bg-azul-600 text-white ring-azul-600" : "bg-white text-tinta ring-azul-100 hover:bg-azul-50"
            }`}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      <div className="mt-6 flex gap-6 overflow-x-auto pb-4">
        {versoes.map((versao) => (
          <section key={versao.modo} className="w-[406px] shrink-0">
            <h2 className="font-display text-xl font-extrabold text-azul-900">{versao.titulo}</h2>
            <p className="mb-3 min-h-10 text-sm text-slate-600">{versao.descricao}</p>
            <div className="overflow-hidden rounded-[2rem] border-8 border-tinta bg-white shadow-xl">
              <iframe
                key={`${versao.modo}${pagina}`}
                src={`${pagina}?anuncios=${versao.modo}`}
                title={`${versao.titulo}: ${pagina}`}
                className="block h-[760px] w-[390px]"
              />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
