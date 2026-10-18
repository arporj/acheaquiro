import Link from "next/link";
import { Icone, classesBotao } from "@acheaqui/ui";
import type { Categoria } from "@acheaqui/types";

export function LateralResultados({ relacionadas }: { relacionadas: Categoria[] }) {
  return (
    <aside className="space-y-4">
      {relacionadas.length > 0 && (
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="mb-3 font-display text-lg font-bold text-azul-900">Veja também</h2>
          <ul className="flex flex-wrap gap-1.5">
            {relacionadas.map((categoria) => (
              <li key={categoria.id}>
                <Link
                  href={`/${categoria.slugLista}`}
                  className="inline-flex items-center gap-1 rounded-full bg-fundo px-3 py-1 text-sm font-semibold hover:bg-azul-50 hover:text-azul-700"
                >
                  <span aria-hidden="true">{categoria.icone}</span>
                  {categoria.nome}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="fundo-raios rounded-3xl p-5 text-white">
        <p className="font-display text-2xl leading-tight font-extrabold">
          Trabalha com isso? <span className="text-amarelo-400">Apareça aqui!</span>
        </p>
        <p className="mt-2 text-sm text-white/85">Profissional autônomo a partir de R$ 1,99 por mês. Comércio tem plano gratuito.</p>
        <Link href="/anuncie" className={classesBotao("amarelo", "p", "mt-4")}>
          <Icone nome="megafone" className="size-4" />
          Anuncie aqui
        </Link>
      </div>
    </aside>
  );
}
