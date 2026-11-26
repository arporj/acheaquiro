// Envio da fila de avisos por e-mail (public.avisos_email) pelo Brevo (plano
// 2B, decisões Q1 a Q3 de 27/10/2026). Chamada a cada 15 minutos pelo pg_cron
// (interno.chamar_envio_de_avisos). Manda até 280 por dia: os outros 20 dos
// 300 do plano gratuito do Brevo ficam para os e-mails do login. Lembretes
// saem antes dos outros avisos; o que passar do teto fica para o dia seguinte.
// Chamar de novo não repete e-mail: cada aviso é reservado antes do envio.
// Segredos: BREVO_API_KEY (Edge Functions → Secrets) e a chave de serviço, que
// o Supabase entrega à função.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// Repetido em packages/domain/avisos.ts (TETO_AVISOS_POR_DIA), que a tela usa na previsão do aviso em massa: mudou um, muda o outro.
const TETO_POR_DIA = 280;
const POR_CHAMADA = 40;
const MAXIMO_TENTATIVAS = 5;
const REMETENTE = { name: "Ache Aqui RO", email: "nao-responda@acheaquiro.com.br" };
const SITE = "https://acheaquiro.com.br";
/** Endereço da produção: até 26/11/2026, acheaquiro.com.br mostra só o "em breve"; depois, prod. redireciona. */
const PRODUCAO = "https://prod.acheaquiro.com.br";
/** WhatsApp da equipe: o mesmo de WHATSAPP_EQUIPE em apps/web/src/lib/contato.ts. */
const WHATSAPP_EQUIPE = "5521988520666";

interface Aviso {
  id: string;
  tipo:
    | "lembrete_7_dias"
    | "lembrete_vencimento"
    | "plano_vencido"
    | "aviso_preco"
    | "escala_fundador"
    | "proposta"
    | "denuncia"
    | "pagamento_antes_do_aceite"
    | "extra_lembrete_7_dias"
    | "extra_lembrete_vencimento"
    | "extra_vencido"
    | "termos_novos"
    | "privacidade_nova"
    | "conta_excluida"
    | "exclusao_agendada";
  para: string;
  tentativas: number;
  dados: {
    nome?: string;
    tipo?: "profissional" | "comercio";
    plano?: string;
    periodicidade?: "mensal" | "anual";
    venceEm?: string;
    fundador?: boolean;
    eraFundador?: boolean;
    /** Aviso de novo preço: o valor que este assinante vai pagar e a partir de qual vencimento. */
    valorNovoCentavos?: number;
    aPartirDe?: string;
    /** Mudança da escala do desconto de Fundador, para os administradores. */
    antes?: string;
    depois?: string;
    documentos?: string[];
    /** Proposta do representante: quem fez, o plano e até quando vale. */
    propostaId?: string;
    representante?: string;
    planoNovo?: string;
    expiraEm?: string;
    /** Termos novos (item 15 dos Termos): a versão e o dia em que passa a valer. */
    versao?: string;
    vigenteDesde?: string;
    /** Resumo do que mudou na versão, sem o ponto final (desde a versão 3 dos Termos). */
    mudancas?: string;
    /** Exclusão agendada da conta: o dia em que ela será excluída. */
    excluirEm?: string;
    /** Denúncia de perfil, para os administradores: o perfil e o motivo (sem o texto de quem denunciou). */
    slug?: string;
    motivo?: string;
    /** Pagamento antes do aceite (17/11/2026): valor, dia, início da validade e último dia para desistir. */
    valorCentavos?: number;
    pagoEm?: string;
    periodoInicio?: string;
    desistirAte?: string;
    /** Plano vencido de quem pagou e ainda não foi aprovado. */
    antesDaAprovacao?: boolean;
    /** Extras que vencem (ou venceram) no dia (decisões B3 e E2 de 17/11/2026). */
    extras?: { nome: string; periodicidade: "mensal" | "anual" }[];
  };
}

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const data = (iso: string | undefined) => (iso ? iso.split("-").reverse().join("/") : "");
const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const reais = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
const linkEquipe = (assunto: string) =>
  `https://wa.me/${WHATSAPP_EQUIPE}?text=${encodeURIComponent(`Olá! Vim pelo site do Ache Aqui RO. ${assunto}.`)}`;

