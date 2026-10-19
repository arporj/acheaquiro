"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icone, IconeCategoria, classesBotao } from "@acheaqui/ui";
import type { Bairro } from "@acheaqui/types";
import type { ItemResultado } from "@/dados/consultas";
import { CardResultado } from "./CardResultado";

type Aba = "profissional" | "comercio";

export function ListaResultados({
  itens,
  bairros,
  bairroInicial = "",
}: {
  itens: ItemResultado[];
  bairros: Bairro[];
  bairroInicial?: string;
}) {
  const totalProfissionais = itens.filter((i) => i.tipo === "profissional").length;
  const totalComercios = itens.length - totalProfissionais;

  const [aba, setAba] = useState<Aba>(totalProfissionais === 0 && totalComercios > 0 ? "comercio" : "profissional");
  const [bairro, setBairro] = useState(bairroInicial);
  const [somenteAbertos, setSomenteAbertos] = useState(false);
  const [maisPerto, setMaisPerto] = useState(false);

  const filtrados = useMemo(() => {
    const lista = itens.filter(
      (i) =>
        i.tipo === aba &&
        (!bairro || i.todaCidade || i.bairroIds.includes(bairro)) &&
        (aba !== "comercio" || !somenteAbertos || i.abertoAgora),
    );
    if (aba !== "comercio" || !maisPerto) return lista;
    // SIMULAÇÃO: patrocinados continuam no topo e o resto vai pela distância.
    const patrocinados = lista.filter((i) => i.patrocinado);
    const demais = lista.filter((i) => !i.patrocinado).sort((a, b) => (a.distanciaKm ?? 99) - (b.distanciaKm ?? 99));
    return [...patrocinados, ...demais];
  }, [itens, aba, bairro, somenteAbertos, maisPerto]);

  const abas: { id: Aba; rotulo: string; total: number }[] = [
    { id: "profissional", rotulo: "Profissionais", total: totalProfissionais },
    { id: "comercio", rotulo: "Comércios", total: totalComercios },
  ];

  const temFiltro = Boolean(bairro) || somenteAbertos;

  return (
    <div>
      <div role="tablist" aria-label="Tipo de anunciante" className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-black/5">
        {abas.map((a) => (
          <button
            key={a.id}
            role="tab"
            type="button"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl font-display text-base font-bold transition ${
              aba === a.id ? "bg-azul-600 text-white shadow" : "text-slate-600 hover:bg-azul-50"
            }`}
          >
            {a.rotulo}
            <span
              className={`rounded-full px-2 text-xs font-extrabold ${
                aba === a.id ? "bg-amarelo-400 text-azul-900" : "bg-slate-100 text-slate-500"
              }`}
            >
              {a.total}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <label className="relative shrink-0">
          <span className="sr-only">Filtrar por bairro</span>
          <Icone nome="pin" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-vermelho-500" />
          <select
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            className={`h-9 max-w-52 appearance-none rounded-full pr-8 pl-8 text-sm font-bold ring-1 focus:ring-3 focus:ring-amarelo-400 focus:outline-none ${
              bairro ? "bg-azul-600 text-white ring-azul-600" : "bg-white text-tinta ring-azul-100"
            }`}
          >
            <option value="">Todos os bairros</option>
            {bairros.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
          <Icone nome="abaixo" className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-60" />
        </label>
        {aba === "comercio" && (
          <>
            <button
              type="button"
              aria-pressed={maisPerto}
              onClick={() => setMaisPerto(!maisPerto)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold ring-1 ${
                maisPerto ? "bg-azul-600 text-white ring-azul-600" : "bg-white text-tinta ring-azul-100 hover:bg-azul-50"
              }`}
            >
              <Icone nome="localizar" className="size-4" />
              Mais perto de mim
            </button>
            <button
              type="button"
              aria-pressed={somenteAbertos}
              onClick={() => setSomenteAbertos(!somenteAbertos)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold ring-1 ${
                somenteAbertos ? "bg-zap-600 text-white ring-zap-600" : "bg-white text-tinta ring-azul-100 hover:bg-azul-50"
              }`}
            >
              <Icone nome="relogio" className="size-4" />
              Aberto agora
            </button>
          </>
        )}
      </div>

      {aba === "comercio" && maisPerto && (
        <p className="mt-2 rounded-xl bg-azul-50 px-3 py-2 text-xs text-azul-800">
          Protótipo: no site real, o navegador pede permissão para usar a sua localização. Se você não permitir, a lista
          usa o bairro escolhido.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {filtrados.map((item) => (
          <CardResultado key={item.id} item={item} mostrarDistancia={maisPerto} />
        ))}
      </div>

      {filtrados.length === 0 && (
        <div className="mt-4 rounded-3xl border-2 border-dashed border-azul-100 bg-white px-6 py-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-azul-50 text-azul-600">
            <IconeCategoria nome="search-x" className="size-7" />
          </span>
          {temFiltro && abas.find((a) => a.id === aba)!.total > 0 ? (
            <>
              <p className="mt-2 font-display text-xl font-bold text-azul-900">Nenhum resultado com esses filtros</p>
              <button
                type="button"
                onClick={() => {
                  setBairro("");
                  setSomenteAbertos(false);
                }}
                className={classesBotao("contorno", "p", "mt-4")}
              >
                Limpar filtros
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 font-display text-xl font-bold text-azul-900">
                Ainda não temos {aba === "comercio" ? "comércios" : "profissionais"} aqui
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
                Conhece alguém bom nisso em Rio das Ostras? Conte para essa pessoa que dá para anunciar no Ache Aqui.
              </p>
              <Link href="/anuncie" className={classesBotao("amarelo", "p", "mt-4")}>
                Quero anunciar
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
