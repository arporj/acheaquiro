// Agenda no navegador (src/components/agenda/AgendaCalendario.astro), em dois
// formatos: "calendario" (o mês inteiro; setas trocam de mês) e "faixa" (os dias
// que cabem na largura da tela, de 5 a 14, numa linha sem rolagem; as setas andam
// essa quantidade), este no perfil do comércio, que tem menos espaço. Datas sempre como texto AAAA-MM-DD, no fuso de Rio das Ostras. A
// página traz prontos os meses de data-meses; os outros são buscados em
// /agenda/mes, um mês por vez, quando o visitante navega até eles.

const FUSO = "America/Sao_Paulo";
const MINIMO_NA_FAIXA = 5;
const MAXIMO_NA_FAIXA = 14;
/** Largura mínima de um dia na faixa, com o espaço entre eles, em pixels. */
const LARGURA_DIA_NA_FAIXA = 56;
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

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

function somarDias(iso: string, dias: number): string {
  const data = dataUTC(iso);
  return paraISO(new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate() + dias)));
}

/** Primeiro dia do mês de `iso`, somando `meses`. */
function inicioDoMes(iso: string, meses = 0): string {
  const data = dataUTC(iso);
  return paraISO(new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + meses, 1)));
}

function fimDoMes(iso: string): string {
  return somarDias(inicioDoMes(iso, 1), -1);
}

const curta = (iso: string) => dataUTC(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });

