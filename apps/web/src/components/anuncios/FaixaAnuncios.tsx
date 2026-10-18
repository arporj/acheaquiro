"use client";

import Link from "next/link";
import { FotoMarcador, Icone, Selo } from "@acheaqui/ui";
import type { ItemResultado } from "@/dados/consultas";
import { useModoAnuncios } from "@/components/prototipo/ProvedorAnuncios";

type Destaque = { item: ItemResultado; descricao: string; bairro: string };

export function FaixaAnuncios({
  pagina,
  destaque,
  superDestaques,
}: {
  pagina: "inicial" | "interna";
  destaque?: Destaque;
  superDestaques: ItemResultado[];
}) {
  const { modo } = useModoAnuncios();
  const compacta = modo === "compactas-todas" || (modo === "compactas-internas" && pagina === "interna");

  return (
    <section aria-label="Anunciantes em destaque" className={compacta ? "bg-white pb-2 shadow-sm" : "pb-2"}>
      {destaque &&
        (compacta ? <DestaqueExclusivoCompacto destaque={destaque} /> : <DestaqueExclusivo destaque={destaque} />)}
      {superDestaques.length > 0 &&
        (compacta ? <CarrosselCompacto itens={superDestaques} /> : <Carrossel itens={superDestaques} />)}
    </section>
  );
}

function DestaqueExclusivo({ destaque }: { destaque: Destaque }) {
  const { item } = destaque;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <Link
        href={`/perfil/${item.slug}`}
        className="group relative flex min-h-36 overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_-12px_rgb(10_34_102/0.35)] ring-3 ring-amarelo-400 transition hover:-translate-y-0.5 sm:min-h-44"
      >
        <FotoMarcador icone={item.icone} cor={item.cor} className="w-28 shrink-0 sm:w-64" tamanhoIcone="text-5xl sm:text-7xl" />
        <div className="flex flex-1 flex-col justify-center gap-1 p-4 sm:p-6">
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amarelo-400 px-2.5 py-0.5 text-[0.7rem] font-extrabold uppercase tracking-wide text-azul-900">
            <Icone nome="estrela" className="size-3" fill="currentColor" />
            Destaque do mês
          </span>
          <h2 className="font-display text-2xl leading-tight font-extrabold text-azul-900 sm:text-3xl">
            {item.nome} <Selo selo={item.selo} className="align-[-0.1em]" />
          </h2>
          <p className="text-sm font-semibold text-slate-600">
            {item.categoriaNome} · {destaque.bairro}
          </p>
          <p className="mt-1 hidden max-w-xl text-sm text-slate-600 sm:line-clamp-2">{destaque.descricao}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-sm font-extrabold text-azul-600 group-hover:underline">
            Ver perfil <Icone nome="direita" className="size-4" />
          </span>
        </div>
      </Link>
    </div>
  );
}

function DestaqueExclusivoCompacto({ destaque }: { destaque: Destaque }) {
  const { item } = destaque;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-2">
      <Link
        href={`/perfil/${item.slug}`}
        className="flex items-center gap-3 rounded-2xl bg-amarelo-200/60 px-3 py-1.5 ring-1 ring-amarelo-400 hover:bg-amarelo-200"
      >
        <FotoMarcador icone={item.icone} cor={item.cor} className="size-9 shrink-0 rounded-xl" tamanhoIcone="text-lg" />
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-extrabold text-azul-900 uppercase text-[0.7rem] tracking-wide">Destaque do mês · </span>
          <span className="font-bold">{item.nome}</span>
          <span className="text-slate-600"> · {item.categoriaNome}</span>
        </span>
        <Icone nome="direita" className="size-4 shrink-0 text-azul-700" />
      </Link>
    </div>
  );
}

function Carrossel({ itens }: { itens: ItemResultado[] }) {
  return (
    <div className="pt-4">
      <h2 className="mx-auto max-w-6xl px-4 text-xs font-extrabold tracking-wider text-azul-700 uppercase">
        Super Destaque
      </h2>
      <div className="mt-2 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_4%,black_96%,transparent)]">
        <div className="flex w-max animate-carrossel gap-3 py-2 hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
          {[0, 1].map((copia) => (
            <ul key={copia} className="flex gap-3" aria-hidden={copia === 1 || undefined}>
              {itens.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/perfil/${item.slug}`}
                    tabIndex={copia === 1 ? -1 : undefined}
                    className="block w-40 overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg sm:w-48"
                  >
                    <FotoMarcador icone={item.icone} cor={item.cor} className="h-24 w-full sm:h-28" />
                    <div className="p-2.5">
                      <p className="flex items-center gap-1 truncate text-sm font-extrabold text-tinta">
                        <span className="truncate">{item.nome}</span>
                        <Selo selo={item.selo} />
                      </p>
                      <p className="truncate text-xs font-semibold text-slate-500">{item.categoriaNome}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

function CarrosselCompacto({ itens }: { itens: ItemResultado[] }) {
  return (
    <div className="overflow-hidden pt-2 [mask-image:linear-gradient(90deg,transparent,black_4%,black_96%,transparent)]">
      <div className="flex w-max animate-carrossel gap-2 hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
        {[0, 1].map((copia) => (
          <ul key={copia} className="flex gap-2" aria-hidden={copia === 1 || undefined}>
            {itens.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/perfil/${item.slug}`}
                  tabIndex={copia === 1 ? -1 : undefined}
                  className="flex h-10 items-center gap-2 rounded-full bg-fundo py-1 pr-4 pl-1 ring-1 ring-azul-100 hover:bg-azul-50"
                >
                  <FotoMarcador icone={item.icone} cor={item.cor} className="size-8 rounded-full" tamanhoIcone="text-base" />
                  <span className="text-sm font-bold whitespace-nowrap">{item.nome}</span>
                  <Selo selo={item.selo} className="text-sm" />
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
