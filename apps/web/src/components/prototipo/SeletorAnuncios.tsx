"use client";

// TEMPORÁRIO: painel flutuante para alternar as versões das faixas de anúncio.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icone } from "@acheaqui/ui";
import { useModoAnuncios, type ModoAnuncios } from "./ProvedorAnuncios";

const opcoes: { modo: ModoAnuncios; rotulo: string }[] = [
  { modo: "completas", rotulo: "Completas em todas as páginas" },
  { modo: "compactas-internas", rotulo: "Completas só na inicial" },
  { modo: "compactas-todas", rotulo: "Compactas em todas" },
];

export function SeletorAnuncios() {
  const { modo, mudarModo, fixadoPelaUrl } = useModoAnuncios();
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();

  if (fixadoPelaUrl || caminho.startsWith("/prototipo")) return null;

  return (
    <div className="fixed bottom-24 left-3 z-50 flex flex-col items-start gap-2 lg:bottom-4">
      {aberto && (
        <div className="w-64 rounded-2xl border border-azul-100 bg-white p-3 shadow-xl">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
            Protótipo · faixas de anúncio
          </p>
          <div className="flex flex-col gap-1">
            {opcoes.map((opcao) => (
              <button
                key={opcao.modo}
                type="button"
                onClick={() => mudarModo(opcao.modo)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                  modo === opcao.modo ? "bg-azul-600 text-white" : "text-tinta hover:bg-azul-50"
                }`}
              >
                <span className="grid size-4 place-items-center">
                  {modo === opcao.modo && <Icone nome="certo" className="size-4" />}
                </span>
                {opcao.rotulo}
              </button>
            ))}
          </div>
          <Link
            href="/prototipo/faixas"
            className="mt-2 flex items-center justify-center gap-1 rounded-xl bg-amarelo-400 px-3 py-2 text-sm font-extrabold text-azul-900 hover:bg-amarelo-300"
          >
            Comparar lado a lado
            <Icone nome="direita" className="size-4" />
          </Link>
          <p className="mt-2 text-[0.7rem] leading-snug text-slate-500">
            Dados fictícios. Este painel sai depois da escolha.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="flex items-center gap-2 rounded-full bg-vermelho-500 px-4 py-2.5 text-sm font-extrabold text-white shadow-xl ring-4 ring-amarelo-400 hover:bg-vermelho-600"
        aria-expanded={aberto}
      >
        <Icone nome={aberto ? "fechar" : "megafone"} className="size-4" />
        {aberto ? "Fechar" : "Testar faixas de anúncio"}
      </button>
    </div>
  );
}
