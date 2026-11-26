// Escolha do artista na programação (decisões de 26/11/2026): a pessoa digita o
// nome e vê os artistas cadastrados que combinam (artistasQueCombinam, em
// packages/domain). Sem artista com o mesmo nome, aparece "Usar só o nome" e,
// para a administração, "Cadastrar como novo artista", que abre a janela de
// cadastro sem sair da página (CadastroRapidoArtista.astro). O que foi escolhido
// vai nos campos escondidos "artista" (o artista cadastrado) e "artista_nome"
// (só o nome); o servidor confere tudo de novo.
import { artistaComOMesmoNome, artistasQueCombinam } from "@acheaqui/domain";

export interface ArtistaDaLista {
  id: string;
  nome: string;
}

type Opcao = { tipo: "artista"; artista: ArtistaDaLista } | { tipo: "so-nome"; nome: string } | { tipo: "cadastrar"; nome: string };

/** Evento que a janela de cadastro dispara no documento quando o artista novo é salvo. */
export const EVENTO_ARTISTA_CADASTRADO = "artista-cadastrado";
/** Evento que o campo dispara para pedir a janela de cadastro com o nome digitado. */
export const EVENTO_CADASTRAR_ARTISTA = "cadastrar-artista";

const MENSAGEM_SEM_ESCOLHA = "Escolha o artista na lista ou “Usar só o nome”.";
const MENSAGEM_SEM_ARTISTA = "Escolha o artista na lista.";

