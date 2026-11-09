// Total de visitas dos sites, lido da Cloudflare Web Analytics (decisão de
// 07/11/2026). O token só lê estatísticas e fica como segredo do Worker de
// produção; os outros sites buscam o resultado no endereço dele. A Cloudflare
// guarda cerca de 6 meses e devolve no máximo 93 dias por consulta: por isso, duas
// janelas. Dados mais antigos que isso saem da conta.
import { env } from "cloudflare:workers";

/** Conta e site na Cloudflare (não são segredo). */
const CONTA_CLOUDFLARE = "cd8e8e7488aedefca9ee0ea9af58e349";
const SITE_WEB_ANALYTICS = "a9faa9feffc240dfba4daf60639c56be";
const DIAS_POR_JANELA = 90;

const CONSULTA = `query($conta: String!, $site: String!, $a: Time!, $b: Time!, $c: Time!) {
  viewer {
    accounts(filter: { accountTag: $conta }) {
      recente: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $site, datetime_geq: $b, datetime_lt: $c }) { sum { visits } }
      antiga: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $site, datetime_geq: $a, datetime_lt: $b }) { sum { visits } }
    }
  }
}`;

interface RespostaGraphQL {
  data?: {
    viewer?: {
      accounts?: { recente?: { sum: { visits: number } }[]; antiga?: { sum: { visits: number } }[] }[];
    };
  } | null;
  errors?: { message: string }[] | null;
}

/** Total das duas janelas, ou nulo sem o token ou quando a Cloudflare falha (o motivo vai para o registro). */
export async function totalDeVisitas(agora = new Date()): Promise<number | null> {
  // Sem espaço nem quebra de linha nas pontas: colado assim no painel, o valor
  // derruba o cabeçalho da requisição ("Invalid header value").
  const token = env.CLOUDFLARE_ANALYTICS_TOKEN?.trim();
  if (!token) {
    console.error("totalDeVisitas: CLOUDFLARE_ANALYTICS_TOKEN não definido neste Worker.");
    return null;
  }
  const antes = (dias: number) => new Date(agora.getTime() - dias * 86_400_000).toISOString();
  let resposta: Response;
  try {
    resposta = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: CONSULTA,
        variables: { conta: CONTA_CLOUDFLARE, site: SITE_WEB_ANALYTICS, a: antes(DIAS_POR_JANELA * 2), b: antes(DIAS_POR_JANELA), c: agora.toISOString() },
      }),
    });
  } catch (erro) {
    console.error("totalDeVisitas: sem resposta da Cloudflare", { erro: String(erro) });
    return null;
  }
  if (!resposta.ok) {
    console.error("totalDeVisitas: a Cloudflare recusou", { status: resposta.status });
    return null;
  }
  const corpo = (await resposta.json()) as RespostaGraphQL;
  const conta = corpo.data?.viewer?.accounts?.[0];
  if (corpo.errors?.length || !conta) {
    console.error("totalDeVisitas: resposta sem dados", { erros: corpo.errors?.map((e) => e.message) });
    return null;
  }
  return (conta.recente?.[0]?.sum.visits ?? 0) + (conta.antiga?.[0]?.sum.visits ?? 0);
}
