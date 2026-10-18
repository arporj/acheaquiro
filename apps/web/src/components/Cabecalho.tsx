import Link from "next/link";
import { Icone, classesBotao } from "@acheaqui/ui";
import { Logo } from "./Logo";
import { FormBusca } from "./FormBusca";

export function Cabecalho({ comBusca = false }: { comBusca?: boolean }) {
  return (
    <header className="fundo-raios text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 lg:py-4">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Principal">
          <Link href="/#categorias" className="hidden rounded-full px-4 py-2 text-sm font-bold text-white/90 hover:bg-white/10 md:inline-flex">
            Categorias
          </Link>
          <Link href="/sobre" className="hidden rounded-full px-4 py-2 text-sm font-bold text-white/90 hover:bg-white/10 md:inline-flex">
            Como funciona
          </Link>
          <Link href="/anuncie" className={classesBotao("amarelo", "p", "shadow-none")}>
            <Icone nome="megafone" className="size-4" />
            Anuncie aqui
          </Link>
        </nav>
      </div>
      {comBusca && (
        <div className="mx-auto max-w-6xl px-4 pb-3 lg:pb-4">
          <FormBusca />
        </div>
      )}
    </header>
  );
}
