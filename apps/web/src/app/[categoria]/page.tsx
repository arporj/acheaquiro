import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@acheaqui/ui";
import { Topo } from "@/components/anuncios/Topo";
import { BotaoCompartilhar } from "@/components/BotaoCompartilhar";
import { LateralResultados } from "@/components/resultados/LateralResultados";
import { ListaResultados } from "@/components/resultados/ListaResultados";
import { buscarPorCategoria, categoriaPorSlugLista, cidadeAtual, listarBairros, listarCategorias } from "@/dados/consultas";

// Links curtos da busca (item 4.5): /eletricistas, /farmacias...
export function generateStaticParams() {
  return listarCategorias().map((c) => ({ categoria: c.slugLista }));
}

export async function generateMetadata({ params }: PageProps<"/[categoria]">): Promise<Metadata> {
  const { categoria: slug } = await params;
  const categoria = categoriaPorSlugLista(slug);
  if (!categoria) return {};
  return {
    title: `${categoria.nomePlural} em ${cidadeAtual.nome}`,
    description: `Encontre ${categoria.nomePlural.toLowerCase()} em ${cidadeAtual.nome} e fale direto pelo WhatsApp.`,
  };
}

export default async function PaginaCategoria({ params }: PageProps<"/[categoria]">) {
  const { categoria: slug } = await params;
  const categoria = categoriaPorSlugLista(slug);
  if (!categoria) notFound();

  const itens = buscarPorCategoria(categoria.id);
  const relacionadas = listarCategorias().filter((c) => c.grupo === categoria.grupo && c.id !== categoria.id);

  return (
    <>
      <Topo pagina="interna" />
      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-12">
        <nav aria-label="Você está em" className="flex items-center gap-1 text-sm font-semibold text-slate-500">
          <Link href="/" className="hover:text-azul-600">
            Início
          </Link>
          <Icone nome="direita" className="size-3.5" />
          <span className="text-tinta">{categoria.nomePlural}</span>
        </nav>

        <div className="mt-2 mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="grid size-14 shrink-0 place-items-center rounded-2xl text-3xl shadow-md"
              style={{ backgroundColor: categoria.cor }}
              aria-hidden="true"
            >
              {categoria.icone}
            </span>
            <div>
              <h1 className="font-display text-2xl leading-tight font-extrabold text-azul-900 sm:text-3xl">
                {categoria.nomePlural} em {cidadeAtual.nome}
              </h1>
              <p className="text-sm font-semibold text-slate-500">
                {itens.length} {itens.length === 1 ? "anunciante" : "anunciantes"}
              </p>
            </div>
          </div>
          <div className="hidden sm:block">
            <BotaoCompartilhar caminho={`/${categoria.slugLista}`} titulo={`${categoria.nomePlural} em ${cidadeAtual.nome}`} variante="botao" />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <ListaResultados itens={itens} bairros={listarBairros()} />
          <LateralResultados relacionadas={relacionadas} />
        </div>
      </main>
    </>
  );
}
