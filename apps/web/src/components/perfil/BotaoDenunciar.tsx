"use client";

import { useState } from "react";
import { Icone, Modal, classesBotao } from "@acheaqui/ui";
import type { MotivoDenuncia } from "@acheaqui/types";

const motivos: { id: MotivoDenuncia; rotulo: string }[] = [
  { id: "informacao_falsa", rotulo: "Informação falsa" },
  { id: "telefone_errado", rotulo: "Telefone errado" },
  { id: "servico_nao_prestado", rotulo: "Serviço não prestado" },
  { id: "conteudo_improprio", rotulo: "Conteúdo impróprio" },
  { id: "outro", rotulo: "Outro motivo" },
];

// Denúncia de perfil (item 4.9). No protótipo, o envio é só visual.
export function BotaoDenunciar({ nomeAnunciante }: { nomeAnunciante: string }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoDenuncia | null>(null);
  const [descricao, setDescricao] = useState("");
  const [enviado, setEnviado] = useState(false);

  function fechar() {
    setAberto(false);
    setMotivo(null);
    setDescricao("");
    setEnviado(false);
  }

  const podeEnviar = motivo !== null && (motivo !== "outro" || descricao.trim().length >= 10);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-slate-500 hover:bg-vermelho-500/10 hover:text-vermelho-600"
      >
        <Icone nome="bandeira" className="size-4" />
        Denunciar
      </button>

      <Modal aberto={aberto} aoFechar={fechar} titulo={enviado ? "Denúncia enviada" : "Denunciar perfil"}>
        {enviado ? (
          <div className="text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-zap-50 text-zap-700">
              <Icone nome="certo" className="size-7" strokeWidth={3} />
            </span>
            <p className="mt-3 text-slate-600">
              Obrigado! A equipe do Ache Aqui vai analisar o perfil de <strong>{nomeAnunciante}</strong>.
            </p>
            <button type="button" onClick={fechar} className={classesBotao("azul", "m", "mt-5 w-full")}>
              Fechar
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (podeEnviar) setEnviado(true);
            }}
          >
            <p className="mb-3 text-sm text-slate-600">
              O que há de errado com o perfil de <strong>{nomeAnunciante}</strong>?
            </p>
            <fieldset className="space-y-2">
              <legend className="sr-only">Motivo</legend>
              {motivos.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 font-semibold ring-1 ${
                    motivo === m.id ? "bg-azul-50 ring-azul-500" : "ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo"
                    value={m.id}
                    checked={motivo === m.id}
                    onChange={() => setMotivo(m.id)}
                    className="size-4 accent-azul-600"
                  />
                  {m.rotulo}
                </label>
              ))}
            </fieldset>
            {motivo === "outro" && (
              <label className="mt-3 block">
                <span className="text-sm font-bold">Conte o que aconteceu</span>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="mt-1 w-full rounded-xl border-0 p-3 ring-1 ring-slate-200 focus:ring-3 focus:ring-amarelo-400 focus:outline-none"
                />
                <span className="text-xs text-slate-500">Pelo menos 10 caracteres.</span>
              </label>
            )}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={fechar} className={classesBotao("contorno", "m", "flex-1")}>
                Cancelar
              </button>
              <button type="submit" disabled={!podeEnviar} className={classesBotao("perigo", "m", "flex-1")}>
                Enviar denúncia
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