/** Assunto e parágrafos de cada aviso. */
function montar(
  aviso: Aviso,
  tolerancia: number,
): { assunto: string; paragrafos: string[]; botao: { texto: string; link: string }; rodape?: string } {
  const d = aviso.dados;
  const plano = `${d.plano ?? "seu plano"}${d.periodicidade ? ` (${d.periodicidade})` : ""}`;
  const limite = d.venceEm ? data(somarDias(d.venceEm, tolerancia)) : "";
  const efeito =
    d.tipo === "comercio" ? "o seu comércio passa para o plano Gratuito" : "o seu perfil sai do ar, sem ser apagado, até o pagamento";
  const pagar = { texto: "Pagar pelo WhatsApp", link: linkEquipe("Quero renovar o meu plano") };
  const fundador = d.fundador
    ? `Como Fundador, a renovação é anual e precisa ser paga até ${limite} para você manter o selo e o desconto.`
    : "";

  if (aviso.tipo === "extra_lembrete_7_dias" || aviso.tipo === "extra_lembrete_vencimento" || aviso.tipo === "extra_vencido") {
    const extras = (d.extras ?? []).map((e) => `${e.nome} (${e.periodicidade})`);
    const lista = extras.length > 1 ? `os extras ${extras.slice(0, -1).join(", ")} e ${extras.at(-1)}` : `o extra ${extras[0] ?? ""}`;
    const renovar = { texto: "Renovar pelo WhatsApp", link: linkEquipe("Quero renovar o meu extra") };
    if (aviso.tipo === "extra_vencido") {
      return {
        assunto: "Um extra do seu anúncio no Ache Aqui RO acabou",
        paragrafos: [
          `${lista[0]!.toUpperCase()}${lista.slice(1)} de ${d.nome} venceu em ${data(d.venceEm)} e não foi renovado. Por isso, ele saiu do seu anúncio.`,
          "O seu plano continua igual. Para voltar a ter o extra, fale com a equipe pelo WhatsApp e pague por Pix ou cartão.",
        ],
        botao: { texto: "Falar com a equipe", link: linkEquipe("Quero voltar a ter o meu extra") },
      };
    }
    return {
      assunto: aviso.tipo === "extra_lembrete_vencimento" ? "Um extra do seu anúncio vence hoje" : `Um extra do seu anúncio vence em ${data(d.venceEm)}`,
      paragrafos: [
        `${lista[0]!.toUpperCase()}${lista.slice(1)} de ${d.nome} vence ${aviso.tipo === "extra_lembrete_vencimento" ? "hoje, " : "em "}${data(d.venceEm)}.`,
        `Para continuar com ele, renove até ${limite}, por Pix ou cartão: é só falar com a equipe pelo WhatsApp. Depois disso, o extra sai do seu anúncio, e o seu plano continua igual.`,
      ],
      botao: renovar,
    };
  }
  if (aviso.tipo === "pagamento_antes_do_aceite") {
    return {
      assunto: "Recebemos o seu pagamento no Ache Aqui RO",
      paragrafos: [
        `Recebemos em ${data(d.pagoEm)} o pagamento de ${reais(d.valorCentavos ?? 0)} do plano ${plano} de ${d.nome}.`,
        "O seu anúncio só aparece no site depois que você conferir o cadastro e aceitar os Termos de Uso e a Política de Privacidade. Use o link do convite que enviamos para este e-mail, ou entre na sua conta pelo botão abaixo.",
        `A validade do plano conta a partir de ${data(d.periodoInicio)}, mesmo que o aceite fique para depois.`,
        `Se quiser desistir, você pode pedir o dinheiro de volta até ${data(d.desistirAte)}, pelo WhatsApp da equipe.`,
        "Precisa de ajuda para conferir e aceitar? Fale com a equipe pelo WhatsApp.",
      ],
      botao: { texto: "Conferir e aceitar", link: `${PRODUCAO}/anunciante` },
    };
  }
  if (aviso.tipo === "proposta") {
    return {
      assunto: `Proposta do Ache Aqui RO para ${d.nome ?? "o seu perfil"}`,
      paragrafos: [
        `${d.representante ?? "Um representante"}, do Ache Aqui RO, preparou uma proposta do plano ${d.planoNovo ?? ""} para ${d.nome ?? "o seu perfil"}.`,
        `Para ver os valores e aceitar, entre na sua conta pelo botão abaixo. A proposta vale até ${data(d.expiraEm)}, para aceitar e pagar.`,
        "Se não reconhece este pedido, é só não aceitar: nada muda no seu plano.",
      ],
      botao: { texto: "Ver a proposta", link: `${PRODUCAO}/anunciante/proposta/${d.propostaId ?? ""}` },
    };
  }
  if (aviso.tipo === "termos_novos") {
    return {
      assunto: "Os Termos de Uso do Ache Aqui RO mudaram",
      paragrafos: [
        `${d.nome ? `Olá, ${d.nome}. ` : ""}A versão ${d.versao ?? ""} dos Termos de Uso do Ache Aqui RO vale a partir de ${data(d.vigenteDesde)}.`,
        // Cada versão manda o resumo das mudanças nos dados; o texto fixo é o da versão 2, que saiu antes disso.
        `O que mudou: ${
          d.mudancas ??
          "o site passa a ter organizadores de eventos da Agenda, com uma conta só para anunciar e organizar eventos (itens 1, 2, 4, 13 e 15); as regras dos eventos na Agenda (novo item 6.5); e a devolução do evento avulso, que vale até 7 dias depois do pagamento e até a véspera do primeiro dia do evento (item 7.6)"
        }. O resto continua igual.`,
        "No próximo acesso à sua área, o site pede o aceite da versão nova.",
      ],
      botao: { texto: "Ler os Termos de Uso", link: `${PRODUCAO}/termos/v${d.versao ?? ""}` },
      rodape: "Você recebe este aviso porque tem conta no Ache Aqui RO e aceitou os Termos de Uso.",
    };
  }
  if (aviso.tipo === "conta_excluida") {
    return {
      assunto: "Sua conta no Ache Aqui RO foi excluída",
      paragrafos: [
        `${d.nome ? `Olá, ${d.nome}. ` : ""}A sua conta no Ache Aqui RO foi excluída, como você pediu.`,
        "Saíram do site o seu anúncio, as fotos, os contatos e os eventos. Se você já tinha feito algum pagamento, guardamos só o registro dele (nome, plano, valores e datas) pelo prazo da lei fiscal, como diz a Política de Privacidade.",
        "Se não foi você que pediu, fale com a equipe pelo WhatsApp.",
      ],
      botao: { texto: "Falar com a equipe", link: `https://wa.me/${WHATSAPP_EQUIPE}` },
      rodape: "Você recebe este aviso porque a sua conta no Ache Aqui RO foi excluída.",
    };
  }
  if (aviso.tipo === "exclusao_agendada") {
    return {
      assunto: "A exclusão da sua conta no Ache Aqui RO está agendada",
      paragrafos: [
        `${d.nome ? `Olá, ${d.nome}. ` : ""}A sua conta no Ache Aqui RO será excluída em ${data(d.excluirEm)}, quando termina o período que você já pagou.`,
        "Até lá, o seu anúncio continua no site, e você não recebe lembretes de renovação. Se mudar de ideia, é só entrar na sua área e desistir da exclusão.",
      ],
      botao: { texto: "Entrar na minha área", link: `${PRODUCAO}/anunciante/excluir` },
      rodape: "Você recebe este aviso porque pediu a exclusão da sua conta no Ache Aqui RO.",
    };
  }
  if (aviso.tipo === "privacidade_nova") {
    return {
      assunto: "A Política de Privacidade do Ache Aqui RO mudou",
      paragrafos: [
        `${d.nome ? `Olá, ${d.nome}. ` : ""}A versão ${d.versao ?? ""} da Política de Privacidade do Ache Aqui RO vale a partir de ${data(d.vigenteDesde)}.`,
        "O que mudou: a Política passa a explicar os dados dos comércios importados da Receita Federal e dos pedidos sobre esses perfis, o histórico de atendimento, os pagamentos no cartão e o que os representantes veem, e os dados dos eventos da Agenda: organizadores, artistas e barracas. O tratamento dos seus dados de anunciante continua o mesmo.",
        "No próximo acesso à sua área, o site pede o aceite da versão nova.",
      ],
      botao: { texto: "Ler a Política de Privacidade", link: `${PRODUCAO}/privacidade/v${d.versao ?? ""}` },
      rodape: "Você recebe este aviso porque tem conta no Ache Aqui RO e aceitou a Política de Privacidade.",
    };
  }
  if (aviso.tipo === "denuncia") {
    return {
      assunto: `Nova denúncia: ${d.nome ?? "perfil"}`,
      paragrafos: [
        `O perfil ${d.nome ?? ""} recebeu uma denúncia hoje, pelo motivo "${d.motivo ?? "não informado"}".`,
        "Novas denúncias deste perfil hoje entram direto na tela, sem outro e-mail.",
      ],
      botao: { texto: "Ver as denúncias", link: `${PRODUCAO}/admin/denuncias` },
      rodape: "Você recebe este aviso porque é administrador do Ache Aqui RO.",
    };
  }
  if (aviso.tipo === "escala_fundador") {
    return {
      assunto: "Desconto de Fundador mudou: documentos a atualizar",
      paragrafos: [
        `A escala do desconto de Fundador mudou${d.antes ? ` de "${d.antes}"` : ""} para "${d.depois ?? ""}".`,
        "As páginas do site já mostram a escala nova. Estes textos fixos não mudam sozinhos e precisam ser atualizados:",
        ...(d.documentos ?? []).map((doc) => `• ${doc}`),
      ],
      botao: { texto: "Abrir o catálogo", link: `${PRODUCAO}/admin/catalogo` },
      rodape: "Você recebe este aviso porque é administrador do Ache Aqui RO.",
    };
  }
  if (aviso.tipo === "aviso_preco") {
    const periodo = d.periodicidade === "anual" ? "por ano" : "por mês";
    return {
      assunto: "O valor do seu plano no Ache Aqui RO vai mudar",
      paragrafos: [
        `A partir do vencimento de ${data(d.aPartirDe)}, o plano ${plano} de ${d.nome} passa a custar ${reais(d.valorNovoCentavos ?? 0)} ${periodo}${d.fundador ? ", já com o seu desconto de Fundador" : ""}.`,
        "Até lá, nada muda: os pagamentos que vencerem antes dessa data continuam com o valor de hoje.",
        "Ficou com alguma dúvida? Fale com a equipe pelo WhatsApp.",
      ],
      botao: { texto: "Falar com a equipe", link: linkEquipe("Recebi o aviso do novo valor do meu plano") },
    };
  }
  if (aviso.tipo === "lembrete_7_dias") {
    return {
      assunto: `O seu plano no Ache Aqui RO vence em ${data(d.venceEm)}`,
      paragrafos: [
        `O plano ${plano} de ${d.nome} vence em ${data(d.venceEm)}.`,
        "Para continuar aparecendo como hoje, renove até o vencimento, por Pix ou cartão: é só falar com a equipe pelo WhatsApp.",
        fundador,
      ],
      botao: pagar,
    };
  }
  if (aviso.tipo === "lembrete_vencimento") {
    return {
      assunto: "O seu plano no Ache Aqui RO vence hoje",
      paragrafos: [
        `O plano ${plano} de ${d.nome} vence hoje, ${data(d.venceEm)}.`,
        `Você tem até ${limite} para pagar. Depois disso, ${efeito}.`,
        fundador,
      ],
      botao: pagar,
    };
  }
  if (d.antesDaAprovacao) {
    return {
      assunto: "O seu plano no Ache Aqui RO venceu",
      paragrafos: [
        `O plano ${plano} de ${d.nome} venceu em ${data(d.venceEm)} e não foi renovado, antes de o cadastro ser aceito e aprovado.`,
        d.tipo === "comercio"
          ? "Quando o cadastro for aprovado, o seu comércio entra no plano Gratuito."
          : "Quando o cadastro for aprovado, o perfil só vai para o ar com um novo pagamento.",
        d.eraFundador ? "Com isso, você também deixou de ser Fundador." : "",
        "Para voltar ao plano ou para ajuda com o cadastro, fale com a equipe pelo WhatsApp.",
      ],
      botao: { texto: "Falar com a equipe", link: linkEquipe("Quero voltar ao meu plano") },
    };
  }
  return {
    assunto: d.tipo === "comercio" ? "O seu comércio passou para o plano Gratuito" : "O seu perfil saiu do ar no Ache Aqui RO",
    paragrafos: [
      `O plano ${plano} de ${d.nome} venceu em ${data(d.venceEm)} e não foi renovado. Por isso, ${efeito}.`,
      d.eraFundador ? "Com isso, você também deixou de ser Fundador." : "",
      "Para voltar ao plano, fale com a equipe pelo WhatsApp e pague por Pix ou cartão.",
    ],
    botao: { texto: "Falar com a equipe", link: linkEquipe("Quero voltar ao meu plano") },
  };
}

