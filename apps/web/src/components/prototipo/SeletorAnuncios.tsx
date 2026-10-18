"use client";

// TEMPORÁRIO: painel flutuante para alternar as versões das faixas de anúncio.
import { useState } from "react";
import { Icone } from "@acheaqui/ui";
import { useModoAnuncios, type ModoAnuncios } from "./ProvedorAnuncios";

const opcoes: { modo: ModoAnuncios; rotulo: string }[] = [
  { modo: "completas", rotulo: "Completas em todas as páginas" },
  { modo: "compactas-internas", rotulo: "Completas só na inicial" },
  { modo: "compactas-todas", rotulo: "Compactas em todas" },
];

export function SeletorAnuncios() {
  const { modo, mudarModo } = useModoAnuncios();
  const [aberto, setAberto] = useState(false);

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
          <p className="mt-2 text-[0.7rem] leading-snug text-slate-500">
            Dados fictícios. Este painel sai depois da escolha.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="flex items-center gap-1.5 rounded-full bg-tinta px-3 py-2 text-xs font-bold text-white shadow-lg ring-2 ring-white"
        aria-expanded={aberto}
      >
        <Icone nome="filtro" className="size-3.5" />
        {aberto ? "Fechar" : "Protótipo"}
      </button>
    </div>
  );
}
