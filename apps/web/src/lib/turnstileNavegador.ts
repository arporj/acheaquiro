// Turnstile no navegador para os modais do perfil (pedidos de perfil e
// denúncia). Carrega o script da Cloudflare uma vez só por página, mesmo com os
// dois modais no mesmo perfil, e desenha o quadro quando o modal abre.

interface Turnstile {
  render(alvo: HTMLElement, opcoes: Record<string, unknown>): string;
  reset(id: string): void;
}

const ENDERECO = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let carregando: Promise<Turnstile> | undefined;

function carregar(): Promise<Turnstile> {
  carregando ??= new Promise<Turnstile>((resolver, rejeitar) => {
    const pronto = () => {
      const turnstile = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (turnstile) resolver(turnstile);
      else rejeitar(new Error("Turnstile: o script carregou sem o objeto turnstile."));
    };
    const script = document.createElement("script");
    script.src = ENDERECO;
    script.async = true;
    script.addEventListener("load", pronto);
    script.addEventListener("error", () => {
      // Deixa tentar de novo na próxima abertura do modal.
      carregando = undefined;
      rejeitar(new Error("Turnstile: o script não carregou."));
    });
    document.head.append(script);
  });
  return carregando;
}

/**
 * Quadro do Turnstile numa caixa. `preparar` desenha na primeira vez e limpa
 * nas seguintes (o token vale uma vez só). `token` é o último recebido, ou "".
 */
export function criarTurnstile(caixa: HTMLElement, chave: string, contexto: string) {
  let widget: string | undefined;
  let token = "";

  return {
    token: () => token,
    async preparar(): Promise<void> {
      token = "";
      try {
        const turnstile = await carregar();
        if (widget) {
          turnstile.reset(widget);
          return;
        }
        widget = turnstile.render(caixa, {
          sitekey: chave,
          language: "pt-br",
          // O quadro normal tem 300 px fixos; em telas estreitas, o compacto cabe sem rolagem lateral.
          size: caixa.clientWidth < 300 ? "compact" : "normal",
          callback: (t: string) => (token = t),
          "expired-callback": () => (token = ""),
          "error-callback": () => {
            token = "";
            console.error(`${contexto}: o Turnstile deu erro.`);
          },
        });
      } catch (erro) {
        console.error(`${contexto}: o Turnstile não carregou.`, erro);
      }
    },
  };
}
