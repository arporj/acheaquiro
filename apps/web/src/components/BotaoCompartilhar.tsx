"use client";

import { useEffect, useState } from "react";
import { Icone, classesBotao } from "@acheaqui/ui";

// Usa o compartilhamento nativo do celular; no computador, copia o link e
// avisa com uma mensagem na própria tela.
export function BotaoCompartilhar({
  caminho,
  titulo,
  variante = "icone",
}: {
  caminho: string;
  titulo: string;
  variante?: "icone" | "botao";
}) {
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const temporizador = setTimeout(() => setAviso(null), 2500);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  async function compartilhar() {
    const url = new URL(caminho, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, url });
        return;
      } catch (erro) {
        if (erro instanceof DOMException && erro.name === "AbortError") return; // a pessoa cancelou
        console.error("Falha no compartilhamento nativo, copiando o link:", erro);
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setAviso("Link copiado!");
    } catch (erro) {
      console.error("Não foi possível copiar o link:", erro);
      setAviso("Não foi possível copiar o link.");
    }
  }

  return (
    <>
      {variante === "icone" ? (
        <button
          type="button"
          onClick={compartilhar}
          className={classesBotao("contorno", "m", "w-11 shrink-0 px-0!")}
          aria-label={`Compartilhar ${titulo}`}
        >
          <Icone nome="compartilhar" className="size-5" />
        </button>
      ) : (
        <button type="button" onClick={compartilhar} className={classesBotao("contorno", "p")}>
          <Icone nome="compartilhar" className="size-4" />
          Compartilhar
        </button>
      )}
      {aviso && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-tinta px-5 py-2.5 text-sm font-bold text-white shadow-xl lg:bottom-8"
        >
          {aviso}
        </div>
      )}
    </>
  );
}
