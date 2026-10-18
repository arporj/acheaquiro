import type { ReactNode } from "react";

export function Secao({ titulo, children, extra }: { titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-azul-900">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}
