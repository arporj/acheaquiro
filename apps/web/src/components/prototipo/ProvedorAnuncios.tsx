"use client";

// TEMPORÁRIO: só existe para comparar as versões das faixas de anúncio.
// Sai do projeto depois que a versão for escolhida.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ModoAnuncios = "completas" | "compactas-internas" | "compactas-todas";

const CHAVE = "prototipo-modo-anuncios";
export const modosAnuncios: ModoAnuncios[] = ["completas", "compactas-internas", "compactas-todas"];

const Contexto = createContext<{
  modo: ModoAnuncios;
  mudarModo: (modo: ModoAnuncios) => void;
  /** Modo fixado por ?anuncios= na URL (página de comparação): o painel some. */
  fixadoPelaUrl: boolean;
}>({
  modo: "completas",
  mudarModo: () => {},
  fixadoPelaUrl: false,
});

function ehModo(valor: string | null): valor is ModoAnuncios {
  return valor !== null && (modosAnuncios as string[]).includes(valor);
}

export function ProvedorAnuncios({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState<ModoAnuncios>("completas");
  const [fixadoPelaUrl, setFixadoPelaUrl] = useState(false);

  useEffect(() => {
    const daUrl = new URLSearchParams(window.location.search).get("anuncios");
    if (ehModo(daUrl)) {
      /* eslint-disable react-hooks/set-state-in-effect -- parâmetro lido só no navegador, depois da hidratação */
      setModo(daUrl);
      setFixadoPelaUrl(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    try {
      const salvo = window.localStorage.getItem(CHAVE);
      if (ehModo(salvo)) setModo(salvo);
    } catch (erro) {
      console.warn("Não foi possível ler a preferência do protótipo:", erro);
    }
  }, []);

  function mudarModo(novo: ModoAnuncios) {
    setModo(novo);
    try {
      window.localStorage.setItem(CHAVE, novo);
    } catch (erro) {
      console.warn("Não foi possível salvar a preferência do protótipo:", erro);
    }
  }

  return <Contexto.Provider value={{ modo, mudarModo, fixadoPelaUrl }}>{children}</Contexto.Provider>;
}

export function useModoAnuncios() {
  return useContext(Contexto);
}
