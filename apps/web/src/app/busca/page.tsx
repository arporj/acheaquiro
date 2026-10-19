import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IconeCategoria } from "@acheaqui/ui";
import { Topo } from "@/components/anuncios/Topo";
import { LateralResultados } from "@/components/resultados/LateralResultados";
import { ListaResultados } from "@/components/resultados/ListaResultados";
import { buscarPorTexto, listarBairros, nomeBairro } from "@/dados/consultas";

export const metadata: Metadata = {
  title: "Busca",
  robots: { index: false },
};

export default function PaginaBusca({ searchParams }: PageProps<"/busca">) {
  return (
    <>
      <Topo pagina="interna" />
      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-12">
        <Suspense fallback={<Carregando />}>
          <Resultados searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

function texto(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

async function Resultados({ searchParams }: { searchParams: PageProps<"/busca">["searchParams"] }) {
  const parametros = await searchParams;
  const termo = texto(parametros.q);
  const bairro = texto(parametros.bairro);
  const { categorias, resultados } = buscarPorTexto(termo);

  return (
    <>
      <h1 className="font-display text-2xl leading-tight font-extrabold text-azul-900 sm:text-3xl">
        {termo ? <>Resultados para “{termo}”</> : "Todos os anunciantes"}
        {bairro && <span className="text-slate-500"> no {nomeBairro(bairro)}</span>}
      </h1>
      <p className="text-sm font-semibold text-slate-500">
        {resultados.length} {resultados.length === 1 ? "anunciante encontrado" : "anunciantes encontrados"}
      </p>

      {categorias.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-500">Categorias:</span>
          {categorias.map((categoria) => (
            <Link
              key={categoria.id}
              href={`/${categoria.slugLista}`}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-bold text-azul-700 ring-1 ring-azul-100 hover:bg-azul-50"
            >
              <IconeCategoria nome={categoria.icone} className="size-4" />
              {categoria.nomePlural}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ListaResultados key={`${termo}|${bairro}`} itens={resultados} bairros={listarBairros()} bairroInicial={bairro} />
        <LateralResultados relacionadas={[]} />
      </div>
    </>
  );
}

function Carregando() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando resultados">
      <div className="h-8 w-2/3 animate-pulse rounded-xl bg-azul-100" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl bg-white" />
      ))}
    </div>
  );
}
