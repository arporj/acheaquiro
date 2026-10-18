import type { Selo as TipoSelo } from "@acheaqui/types";
import { Icone } from "./Icone";

const estilosSelo: Record<Exclude<TipoSelo, "nenhum">, { cor: string; preenchimento: string; rotulo: string }> = {
  transparente: { cor: "#5B7BC9", preenchimento: "none", rotulo: "Selo estrela transparente" },
  prata: { cor: "#8A97A8", preenchimento: "#C9D2DC", rotulo: "Selo estrela prateada" },
  ouro: { cor: "#D99A00", preenchimento: "#FFC72C", rotulo: "Selo estrela dourada" },
};

export function Selo({ selo, className = "" }: { selo: TipoSelo; className?: string }) {
  if (selo === "nenhum") return null;
  const estilo = estilosSelo[selo];
  return (
    <span title={estilo.rotulo} className={`inline-flex shrink-0 ${className}`}>
      <Icone nome="estrela" stroke={estilo.cor} fill={estilo.preenchimento} strokeWidth={2.2} className="size-[1.1em]" />
      <span className="sr-only">{estilo.rotulo}</span>
    </span>
  );
}

export function EtiquetaFundador() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-vermelho-500 px-2 py-0.5 text-[0.7rem] font-extrabold uppercase tracking-wide text-white">
      <Icone nome="medalha" className="size-3" />
      Fundador
    </span>
  );
}

export function EtiquetaPatrocinado() {
  return (
    <span className="inline-flex items-center rounded-md bg-amarelo-400 px-2 py-0.5 text-[0.7rem] font-extrabold uppercase tracking-wide text-azul-900">
      Patrocinado
    </span>
  );
}

export function EtiquetaAberto({ aberto }: { aberto: boolean }) {
  return aberto ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-zap-50 px-2 py-0.5 text-xs font-bold text-zap-700">
      <span className="size-2 rounded-full bg-zap-600" /> Aberto agora
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
      <span className="size-2 rounded-full bg-slate-400" /> Fechado
    </span>
  );
}