function html(paragrafos: string[], botao: { texto: string; link: string }, rodape?: string): string {
  const corpo = paragrafos
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1e293b">${escapar(p)}</p>`)
    .join("");
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border-radius:16px;padding:24px">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#0b3a8a">Ache Aqui RO</p>
${corpo}
<p style="margin:24px 0 0"><a href="${botao.link}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">${escapar(botao.texto)}</a></p>
</div>
<p style="margin:16px 0 0;font-size:12px;color:#64748b">${rodape ? escapar(rodape) : `Você recebe este aviso porque anuncia no Ache Aqui RO (<a href="${SITE}" style="color:#64748b">acheaquiro.com.br</a>).`} Este endereço não recebe respostas.</p>
</div></body></html>`;
}

Deno.serve(async () => {
  const chave = Deno.env.get("BREVO_API_KEY");
  if (!chave) {
    console.error("enviar-avisos: BREVO_API_KEY não configurada");
    return Response.json({ erro: "sem chave do Brevo" }, { status: 500 });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Teto do dia em Rio das Ostras (UTC-3): o dia começa às 03:00 UTC.
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { count: enviadosHoje, error: erroContagem } = await supabase
    .from("avisos_email")
    .select("id", { count: "exact", head: true })
    .eq("situacao", "enviado")
    .gte("enviado_em", `${hoje}T03:00:00Z`);
  if (erroContagem) {
    console.error("enviar-avisos: contagem falhou", { mensagem: erroContagem.message });
    return Response.json({ erro: "contagem" }, { status: 500 });
  }
  const restante = Math.min(POR_CHAMADA, TETO_POR_DIA - (enviadosHoje ?? 0));
  if (restante <= 0) return Response.json({ enviados: 0, motivo: "teto do dia" });

  const [{ data: fila, error: erroFila }, { data: config }] = await Promise.all([
    supabase.from("avisos_email").select("id, tipo, para, tentativas, dados").eq("situacao", "pendente").order("prioridade").order("criado_em").limit(restante),
    supabase.from("configuracoes").select("valor").eq("chave", "tolerancia_vencimento_dias").limit(1).maybeSingle(),
  ]);
  if (erroFila) {
    console.error("enviar-avisos: leitura da fila falhou", { mensagem: erroFila.message });
    return Response.json({ erro: "fila" }, { status: 500 });
  }
  const tolerancia = Number(config?.valor ?? 7);

  let enviados = 0;
  let falhas = 0;
  for (const aviso of (fila ?? []) as Aviso[]) {
    // Reserva: outra chamada ao mesmo tempo não manda o mesmo aviso.
    const tentativa = aviso.tentativas + 1;
    const { data: reservado } = await supabase
      .from("avisos_email")
      .update({ tentativas: tentativa })
      .eq("id", aviso.id)
      .eq("situacao", "pendente")
      .eq("tentativas", aviso.tentativas)
      .select("id");
    if (!reservado?.length) continue;

    const { assunto, paragrafos, botao, rodape } = montar(aviso, tolerancia);
    const resposta = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": chave, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: REMETENTE,
        to: [{ email: aviso.para }],
        subject: assunto,
        htmlContent: html(paragrafos, botao, rodape),
        textContent: [...paragrafos.filter(Boolean), `${botao.texto}: ${botao.link}`].join("\n\n"),
        tags: ["aviso-vencimento"],
      }),
    });
    if (resposta.ok) {
      enviados++;
      await supabase.from("avisos_email").update({ situacao: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("id", aviso.id);
    } else {
      falhas++;
      // Só o código da resposta: o corpo pode repetir o e-mail do anunciante.
      const erro = `Brevo respondeu ${resposta.status}`;
      console.error("enviar-avisos: envio falhou", { aviso: aviso.id, status: resposta.status });
      await supabase
        .from("avisos_email")
        .update({ erro, situacao: tentativa >= MAXIMO_TENTATIVAS ? "falhou" : "pendente" })
        .eq("id", aviso.id);
    }
  }
  return Response.json({ enviados, falhas });
});
