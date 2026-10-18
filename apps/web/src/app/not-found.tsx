import Link from "next/link";
import { classesBotao } from "@acheaqui/ui";
import { Cabecalho } from "@/components/Cabecalho";

export default function NaoEncontrada() {
  return (
    <>
      <Cabecalho comBusca />
      <main className="mx-auto grid w-full max-w-xl flex-1 place-items-center px-4 py-16 text-center">
        <div>
          <p className="text-6xl" aria-hidden="true">
            🚧
          </p>
          <h1 className="mt-4 font-display text-3xl font-extrabold text-azul-900">Página não encontrada</h1>
          <p className="mt-2 text-slate-600">
            O endereço pode estar errado ou a página ainda está em construção. Que tal buscar o que você precisa?
          </p>
          <Link href="/" className={classesBotao("azul", "m", "mt-6")}>
            Voltar para o início
          </Link>
        </div>
      </main>
    </>
  );
}
