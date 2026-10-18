import { Icone, classesBotao } from "@acheaqui/ui";
import type { Anunciante } from "@acheaqui/types";
import {
  MENSAGEM_INFORMACAO,
  MENSAGEM_ORCAMENTO,
  formatarTelefone,
  linkComoChegar,
  linkTelefone,
  linkWhatsApp,
} from "@/lib/contato";

function links(anunciante: Anunciante) {
  const endereco = anunciante.tipo === "comercio" ? anunciante.enderecos[0] : undefined;
  return {
    orcamento: linkWhatsApp(anunciante.whatsapp, MENSAGEM_ORCAMENTO),
    mensagem: linkWhatsApp(anunciante.whatsapp, MENSAGEM_INFORMACAO),
    telefone: linkTelefone(anunciante.telefone ?? anunciante.whatsapp),
    comoChegar: endereco && linkComoChegar(endereco.latitude, endereco.longitude),
  };
}

const externo = { target: "_blank", rel: "noopener noreferrer" } as const;

/** Cartão lateral, no computador. */
export function CartaoContato({ anunciante }: { anunciante: Anunciante }) {
  const l = links(anunciante);
  return (
    <div className="rounded-3xl bg-white p-5 shadow-md ring-1 ring-black/5">
      <h2 className="font-display text-xl font-bold text-azul-900">Entre em contato</h2>
      <p className="mb-4 text-sm text-slate-500">Direto com o anunciante, sem intermediários.</p>
      <div className="flex flex-col gap-2">
        <a href={l.orcamento} {...externo} className={classesBotao("zap", "g")}>
          <Icone nome="mensagem" className="size-5" />
          Pedir orçamento
        </a>
        <a href={l.mensagem} {...externo} className={classesBotao("contornoZap", "m")}>
          <Icone nome="mensagem" className="size-4" />
          Enviar mensagem
        </a>
        <a href={l.telefone} className={classesBotao("contorno", "m")}>
          <Icone nome="telefone" className="size-4" />
          Ligar · {formatarTelefone(anunciante.telefone ?? anunciante.whatsapp)}
        </a>
        {l.comoChegar && (
          <a href={l.comoChegar} {...externo} className={classesBotao("contorno", "m")}>
            <Icone nome="rota" className="size-4" />
            Como chegar
          </a>
        )}
      </div>
    </div>
  );
}

/** Barra fixa no rodapé da tela, no celular. */
export function BarraContato({ anunciante }: { anunciante: Anunciante }) {
  const l = links(anunciante);
  const icone = "grid size-12 shrink-0 place-items-center rounded-full border-2 border-azul-100 bg-white text-azul-700";
  return (
    <div className="barra-contato fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-2">
        <a href={l.orcamento} {...externo} className={classesBotao("zap", "g", "flex-1 px-3")}>
          <Icone nome="mensagem" className="size-5" />
          Pedir orçamento
        </a>
        <a href={l.mensagem} {...externo} className={`${icone} border-zap-600 text-zap-700`} aria-label="Enviar mensagem pelo WhatsApp">
          <Icone nome="mensagem" className="size-5" />
        </a>
        <a href={l.telefone} className={icone} aria-label="Ligar">
          <Icone nome="telefone" className="size-5" />
        </a>
        {l.comoChegar && (
          <a href={l.comoChegar} {...externo} className={icone} aria-label="Como chegar">
            <Icone nome="rota" className="size-5" />
          </a>
        )}
      </div>
    </div>
  );
}
