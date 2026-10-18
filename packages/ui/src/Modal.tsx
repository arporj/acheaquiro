"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icone } from "./Icone";

// Modal da própria interface (o projeto não usa alert/confirm do navegador).
// Usa <dialog> nativo: prende o foco e fecha com Esc.
export function Modal({
  aberto,
  aoFechar,
  titulo,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white p-0 text-tinta shadow-2xl backdrop:bg-azul-900/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <h2 className="font-display text-xl font-bold text-azul-900">{titulo}</h2>
        <button
          type="button"
          onClick={aoFechar}
          className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
          aria-label="Fechar"
        >
          <Icone nome="fechar" className="size-5" />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}
