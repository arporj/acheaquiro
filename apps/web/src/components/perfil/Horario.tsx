import type { HorarioDia } from "@acheaqui/types";

const nomesDias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const ordemDias = [1, 2, 3, 4, 5, 6, 0]; // semana começando na segunda

function vinteEQuatroHoras(dia: HorarioDia) {
  return dia.intervalos.length === 1 && dia.intervalos[0].abre === "00:00" && dia.intervalos[0].fecha === "23:59";
}

export function Horario({ horario }: { horario: HorarioDia[] }) {
  if (horario.length === 0 || horario.every((d) => d.intervalos.length === 0)) {
    return <p className="text-slate-600">Horário a combinar pelo WhatsApp.</p>;
  }
  if (horario.every(vinteEQuatroHoras)) {
    return <p className="font-bold text-zap-700">Atende 24 horas, todos os dias.</p>;
  }

  return (
    <dl className="divide-y divide-slate-100">
      {ordemDias.map((numero) => {
        const dia = horario.find((d) => d.dia === numero);
        const intervalos = dia?.intervalos ?? [];
        return (
          <div key={numero} className="flex justify-between gap-4 py-2 text-sm">
            <dt className="font-bold">{nomesDias[numero]}</dt>
            <dd className={intervalos.length ? "text-tinta" : "text-slate-400"}>
              {intervalos.length ? intervalos.map((i) => `${i.abre} às ${i.fecha}`).join(" · ") : "Fechado"}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