export function ligarEscolhaDeArtista(raiz: HTMLElement): void {
  const campo = raiz.querySelector<HTMLInputElement>("[data-busca-artista]");
  const lista = raiz.querySelector<HTMLUListElement>("[data-sugestoes-artista]");
  const campoId = raiz.querySelector<HTMLInputElement>("[data-artista-id]");
  const campoNome = raiz.querySelector<HTMLInputElement>("[data-artista-nome]");
  const situacao = raiz.querySelector<HTMLElement>("[data-situacao-artista]");
  if (!campo || !lista || !campoId || !campoNome || !situacao) return;

  const artistas: ArtistaDaLista[] = JSON.parse(raiz.querySelector("[data-artistas]")?.textContent || "[]");
  const permiteSoNome = raiz.dataset.soNome === "sim";
  const podeCadastrar = raiz.dataset.cadastrar === "sim";
  const textoSoNome = raiz.dataset.textoSoNome ?? "";
  let opcoes: Opcao[] = [];
  let ativa = -1;

  function mostrarSituacao(texto: string, erro = false): void {
    situacao!.textContent = texto;
    situacao!.hidden = texto === "";
    situacao!.classList.toggle("text-vermelho-700", erro);
    situacao!.classList.toggle("text-slate-600", !erro);
  }

  function fecharLista(): void {
    lista!.hidden = true;
    campo!.setAttribute("aria-expanded", "false");
    campo!.removeAttribute("aria-activedescendant");
    ativa = -1;
  }

  function marcarAtiva(indice: number): void {
    ativa = indice;
    for (const [i, item] of [...lista!.children].entries()) item.setAttribute("aria-selected", String(i === indice));
    const item = lista!.children[indice] as HTMLElement | undefined;
    if (item) {
      campo!.setAttribute("aria-activedescendant", item.id);
      item.scrollIntoView({ block: "nearest" });
    } else campo!.removeAttribute("aria-activedescendant");
  }

  function montarLista(): void {
    const digitado = campo!.value.trim().replace(/\s+/g, " ");
    const encontrados = artistasQueCombinam(artistas, digitado);
    opcoes = encontrados.map((artista) => ({ tipo: "artista", artista }));
    if (digitado.length >= 2 && !artistaComOMesmoNome(artistas, digitado)) {
      if (permiteSoNome) opcoes.push({ tipo: "so-nome", nome: digitado });
      if (podeCadastrar) opcoes.push({ tipo: "cadastrar", nome: digitado });
    }
    lista!.replaceChildren(
      ...opcoes.map((opcao, i) => {
        const item = document.createElement("li");
        item.id = `${lista!.id}-${i}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        item.className = "flex min-h-11 cursor-pointer items-center px-4 py-2 text-sm hover:bg-azul-50 aria-selected:bg-azul-50";
        if (opcao.tipo === "artista") {
          item.textContent = opcao.artista.nome;
          item.classList.add("font-bold", "text-azul-900");
        } else {
          item.textContent = opcao.tipo === "so-nome" ? `Usar só o nome “${opcao.nome}”` : `Cadastrar “${opcao.nome}” como novo artista`;
          item.classList.add("border-t", "border-slate-100", "font-semibold", "text-azul-600");
        }
        // mousedown, e não click: o clique tira o foco do campo antes e fecharia a lista.
        item.addEventListener("mousedown", (evento) => {
          evento.preventDefault();
          escolher(opcao);
        });
        return item;
      }),
    );
    const aberta = opcoes.length > 0;
    lista!.hidden = !aberta;
    campo!.setAttribute("aria-expanded", String(aberta));
    marcarAtiva(-1);
  }

  function escolher(opcao: Opcao): void {
    if (opcao.tipo === "cadastrar") {
      fecharLista();
      document.dispatchEvent(new CustomEvent(EVENTO_CADASTRAR_ARTISTA, { detail: { nome: opcao.nome, raiz } }));
      return;
    }
    if (opcao.tipo === "artista") {
      campo!.value = opcao.artista.nome;
      campoId!.value = opcao.artista.id;
      campoNome!.value = "";
      mostrarSituacao("Artista cadastrado no site.");
    } else {
      campo!.value = opcao.nome;
      campoId!.value = "";
      campoNome!.value = opcao.nome;
      mostrarSituacao(textoSoNome);
    }
    fecharLista();
  }

  campo.addEventListener("input", () => {
    campoId!.value = "";
    campoNome!.value = "";
    mostrarSituacao("");
    montarLista();
  });
  campo.addEventListener("focus", () => {
    if (!campoId!.value && !campoNome!.value && campo!.value.trim()) montarLista();
  });
  campo.addEventListener("blur", fecharLista);
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      if (lista!.hidden) montarLista();
      if (opcoes.length === 0) return;
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      marcarAtiva((ativa + passo + opcoes.length) % opcoes.length);
    } else if (evento.key === "Enter" && !lista!.hidden && ativa >= 0) {
      // Com uma opção marcada, o Enter escolhe em vez de enviar o formulário.
      evento.preventDefault();
      escolher(opcoes[ativa]!);
    } else if (evento.key === "Escape" && !lista!.hidden) {
      evento.preventDefault();
      fecharLista();
    }
  });

  // Nome digitado sem escolha: o nome igual ao de um cadastrado vira o artista; o resto pede a escolha.
  campo.form?.addEventListener("submit", (evento) => {
    const digitado = campo!.value.trim();
    if (!digitado || campoId!.value || campoNome!.value) return;
    const mesmo = artistaComOMesmoNome(artistas, digitado);
    if (mesmo) {
      escolher({ tipo: "artista", artista: mesmo });
      return;
    }
    evento.preventDefault();
    mostrarSituacao(permiteSoNome ? MENSAGEM_SEM_ESCOLHA : MENSAGEM_SEM_ARTISTA, true);
    campo!.focus();
    montarLista();
  });

  // Artista salvo pela janela de cadastro aberta por este campo: entra na lista e fica escolhido.
  document.addEventListener(EVENTO_ARTISTA_CADASTRADO, (evento) => {
    const { artista, raiz: origem } = (evento as CustomEvent<{ artista: ArtistaDaLista; raiz: HTMLElement }>).detail;
    if (origem !== raiz) return;
    artistas.push(artista);
    escolher({ tipo: "artista", artista });
  });
}

/** Dia escolhido por último na programação de cada evento, para continuar nele depois de "Acrescentar". */
export function lembrarDiaDaProgramacao(formulario: HTMLFormElement): void {
  const dia = formulario.querySelector<HTMLSelectElement>("select[name=dia]");
  const chave = `dia-programacao:${formulario.dataset.evento ?? ""}`;
  if (!dia) return;
  try {
    const guardado = sessionStorage.getItem(chave);
    if (guardado && [...dia.options].some((o) => o.value === guardado)) dia.value = guardado;
  } catch (erro) {
    // Sem acesso ao armazenamento (janela anônima, bloqueio): o dia começa no primeiro.
    console.warn("lembrarDiaDaProgramacao: armazenamento indisponível", erro);
  }
  formulario.addEventListener("submit", () => {
    try {
      sessionStorage.setItem(chave, dia.value);
    } catch (erro) {
      console.warn("lembrarDiaDaProgramacao: armazenamento indisponível", erro);
    }
  });
}

/**
 * Janela de cadastro rápido do artista (só a administração): recebe o nome do
 * campo que a abriu, avisa se já existe artista com nome parecido, salva pelo
 * endereço /admin/agenda/artistas/rapido e devolve o artista novo ao campo, sem
 * recarregar a página (o que já foi preenchido na programação continua).
 */
export function ligarCadastroRapido(dialogo: HTMLDialogElement, artistasIniciais: ArtistaDaLista[]): void {
  const formulario = dialogo.querySelector<HTMLFormElement>("form");
  const nome = formulario?.querySelector<HTMLInputElement>("input[name=nome]");
  const parecidos = dialogo.querySelector<HTMLElement>("[data-parecidos]");
  const erro = dialogo.querySelector<HTMLElement>("[data-erro-cadastro]");
  const botao = formulario?.querySelector<HTMLButtonElement>("button[type=submit]");
  if (!formulario || !nome || !parecidos || !erro || !botao) return;
  const textoBotao = botao.textContent ?? "";
  const artistas = [...artistasIniciais];
  let origem: HTMLElement | null = null;

  function mostrarParecidos(): void {
    const achados = artistasQueCombinam(artistas, nome!.value, 3);
    parecidos!.hidden = achados.length === 0;
    parecidos!.textContent = achados.length ? `Já cadastrado com nome parecido: ${achados.map((a) => a.nome).join(", ")}. Confira antes de cadastrar.` : "";
  }

  function ocupar(ocupado: boolean): void {
    dialogo.toggleAttribute("data-ocupado", ocupado);
    botao!.disabled = ocupado;
    botao!.textContent = ocupado ? "Cadastrando…" : textoBotao;
  }

  document.addEventListener(EVENTO_CADASTRAR_ARTISTA, (evento) => {
    const detalhe = (evento as CustomEvent<{ nome: string; raiz: HTMLElement }>).detail;
    origem = detalhe.raiz;
    formulario.reset();
    nome.value = detalhe.nome;
    erro.hidden = true;
    mostrarParecidos();
    dialogo.showModal();
  });
  nome.addEventListener("input", mostrarParecidos);

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (dialogo.hasAttribute("data-ocupado")) return;
    erro.hidden = true;
    ocupar(true);
    try {
      const resposta = await fetch("/admin/agenda/artistas/rapido", { method: "POST", body: new FormData(formulario) });
      const r = (await resposta.json()) as { ok: true; dados: ArtistaDaLista } | { ok: false; erro: { mensagem: string } };
      if (!r.ok) {
        erro.textContent = r.erro.mensagem;
        erro.hidden = false;
        return;
      }
      artistas.push(r.dados);
      ocupar(false);
      dialogo.close();
      document.dispatchEvent(new CustomEvent(EVENTO_ARTISTA_CADASTRADO, { detail: { artista: r.dados, raiz: origem } }));
    } catch (falha) {
      console.error("cadastro rápido do artista falhou", falha);
      erro.textContent = "Não foi possível cadastrar agora. Confira a internet e tente de novo.";
      erro.hidden = false;
    } finally {
      ocupar(false);
    }
  });
}
