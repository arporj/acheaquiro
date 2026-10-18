import Link from "next/link";
import { EtiquetaAberto, EtiquetaFundador, EtiquetaPatrocinado, FotoMarcador, Icone, Selo, classesBotao } from "@acheaqui/ui";
import type { ItemResultado } from "@/dados/consultas";
import { MENSAGEM_ORCAMENTO, linkTelefone, linkWhatsApp } from "@/lib/contato";
import { BotaoCompartilhar } from "../BotaoCompartilhar";

export function CardResultado({ item, mostrarDistancia = false }: { item: ItemResultado; mostrarDistancia?: boolean }) {
  const perfil = `/perfil/${item.slug}`;

  return (
    <article
      className={`rounded-2xl bg-white p-3 shadow-sm transition hover:shadow-md sm:p-4 ${
        item.patrocinado ? "ring-2 ring-amarelo-400" : "ring-1 ring-black/5"
      }`}
    >
      <Link href={perfil} className="flex gap-3 sm:gap-4">
        <FotoMarcador icone={item.icone} cor={item.cor} className="size-20 shrink-0 rounded-xl sm:size-24" />
        <div className="min-w-0 flex-1">
          {(item.patrocinado || item.fundador) && (
            <div className="mb-1 flex flex-wrap gap-1">
              {item.patrocinado && <EtiquetaPatrocinado />}
              {item.fundador && <EtiquetaFundador />}
            </div>
          )}
          <h3 className="flex items-center gap-1.5 font-display text-lg leading-tight font-bold text-tinta">
            <span className="truncate">{item.nome}</span>
            <Selo selo={item.selo} />
          </h3>
          <p className="text-sm font-bold text-azul-600">{item.categoriaNome}</p>
          <p className="mt-0.5 flex items-start gap-1 text-sm text-slate-600">
            <Icone nome="pin" className="mt-0.5 size-3.5 shrink-0 text-vermelho-500" />
            <span className="line-clamp-2">{item.local}</span>
          </p>
          {item.tipo === "comercio" && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {item.abertoAgora !== undefined && <EtiquetaAberto aberto={item.abertoAgora} />}
              {mostrarDistancia && item.distanciaKm !== undefined && (
                <span className="text-xs font-bold text-slate-600">
                  a {item.distanciaKm.toLocaleString("pt-BR")} km de você
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
      <div className="mt-3 flex gap-2">
        <a
          href={linkWhatsApp(item.whatsapp, MENSAGEM_ORCAMENTO)}
          target="_blank"
          rel="noopener noreferrer"
          className={classesBotao("zap", "m", "flex-1")}
        >
          <Icone nome="mensagem" className="size-5" />
          WhatsApp
        </a>
        <a href={linkTelefone(item.telefone ?? item.whatsapp)} className={classesBotao("contorno", "m", "px-4")}>
          <Icone nome="telefone" className="size-4" />
          Ligar
        </a>
        <BotaoCompartilhar caminho={perfil} titulo={item.nome} />
      </div>
    </article>
  );
}