export function ligarAgendaCalendario(agenda: HTMLElement): void {
  const faixa = agenda.dataset.formato === "faixa";
  const lista = agenda.querySelector<HTMLElement>("[data-lista]")!;
  const itens = [...lista.querySelectorAll<HTMLElement>(":scope > li")];
  const carregados = new Set((agenda.dataset.meses ?? "").split(",").filter(Boolean));
  const carregando = agenda.querySelector<HTMLElement>("[data-carregando]")!;
  const erro = agenda.querySelector<HTMLElement>("[data-erro]")!;
  const grade = agenda.querySelector<HTMLElement>("[data-dias]")!;
  const titulo = agenda.querySelector<HTMLElement>("[data-titulo-mes]")!;
  const tituloDia = agenda.querySelector<HTMLElement>("[data-titulo-dia]")!;
  const vazio = agenda.querySelector<HTMLElement>("[data-vazio]")!;
  const bairro = agenda.querySelector<HTMLSelectElement>("[data-bairro]");
  const aviso = agenda.querySelector<HTMLElement>("[data-aviso-artista]");

  const hoje = hojeNaCidade();
  const parametro = new URLSearchParams(location.search).get("artista");
  let artista = agenda.dataset.filtroArtista && parametro ? parametro : "";

  function diasQueCabem(): number {
    const cabem = Math.floor(grade.clientWidth / LARGURA_DIA_NA_FAIXA);
    return Math.min(MAXIMO_NA_FAIXA, Math.max(MINIMO_NA_FAIXA, cabem));
  }
  let diasNaFaixa = faixa ? diasQueCabem() : 0;

  const visivel = (item: HTMLElement) =>
    (artista === "" || item.dataset.artista === artista) && (!bairro?.value || item.dataset.itemBairro === bairro.value);

  /** Dia mostrado ao abrir: hoje, se tiver show; senão o próximo dia com show; senão hoje. */
  function diaInicial(): string {
    const dias = itens.filter(visivel).map((i) => i.dataset.dia!).sort();
    if (dias.includes(hoje)) return hoje;
    return dias.find((d) => d >= hoje) ?? hoje;
  }

  /** Primeiro dia do período mostrado para um dia: o mês dele, ou a faixa que começa em hoje e anda de diasNaFaixa em diasNaFaixa. */
  function inicioDoPeriodo(dia: string): string {
    if (!faixa) return inicioDoMes(dia);
    const distancia = Math.round((dataUTC(dia).getTime() - dataUTC(hoje).getTime()) / 86_400_000);
    return somarDias(hoje, Math.floor(distancia / diasNaFaixa) * diasNaFaixa);
  }
  const fimDoPeriodo = (inicio: string) => (faixa ? somarDias(inicio, diasNaFaixa - 1) : fimDoMes(inicio));
  const andar = (inicio: string, passos: number) => (faixa ? somarDias(inicio, passos * diasNaFaixa) : inicioDoMes(inicio, passos));

  let selecionado = diaInicial();
  let inicio = inicioDoPeriodo(selecionado);
  /** Meses (AAAA-MM) sendo buscados agora. */
  const buscando = new Set<string>();
  let falhou = false;

  async function buscarMes(chave: string): Promise<void> {
    buscando.add(chave);
    falhou = false;
    desenhar();
    const parametros = new URLSearchParams({ mes: chave });
    if (agenda.dataset.anunciante) parametros.set("anunciante", agenda.dataset.anunciante);
    if (agenda.dataset.semLugar) parametros.set("lugar", "0");
    try {
      const resposta = await fetch(`/agenda/mes?${parametros}`);
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const modelo = document.createElement("template");
      modelo.innerHTML = await resposta.text();
      const novos = [...modelo.content.querySelectorAll<HTMLElement>("li")];
      lista.append(...novos);
      itens.push(...novos);
      carregados.add(chave);
    } catch (e) {
      console.error("Agenda: falha ao buscar o mês", chave, e);
      falhou = true;
    } finally {
      buscando.delete(chave);
      desenhar();
    }
  }

  /** Mostra o período que começa em `novo` e busca os meses dele que ainda não vieram. */
  function irPara(novo: string): void {
    inicio = novo;
    const meses = new Set([novo.slice(0, 7), fimDoPeriodo(novo).slice(0, 7)]);
    const faltando = [...meses].filter((m) => !carregados.has(m) && !buscando.has(m));
    if (faltando.length === 0) desenhar();
    for (const mes of faltando) void buscarMes(mes);
  }

  function celula(iso: string, shows: number): HTMLElement {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.dataset.diaCalendario = iso;
    botao.setAttribute("aria-pressed", String(iso === selecionado));
    const dia = dataUTC(iso).getUTCDate();
    botao.setAttribute("aria-label", `${curta(iso)}${shows > 0 ? `, ${shows} ${shows === 1 ? "show" : "shows"}` : ""}`);
    botao.className = [
      "flex flex-col items-center justify-center rounded-xl text-sm font-bold transition",
      faixa ? "min-w-0 flex-1 py-2" : "aspect-square sm:aspect-auto sm:h-14",
      iso === selecionado ? "bg-azul-600 text-white" : shows > 0 ? "bg-azul-50 text-azul-900 hover:bg-azul-100" : "text-slate-400 hover:bg-slate-50",
      iso === hoje && iso !== selecionado ? "ring-2 ring-amarelo-400" : "",
    ].join(" ");
    if (faixa) {
      const semana = document.createElement("span");
      semana.className = "text-[0.65rem] uppercase";
      semana.textContent = iso === hoje ? "hoje" : SEMANA[dataUTC(iso).getUTCDay()];
      botao.append(semana);
    }
    const numero = document.createElement("span");
    numero.className = faixa ? "font-display text-lg leading-tight font-extrabold" : "";
    numero.textContent = String(dia);
    botao.append(numero);
    const marca = document.createElement("span");
    marca.className = `text-[0.6rem] leading-none ${iso === selecionado ? "text-white" : "text-vermelho-600"}`;
    marca.textContent = shows === 0 ? (faixa ? "—" : "") : shows === 1 ? "1 show" : `${shows} shows`;
    if (marca.textContent) botao.append(marca);
    botao.addEventListener("click", () => {
      selecionado = iso;
      desenhar();
    });
    return botao;
  }

  function desenhar(): void {
    const contagem = new Map<string, number>();
    for (const item of itens) if (visivel(item)) contagem.set(item.dataset.dia!, (contagem.get(item.dataset.dia!) ?? 0) + 1);

    const fim = fimDoPeriodo(inicio);
    titulo.textContent = faixa
      ? `${curta(inicio)} a ${curta(fim)}`
      : dataUTC(inicio).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    const celulas: HTMLElement[] = [];
    if (!faixa) for (let i = 0; i < dataUTC(inicio).getUTCDay(); i++) celulas.push(document.createElement("span"));
    for (let iso = inicio; iso <= fim; iso = somarDias(iso, 1)) celulas.push(celula(iso, contagem.get(iso) ?? 0));
    grade.replaceChildren(...celulas);

    tituloDia.textContent =
      selecionado === hoje
        ? "Hoje"
        : dataUTC(selecionado).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    const esperando = buscando.size > 0;
    const comErro = falhou && !carregados.has(selecionado.slice(0, 7));
    let algum = false;
    for (const item of itens) {
      item.hidden = item.dataset.dia !== selecionado || !visivel(item);
      if (!item.hidden) algum = true;
    }
    carregando.hidden = !esperando;
    erro.hidden = !comErro || esperando;
    vazio.hidden = algum || esperando || comErro;

    if (aviso) {
      aviso.hidden = artista === "";
      const nome = itens.find((i) => i.dataset.artista === artista)?.dataset.artistaNome ?? artista;
      aviso.querySelector<HTMLElement>("[data-nome-artista]")!.textContent = nome;
    }
  }

  agenda.querySelector("[data-mes-anterior]")?.addEventListener("click", () => irPara(andar(inicio, -1)));
  agenda.querySelector("[data-mes-seguinte]")?.addEventListener("click", () => irPara(andar(inicio, 1)));
  agenda.querySelector("[data-ir-hoje]")?.addEventListener("click", () => {
    selecionado = hoje;
    irPara(inicioDoPeriodo(hoje));
  });
  bairro?.addEventListener("change", desenhar);
  agenda.querySelector("[data-tirar-artista]")?.addEventListener("click", () => {
    artista = "";
    const url = new URL(location.href);
    url.searchParams.delete("artista");
    history.replaceState(null, "", url);
    desenhar();
  });

  if (faixa) {
    // Ao mudar a largura (girar o celular, redimensionar a janela), refaz a faixa
    // com os dias que cabem, mantendo o dia escolhido à vista.
    new ResizeObserver(() => {
      const novo = diasQueCabem();
      if (novo === diasNaFaixa) return;
      diasNaFaixa = novo;
      irPara(inicioDoPeriodo(selecionado));
    }).observe(grade);
  }

  irPara(inicio);
}
