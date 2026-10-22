// Calendário mensal da Agenda, no navegador (src/components/agenda/AgendaCalendario.astro).
// Datas sempre como texto AAAA-MM-DD, no fuso de Rio das Ostras.

const FUSO = "America/Sao_Paulo";

function hojeNaCidade(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
}

function dataUTC(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function paraISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Primeiro dia do mês de `iso`, somando `meses`. */
function inicioDoMes(iso: string, meses = 0): string {
  const data = dataUTC(iso);
  return paraISO(new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + meses, 1)));
}

export function ligarAgendaCalendario(agenda: HTMLElement): void {
  const itens = [...agenda.querySelectorAll<HTMLElement>("[data-lista] > li")];
  const grade = agenda.querySelector<HTMLElement>("[data-dias]")!;
  const tituloMes = agenda.querySelector<HTMLElement>("[data-titulo-mes]")!;
  const tituloDia = agenda.querySelector<HTMLElement>("[data-titulo-dia]")!;
  const vazio = agenda.querySelector<HTMLElement>("[data-vazio]")!;
  const bairro = agenda.querySelector<HTMLSelectElement>("[data-bairro]");
  const aviso = agenda.querySelector<HTMLElement>("[data-aviso-artista]");

  const hoje = hojeNaCidade();
  const parametro = new URLSearchParams(location.search).get("artista");
  let artista = agenda.dataset.filtroArtista && parametro ? parametro : "";

  const visivel = (item: HTMLElement) =>
    (artista === "" || item.dataset.artista === artista) && (!bairro?.value || item.dataset.itemBairro === bairro.value);

  /** Dia mostrado ao abrir: hoje, se tiver show; senão o próximo dia com show; senão hoje. */
  function diaInicial(): string {
    const dias = itens.filter(visivel).map((i) => i.dataset.dia!).sort();
    if (dias.includes(hoje)) return hoje;
    return dias.find((d) => d >= hoje) ?? hoje;
  }

  let selecionado = diaInicial();
  let mes = inicioDoMes(selecionado);

  function desenhar(): void {
    const contagem = new Map<string, number>();
    for (const item of itens) if (visivel(item)) contagem.set(item.dataset.dia!, (contagem.get(item.dataset.dia!) ?? 0) + 1);

    tituloMes.textContent = dataUTC(mes).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    const primeiro = dataUTC(mes);
    const diasNoMes = new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth() + 1, 0)).getUTCDate();
    const celulas: HTMLElement[] = [];
    for (let i = 0; i < primeiro.getUTCDay(); i++) celulas.push(document.createElement("span"));
    for (let d = 1; d <= diasNoMes; d++) {
      const iso = paraISO(new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth(), d)));
      const shows = contagem.get(iso) ?? 0;
      const botao = document.createElement("button");
      botao.type = "button";
      botao.dataset.diaCalendario = iso;
      botao.setAttribute("aria-pressed", String(iso === selecionado));
      botao.setAttribute("aria-label", `${d}${shows > 0 ? `, ${shows} ${shows === 1 ? "show" : "shows"}` : ""}`);
      botao.className = [
        "flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-bold transition sm:aspect-auto sm:h-14",
        iso === selecionado ? "bg-azul-600 text-white" : shows > 0 ? "bg-azul-50 text-azul-900 hover:bg-azul-100" : "text-slate-400 hover:bg-slate-50",
        iso === hoje && iso !== selecionado ? "ring-2 ring-amarelo-400" : "",
      ].join(" ");
      const numero = document.createElement("span");
      numero.textContent = String(d);
      botao.append(numero);
      if (shows > 0) {
        const marca = document.createElement("span");
        marca.className = `text-[0.6rem] leading-none ${iso === selecionado ? "text-white" : "text-vermelho-600"}`;
        marca.textContent = shows === 1 ? "1 show" : `${shows} shows`;
        botao.append(marca);
      }
      botao.addEventListener("click", () => {
        selecionado = iso;
        desenhar();
      });
      celulas.push(botao);
    }
    grade.replaceChildren(...celulas);

    tituloDia.textContent =
      selecionado === hoje
        ? "Hoje"
        : dataUTC(selecionado).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    let algum = false;
    for (const item of itens) {
      item.hidden = item.dataset.dia !== selecionado || !visivel(item);
      if (!item.hidden) algum = true;
    }
    vazio.hidden = algum;

    if (aviso) {
      aviso.hidden = artista === "";
      const nome = itens.find((i) => i.dataset.artista === artista)?.dataset.artistaNome ?? artista;
      aviso.querySelector<HTMLElement>("[data-nome-artista]")!.textContent = nome;
    }
  }

  agenda.querySelector("[data-mes-anterior]")?.addEventListener("click", () => {
    mes = inicioDoMes(mes, -1);
    desenhar();
  });
  agenda.querySelector("[data-mes-seguinte]")?.addEventListener("click", () => {
    mes = inicioDoMes(mes, 1);
    desenhar();
  });
  agenda.querySelector("[data-ir-hoje]")?.addEventListener("click", () => {
    selecionado = hoje;
    mes = inicioDoMes(hoje);
    desenhar();
  });
  bairro?.addEventListener("change", desenhar);
  agenda.querySelector("[data-tirar-artista]")?.addEventListener("click", () => {
    artista = "";
    const url = new URL(location.href);
    url.searchParams.delete("artista");
    history.replaceState(null, "", url);
    desenhar();
  });

  desenhar();
}
