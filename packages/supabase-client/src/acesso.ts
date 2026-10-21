// Entrada com e-mail e senha (Especificação Técnica, seção 6.2): limite por IP,
// bloqueio da conta depois de 5 senhas erradas seguidas e o Turnstile, que o
// próprio Supabase Auth confere. As contagens ficam nas funções da migration
// 20261021160000_limites_de_acesso.sql, executadas com a chave service_role.
import type { Resultado } from "@acheaqui/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const TENTATIVAS_POR_IP = 20;
const JANELA_IP_SEGUNDOS = 15 * 60;
const RECUPERACOES_POR_EMAIL = 3;
const JANELA_RECUPERACAO_SEGUNDOS = 60 * 60;

const ERRO_INTERNO = {
  ok: false,
  erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível entrar agora. Tente de novo em instantes." },
} as const;

export type ResultadoEntrada = Resultado<{ usuarioId: string }>;

function horario(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(data);
}

function mensagemBloqueio(fim: string): ResultadoEntrada {
  return {
    ok: false,
    erro: {
      codigo: "LIMITE_DE_REQUISICOES",
      mensagem: `Por segurança, a entrada nesta conta ficou bloqueada depois de 5 senhas erradas. Tente de novo às ${horario(new Date(fim))} ou crie uma nova senha.`,
    },
  };
}

/**
 * @param sessao cliente com os cookies da requisição: grava a sessão se der certo.
 * @param servico cliente com a chave service_role: limites e bloqueio.
 */
export async function entrar(
  sessao: SupabaseClient,
  servico: SupabaseClient,
  { email, senha, tokenRobo, ip }: { email: string; senha: string; tokenRobo: string; ip: string },
): Promise<ResultadoEntrada> {
  const limite = await servico.rpc("consumir_limite", {
    p_chave: `login-ip:${ip}`,
    p_limite: TENTATIVAS_POR_IP,
    p_janela_segundos: JANELA_IP_SEGUNDOS,
  });
  if (limite.error) {
    console.error("entrar: consumir_limite falhou", { codigo: limite.error.code, mensagem: limite.error.message });
    return ERRO_INTERNO;
  }
  if (limite.data === false) {
    return {
      ok: false,
      erro: { codigo: "LIMITE_DE_REQUISICOES", mensagem: "Muitas tentativas a partir desta conexão. Espere 15 minutos e tente de novo." },
    };
  }

  const bloqueio = await servico.rpc("login_bloqueado_ate", { p_email: email });
  if (bloqueio.error) {
    console.error("entrar: login_bloqueado_ate falhou", { codigo: bloqueio.error.code, mensagem: bloqueio.error.message });
    return ERRO_INTERNO;
  }
  if (bloqueio.data) return mensagemBloqueio(bloqueio.data as string);

  const { data, error } = await sessao.auth.signInWithPassword({ email, password: senha, options: { captchaToken: tokenRobo } });

  if (error) {
    switch (error.code) {
      case "invalid_credentials": {
        const falha = await servico.rpc("registrar_falha_login", { p_email: email });
        if (falha.error) {
          console.error("entrar: registrar_falha_login falhou", { codigo: falha.error.code, mensagem: falha.error.message });
          return ERRO_INTERNO;
        }
        if (falha.data) return mensagemBloqueio(falha.data as string);
        // A mesma mensagem para e-mail sem conta e senha errada: não revela quem tem conta.
        return { ok: false, erro: { codigo: "NAO_AUTENTICADO", mensagem: "E-mail ou senha incorretos." } };
      }
      case "email_not_confirmed":
        return {
          ok: false,
          erro: {
            codigo: "NAO_AUTENTICADO",
            mensagem: "Confirme o seu e-mail antes de entrar: toque no link que enviamos para ele.",
          },
        };
      case "captcha_failed":
        return {
          ok: false,
          erro: { codigo: "VERIFICACAO_ROBO_FALHOU", mensagem: "Não conseguimos confirmar que você não é um robô. Tente de novo." },
        };
      case "over_request_rate_limit":
        return {
          ok: false,
          erro: { codigo: "LIMITE_DE_REQUISICOES", mensagem: "Muitas tentativas. Espere alguns minutos e tente de novo." },
        };
      default:
        console.error("entrar: signInWithPassword falhou", { codigo: error.code, status: error.status, mensagem: error.message });
        return ERRO_INTERNO;
    }
  }

  const limpar = await servico.rpc("limpar_falhas_login", { p_email: email });
  if (limpar.error) {
    // A entrada já deu certo; as falhas antigas só deixam de ser zeradas.
    console.error("entrar: limpar_falhas_login falhou", { codigo: limpar.error.code, mensagem: limpar.error.message });
  }
  return { ok: true, dados: { usuarioId: data.user.id } };
}

/** 3 pedidos de nova senha por e-mail por hora (Especificação Técnica, seção 10.3). */
export async function limitarRecuperacaoSenha(servico: SupabaseClient, email: string): Promise<Resultado<null>> {
  const { data, error } = await servico.rpc("consumir_limite", {
    p_chave: `recuperar:${email}`,
    p_limite: RECUPERACOES_POR_EMAIL,
    p_janela_segundos: JANELA_RECUPERACAO_SEGUNDOS,
  });
  if (error) {
    console.error("limitarRecuperacaoSenha: consumir_limite falhou", { codigo: error.code, mensagem: error.message });
    return { ok: false, erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível enviar agora. Tente de novo em instantes." } };
  }
  if (data === false) {
    return {
      ok: false,
      erro: { codigo: "LIMITE_DE_REQUISICOES", mensagem: "Já enviamos 3 links para este e-mail na última hora. Confira a caixa de entrada e o spam." },
    };
  }
  return { ok: true, dados: null };
}

/** Registro de acesso guardado por 6 meses (Marco Civil da Internet, art. 15). */
export async function registrarAcesso(
  servico: SupabaseClient,
  registro: { usuarioId: string; ip: string; userAgent: string | null; acao: "login" | "logout" | "troca_de_senha" },
): Promise<void> {
  const { error } = await servico.from("registros_acesso").insert({
    usuario_id: registro.usuarioId,
    ip: registro.ip,
    user_agent: registro.userAgent?.slice(0, 500) ?? null,
    acao: registro.acao,
  });
  if (error) {
    // Não impede a entrada, mas precisa aparecer nos registros do Worker.
    console.error("registrarAcesso falhou", { acao: registro.acao, codigo: error.code, mensagem: error.message });
  }
}
