"use client";

// TEMPORÁRIO: só existe para comparar as versões das faixas de anúncio.
// Sai do projeto depois que a versão for escolhida.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ModoAnuncios = "completas" | "compactas-internas" | "compactas-todas";

const CHAVE = "prototipo-modo-anuncios";
const modos: ModoAnuncios[] = ["completas", "compactas-internas", "compactas-todas"];

const Contexto = createContext<{ modo: ModoAnuncios; mudarModo: (modo: ModoAnuncios) => void }>({
  modo: "completas",
  mudarModo: () => {},
});

export function ProvedorAnuncios({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState<ModoAnuncios>("completas");

  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE) as ModoAnuncios | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência lida só no navegador, depois da hidratação
      if (salvo && modos.includes(salvo)) setModo(salvo);
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

  return <Contexto.Provider value={{ modo, mudarModo }}>{children}</Contexto.Provider>;
}

export function useModoAnuncios() {
  return useContext(Contexto);
}
