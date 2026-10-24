// Área do representante (item 4.12; decisões de 23 e 24/10/2026): termo de
// confidencialidade, cadastro próprio (link, código e chave Pix) e histórico
// de atendimento. Tudo usa a sessão do representante: o RLS do banco só o
// trata como representante com a segunda etapa feita e o termo aceito
// (interno.meu_representante_id, migration 20261024100100).
import type { Resultado } from "@acheaqui/types";
import { esquemaAtendimento, esquemaChavePix, esquemaEmail, mensagensPorCampo, type TipoChavePix } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Situacao } from "./anunciantesAdmin";
import { DOCUMENTOS } from "./documentosLegais";
import { umSo } from "./importacao";
import { clienteServico } from "./sessao";
import { paraSlug } from "./texto";

type CodigoFalha = "DADOS_INVALIDOS" | "CONFLITO" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string; campos?: Record<string, string> } };
const falha = (codigo: CodigoFalha, mensagem: string, campos?: Record<string, string>): Falha => ({ ok: false, erro: { codigo, mensagem, campos } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");

/** Mensagem das travas do banco (P0001) pode ir para a tela; o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

// ---------------------------------------------------------------------------
// Termo de confidencialidade
// ---------------------------------------------------------------------------

export async function termoAceito(supabase: SupabaseClient, usuarioId: string): Promise<Resultado<boolean>> {
  const { data, error } = await supabase
    .from("aceites_documentos")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("documento", "confidencialidade")
    .eq("versao", DOCUMENTOS.confidencialidade.vigente)
    .limit(1);
  if (error) return mensagemDoBanco(error, "termoAceito");
  return { ok: true, dados: data.length > 0 };
}

/** Grava o aceite da versão em vigor, com a data (sem o IP: a especificação pede só data e versão). */
export async function aceitarTermo(supabase: SupabaseClient, usuarioId: string): Promise<Resultado<null>> {
  const ja = await termoAceito(supabase, usuarioId);
  if (!ja.ok) return ja;
  if (ja.dados) return { ok: true, dados: null };
  const { error } = await supabase
    .from("aceites_documentos")
    .insert({ usuario_id: usuarioId, documento: "confidencialidade", versao: DOCUMENTOS.confidencialidade.vigente });
  return error ? mensagemDoBanco(error, "aceitarTermo") : { ok: true, dados: null };
}

// ---------------------------------------------------------------------------
// Cadastro do representante
// ---------------------------------------------------------------------------

export interface MeuCadastro {
  id: string;
  nome: string;
  codigo: string;
  chavePix: string | null;
  recebeComissao: boolean;
}

export async function lerMeuCadastro(supabase: SupabaseClient, usuarioId: string): Promise<Resultado<MeuCadastro>> {
  const [rep, perfil] = await Promise.all([
    supabase.from("representantes").select("id, codigo, chave_pix, recebe_comissao, ativo").eq("usuario_id", usuarioId).maybeSingle(),
    supabase.from("perfis_usuario").select("nome").eq("usuario_id", usuarioId).maybeSingle(),
  ]);
  if (rep.error) return mensagemDoBanco(rep.error, "lerMeuCadastro");
  if (perfil.error) return mensagemDoBanco(perfil.error, "lerMeuCadastro: perfil");
  if (!rep.data || !rep.data.ativo) return falha("NAO_ENCONTRADO", "Seu cadastro de representante não está ativo. Fale com a equipe.");
  return {
    ok: true,
    dados: {
      id: rep.data.id,
      nome: perfil.data?.nome ?? "",
      codigo: rep.data.codigo,
      chavePix: rep.data.chave_pix,
      recebeComissao: rep.data.recebe_comissao,
    },
  };
}

export const ROTULO_TIPO_PIX: Record<TipoChavePix, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Celular",
  aleatoria: "Chave aleatória",
};

export async function salvarChavePix(supabase: SupabaseClient, valor: string): Promise<Resultado<null>> {
  const dados = esquemaChavePix.safeParse(valor);
  if (!dados.success) {
    const campos = mensagensPorCampo(dados.error);
    return falha("DADOS_INVALIDOS", Object.values(campos)[0] ?? "Chave Pix inválida.", { chave: Object.values(campos)[0] ?? "" });
  }
  const { error } = await supabase.rpc("salvar_minha_chave_pix", { p_chave: dados.data.chave });
  return error ? mensagemDoBanco(error, "salvarChavePix") : { ok: true, dados: null };
}

// ---------------------------------------------------------------------------
// Histórico de atendimento
// ---------------------------------------------------------------------------

export interface RegistroAtendimento {
  id: string;
  dia: string;
  observacao: string;
  autor: string;
}

export interface UltimoContato {
  autor: string;
  dia: string;
}

export async function registrarAtendimento(
  supabase: SupabaseClient,
  entrada: { anuncianteId: string; dia: string; observacao: string },
): Promise<Resultado<null>> {
  const dados = esquemaAtendimento.safeParse(entrada);
  if (!dados.success) {
    const campos = mensagensPorCampo(dados.error);
    return falha("DADOS_INVALIDOS", Object.values(campos)[0] ?? "Confira os dados do contato.", campos);
  }
  const { data: anunciante, error: erroAnunciante } = await supabase
    .from("anunciantes")
    .select("cidade_id")
    .eq("id", dados.data.anuncianteId)
    .maybeSingle();
  if (erroAnunciante) return mensagemDoBanco(erroAnunciante, "registrarAtendimento: anunciante");
  if (!anunciante) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const { error } = await supabase.from("atendimentos").insert({
    anunciante_id: dados.data.anuncianteId,
    cidade_id: anunciante.cidade_id,
    dia: dados.data.dia,
    observacao: dados.data.observacao,
  });
  if (error?.code === "42501") return falha("SEM_PERMISSAO", "Você não pode registrar contato com este anunciante.");
  return error ? mensagemDoBanco(error, "registrarAtendimento") : { ok: true, dados: null };
}

/** Registros de um anunciante que a sessão pode ler (o representante: só os dele; a equipe: todos). */
export async function listarAtendimentos(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<RegistroAtendimento[]>> {
  const { data, error } = await supabase
    .from("atendimentos")
    .select("id, dia, observacao, autor_id, criado_em")
    .eq("anunciante_id", anuncianteId)
    .order("dia", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error) return mensagemDoBanco(error, "listarAtendimentos");
  const autores = [...new Set(data.map((r) => r.autor_id as string))];
  const nomes = new Map<string, string>();
  if (autores.length) {
    const { data: perfis, error: erroPerfis } = await supabase.from("perfis_usuario").select("usuario_id, nome").in("usuario_id", autores);
    // Sem os nomes, a lista sai com "Equipe" no lugar: o registro do contato importa mais.
    if (erroPerfis) console.error("listarAtendimentos: nomes falharam", { codigo: erroPerfis.code, mensagem: erroPerfis.message });
    for (const p of perfis ?? []) nomes.set(p.usuario_id, p.nome);
  }
  return {
    ok: true,
    dados: data.map((r) => ({ id: r.id, dia: r.dia, observacao: r.observacao, autor: nomes.get(r.autor_id) || "Equipe" })),
  };
}

/** Último contato de cada anunciante da lista: só o nome de quem fez e o dia (decisão Y1, 24/10/2026). */
export async function ultimosContatos(supabase: SupabaseClient, anuncianteIds: string[]): Promise<Resultado<Map<string, UltimoContato>>> {
  const mapa = new Map<string, UltimoContato>();
  if (!anuncianteIds.length) return { ok: true, dados: mapa };
  const { data, error } = await supabase.rpc("ultimos_contatos", { p_anunciantes: anuncianteIds });
  if (error) return mensagemDoBanco(error, "ultimosContatos");
  for (const linha of data as { anunciante_id: string; autor_nome: string; dia: string }[]) {
    mapa.set(linha.anunciante_id, { autor: linha.autor_nome, dia: linha.dia });
  }
  return { ok: true, dados: mapa };
}

// ---------------------------------------------------------------------------
// Meus anunciantes
// ---------------------------------------------------------------------------

export interface MeuAnunciante {
  id: string;
  nome: string;
  slug: string;
  tipo: "profissional" | "comercio";
  status: Situacao;
  origem: "cadastro" | "receita";
  criado_em: string;
  plano: { nome: string } | null;
  planoEscolhido: { nome: string } | null;
}

/** Os anunciantes que o representante trouxe (o RLS também mostra os publicados de todos; o filtro fica aqui). */
export async function listarMeusAnunciantes(supabase: SupabaseClient, representanteId: string): Promise<Resultado<MeuAnunciante[]>> {
  const { data, error } = await supabase
    .from("anunciantes")
    .select(
      "id, nome, slug, tipo, status, origem, criado_em, plano:planos!anunciantes_plano_id_fkey(nome), planoEscolhido:planos!anunciantes_plano_escolhido_id_fkey(nome)",
    )
    .eq("representante_id", representanteId)
    .order("criado_em", { ascending: false })
    .limit(500);
  if (error) return mensagemDoBanco(error, "listarMeusAnunciantes");
  return { ok: true, dados: data as unknown as MeuAnunciante[] };
}

// ---------------------------------------------------------------------------
// Prospecção: comércios importados da Receita ainda sem dono
// ---------------------------------------------------------------------------

export const POR_PAGINA_PROSPECCAO = 30;

export interface FiltroProspeccao {
  busca: string;
  categoriaId: string;
  bairroId: string;
  pagina: number;
}

export interface ComercioProspeccao {
  id: string;
  nome: string;
  slug: string;
  categoria: string;
  bairro: string;
  endereco: string;
  razaoSocial: string;
  telefones: string[];
  email: string | null;
  /** Convite já enviado por um representante, esperando o comerciante. */
  emailConvite: string | null;
  ultimoContato: UltimoContato | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Tira da busca os caracteres que mudam a sintaxe do filtro do PostgREST e os curingas. */
const limparBusca = (texto: string) => texto.replace(/[%_,()*\\:"']/g, " ").trim().replace(/\s+/g, " ").slice(0, 80);

export function lerFiltroProspeccao(p: URLSearchParams): FiltroProspeccao {
  const id = (nome: string) => (UUID.test(p.get(nome) ?? "") ? p.get(nome)! : "");
  const pagina = Number.parseInt(p.get("pagina") ?? "1", 10);
  return {
    busca: limparBusca(p.get("q") ?? ""),
    categoriaId: id("categoria"),
    bairroId: id("bairro"),
    pagina: Number.isInteger(pagina) && pagina > 0 && pagina <= 1000 ? pagina : 1,
  };
}

type DadosReceitaLinha = { razao_social: string; telefones: string[]; email: string | null };

interface LinhaProspeccao {
  id: string;
  nome: string;
  slug: string;
  email_convite: string | null;
  categoria: { nome: string } | null;
  enderecos: { logradouro: string; numero: string; bairro: { nome: string } | null }[];
  dados_receita: DadosReceitaLinha | DadosReceitaLinha[] | null;
}

export async function listarProspeccao(
  supabase: SupabaseClient,
  f: FiltroProspeccao,
): Promise<Resultado<{ comercios: ComercioProspeccao[]; total: number }>> {
  let consulta = supabase
    .from("anunciantes")
    .select(
      "id, nome, slug, email_convite, categoria:categorias(nome), " +
        `enderecos${f.bairroId ? "!inner" : ""}(logradouro, numero, bairro_id, bairro:bairros(nome)), ` +
        "dados_receita(razao_social, telefones, email), nao_procurar(anunciante_id)",
      { count: "exact" },
    )
    .eq("origem", "receita")
    .eq("status", "publicado")
    .is("usuario_id", null)
    .is("nao_procurar", null);
  if (f.busca) consulta = consulta.or(`nome.ilike.%${f.busca}%,slug.ilike.%${paraSlug(f.busca) || f.busca}%`);
  if (f.categoriaId) consulta = consulta.eq("categoria_principal_id", f.categoriaId);
  if (f.bairroId) consulta = consulta.eq("enderecos.bairro_id", f.bairroId);
  const inicio = (f.pagina - 1) * POR_PAGINA_PROSPECCAO;
  const { data, error, count } = await consulta.order("nome").order("id").range(inicio, inicio + POR_PAGINA_PROSPECCAO - 1);
  if (error) return mensagemDoBanco(error, "listarProspeccao");
  const linhas = data as unknown as LinhaProspeccao[];

  const contatos = await ultimosContatos(supabase, linhas.map((l) => l.id));
  // Sem o último contato, a lista sai assim mesmo: o aviso já foi para o registro.
  const mapa = contatos.ok ? contatos.dados : new Map<string, UltimoContato>();

  return {
    ok: true,
    dados: {
      total: count ?? 0,
      comercios: linhas.map((l) => {
        const receita = umSo(l.dados_receita);
        const [endereco] = l.enderecos;
        return {
          id: l.id,
          nome: l.nome,
          slug: l.slug,
          categoria: l.categoria?.nome ?? "",
          bairro: endereco?.bairro?.nome ?? "",
          endereco: endereco ? `${endereco.logradouro}, ${endereco.numero}` : "",
          razaoSocial: receita?.razao_social ?? "",
          telefones: receita?.telefones ?? [],
          email: receita?.email ?? null,
          emailConvite: l.email_convite,
          ultimoContato: mapa.get(l.id) ?? null,
        };
      }),
    },
  };
}

/** Quem pediu para não ser mais procurado sai da prospecção (só a equipe desfaz). */
export async function marcarNaoProcurar(supabase: SupabaseClient, anuncianteId: string): Promise<Resultado<null>> {
  if (!UUID.test(anuncianteId)) return falha("NAO_ENCONTRADO", "Comércio não encontrado.");
  const { data: anunciante, error: erroLeitura } = await supabase.from("anunciantes").select("cidade_id").eq("id", anuncianteId).maybeSingle();
  if (erroLeitura) return mensagemDoBanco(erroLeitura, "marcarNaoProcurar: comércio");
  if (!anunciante) return falha("NAO_ENCONTRADO", "Comércio não encontrado.");
  const { error } = await supabase.from("nao_procurar").insert({ anunciante_id: anuncianteId, cidade_id: anunciante.cidade_id });
  // Já marcado por outra pessoa: o resultado é o mesmo.
  if (error?.code === "23505") return { ok: true, dados: null };
  return error ? mensagemDoBanco(error, "marcarNaoProcurar") : { ok: true, dados: null };
}

/**
 * Converte o comércio importado para o comerciante (decisão de 23/10/2026):
 * guarda o e-mail, manda o convite na hora, sem confirmação da equipe, e liga
 * a conta ao perfil. O representante fica como quem trouxe, nunca como dono.
 * As etapas não ficam numa transação só: se o convite sair e a ligação
 * falhar, a conta fica no registro para a equipe ligar. Cada convite manda
 * um e-mail: no máximo 20 por representante a cada hora.
 */
export async function converterImportado(
  supabase: SupabaseClient,
  usuarioId: string,
  anuncianteId: string,
  email: string,
): Promise<Resultado<null>> {
  if (!UUID.test(anuncianteId)) return falha("NAO_ENCONTRADO", "Comércio não encontrado.");
  const valido = esquemaEmail.safeParse(email);
  if (!valido.success) {
    const mensagem = valido.error.issues[0]?.message ?? "E-mail inválido.";
    return falha("DADOS_INVALIDOS", mensagem, { email: mensagem });
  }

  const limite = await clienteServico().rpc("consumir_limite", { p_chave: `conversao:${usuarioId}`, p_limite: 20, p_janela_segundos: 3600 });
  if (limite.error) return mensagemDoBanco(limite.error, "converterImportado: limite");
  if (limite.data === false) return falha("SEM_PERMISSAO", "Muitos convites seguidos. Espere uma hora e tente de novo.");

  const { error: erroPreparo } = await supabase.rpc("preparar_conversao_importado", { p_anunciante: anuncianteId, p_email: valido.data });
  if (erroPreparo) return mensagemDoBanco(erroPreparo, "converterImportado: preparo");

  const { data: convite, error } = await clienteServico().auth.admin.inviteUserByEmail(valido.data);
  if (error) {
    if (error.code === "email_exists" || error.status === 422) {
      return falha("CONFLITO", "Já existe uma conta com este e-mail. Peça outro e-mail ao comerciante ou fale com a equipe.");
    }
    console.error("converterImportado: inviteUserByEmail falhou", { codigo: error.code, status: error.status, mensagem: error.message });
    return ERRO_INTERNO;
  }
  const { error: erroLigacao } = await supabase.rpc("vincular_conta_importado", { p_anunciante: anuncianteId, p_usuario: convite.user.id });
  if (erroLigacao) {
    console.error("converterImportado: ligação da conta falhou depois do convite", {
      anunciante: anuncianteId,
      usuario: convite.user.id,
      codigo: erroLigacao.code,
      mensagem: erroLigacao.message,
    });
    return mensagemDoBanco(erroLigacao, "converterImportado: ligação");
  }
  return { ok: true, dados: null };
}

/** Envio do modal "Registrei um contato" (ModalAtendimento.astro), na área do representante e na administração. */
export async function registrarDoFormulario(supabase: SupabaseClient, form: FormData): Promise<Resultado<{ naoProcurar: boolean }>> {
  const anuncianteId = String(form.get("anuncianteId") ?? "").slice(0, 40);
  const registro = await registrarAtendimento(supabase, {
    anuncianteId,
    dia: String(form.get("dia") ?? "").slice(0, 10),
    observacao: String(form.get("observacao") ?? "").slice(0, 600),
  });
  if (!registro.ok) return registro;
  const naoProcurar = form.get("naoProcurar") === "sim";
  if (naoProcurar) {
    const marcado = await marcarNaoProcurar(supabase, anuncianteId);
    if (!marcado.ok) return marcado;
  }
  return { ok: true, dados: { naoProcurar } };
}
