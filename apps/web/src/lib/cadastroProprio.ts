// Cadastro próprio do anunciante e edição por partes (decisões C1, G2, G3 e G4
// de 24/11/2026). Cada etapa do cadastro e cada card da área do anunciante
// grava só a sua parte, com o esquema da parte (packages/validation) e as
// funções de gravação do cadastro assistido (anunciantesAdmin.ts). O que falta
// em cada parte vem de situacaoDoCadastro (packages/domain). Tudo usa a sessão
// do anunciante: o banco confere o dono, trava os campos da administração e,
// no perfil publicado, marca "Para conferir" (migration 20261124125805).
import { situacaoDoCadastro, podeEnviarCadastro, type ParteDoCadastro, type ResumoDoCadastro, type SituacaoDaParte } from "@acheaqui/domain";
import type { Resultado } from "@acheaqui/types";
import { esquemaEtapaContato, esquemaEtapaOnde, esquemaEtapaSobre, esquemaHorario } from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aceitarDocumentosVigentes } from "./anunciante";
import {
  conferirCategorias,
  horarioDoEnvio,
  limparPerfilDoCache,
  salvarEndereco,
  salvarHorario,
  sincronizar,
  slugLivre,
  type AnuncianteAdmin,
  type Falha,
  type Opcoes,
} from "./anunciantesAdmin";
import { formatarTelefone } from "./contato";
import type { FotosDoCadastro } from "./fotos";
import { clienteServico } from "./sessao";

const CIDADE = "rio-das-ostras";
const ERRO_INTERNO: Falha = { ok: false, erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível salvar agora. Tente de novo em instantes." } };
const CONFIRA = "Confira os campos marcados.";

function falha(codigo: Falha["erro"]["codigo"], mensagem: string, campos?: Record<string, string>): Falha {
  return { ok: false, erro: { codigo, mensagem, campos } };
}

function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

function errosDoEsquema(erro: { issues: { path: PropertyKey[]; message: string }[] }, prefixo = ""): Falha {
  const campos: Record<string, string> = {};
  for (const problema of erro.issues) campos[prefixo + problema.path.map(String).join(".")] ??= problema.message;
  return falha("DADOS_INVALIDOS", CONFIRA, campos);
}

/** Partes que a pessoa edita pela área (o plano muda por proposta ou com a equipe). */
export const PARTES_EDITAVEIS: readonly ParteDoCadastro[] = ["sobre", "contato", "onde", "horario", "fotos"];

export const TITULO_DA_PARTE: Record<ParteDoCadastro, string> = {
  sobre: "Seu anúncio",
  contato: "Contato",
  onde: "Onde atende",
  horario: "Horário",
  plano: "Plano",
  fotos: "Fotos",
};

/** "Onde atende" do autônomo vira "Endereço" no comércio. */
export function tituloDaParte(parte: ParteDoCadastro, tipo: "profissional" | "comercio" | null): string {
  return parte === "onde" && tipo === "comercio" ? "Endereço" : TITULO_DA_PARTE[parte];
}

/** Rascunho do cadastro próprio: criado pela própria conta e ainda não enviado. */
export function ehRascunhoProprio(cadastro: AnuncianteAdmin | null, usuarioId: string): boolean {
  return !!cadastro && cadastro.status === "rascunho" && cadastro.usuario_id === usuarioId && cadastro.cadastrado_por === usuarioId;
}

/** Resumo do cadastro para a regra do que falta. */
export function resumoDoCadastro(a: AnuncianteAdmin, fotos: FotosDoCadastro | null): ResumoDoCadastro {
  const endereco = a.enderecos.find((e) => e.principal) ?? a.enderecos[0];
  return {
    tipo: a.tipo,
    nome: a.nome,
    temCategoriaPrincipal: !!a.categoria_principal_id,
    temDescricao: a.descricao.trim().length > 0,
    temWhatsapp: !!a.whatsapp,
    temTelefone: !!a.telefone,
    temEndereco: !!endereco && !!endereco.logradouro && !!endereco.numero && !!endereco.bairro_id,
    atendeTodaCidade: a.atende_toda_cidade,
    bairrosAtendidos: a.bairros.filter((b) => b.finalidade === "atendimento").length,
    diasComHorario: new Set(a.horarios.filter((h) => h.endereco_id === null).map((h) => h.dia_semana)).size,
    temPlano: !!(a.plano_escolhido_id ?? a.plano_id),
    temFotoPerfil: !!fotos?.perfil,
    temFotoCapa: !!fotos?.capa,
  };
}

export function situacaoDoMeuCadastro(a: AnuncianteAdmin, fotos: FotosDoCadastro | null): SituacaoDaParte[] {
  return situacaoDoCadastro(resumoDoCadastro(a, fotos));
}

/** Plano usado no limite de categorias: o em vigor (no ar); antes, o escolhido, ou o maior do tipo enquanto não há escolha (a etapa do plano confere de novo). */
async function planoParaLimite(supabase: SupabaseClient, tipo: "profissional" | "comercio", cadastro: AnuncianteAdmin | null): Promise<Resultado<string | null>> {
  const noAr = cadastro?.status === "publicado" || cadastro?.status === "pausado";
  const atual = noAr ? cadastro!.plano_id : (cadastro?.plano_escolhido_id ?? null);
  if (atual) return { ok: true, dados: atual };
  const { data, error } = await supabase
    .from("planos")
    .select("id")
    .eq("tipo", tipo)
    .eq("ativo", true)
    .order("limite_categorias_adicionais", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return mensagemDoBanco(error, "planoParaLimite");
  return { ok: true, dados: (data?.id as string | undefined) ?? null };
}

async function salvarSobre(supabase: SupabaseClient, usuarioId: string, cadastro: AnuncianteAdmin | null, form: FormData): Promise<Resultado<{ id: string }>> {
  const lido = esquemaEtapaSobre.safeParse({
    tipo: cadastro?.tipo ?? String(form.get("tipo") ?? ""),
    nome: String(form.get("nome") ?? "").slice(0, 3000),
    categoriaPrincipalId: String(form.get("categoriaPrincipalId") ?? ""),
    categoriasAdicionais: form.getAll("categoriasAdicionais").map(String),
    descricao: String(form.get("descricao") ?? "").slice(0, 3000),
  });
  if (!lido.success) return errosDoEsquema(lido.error);
  const d = lido.data;
  const plano = await planoParaLimite(supabase, d.tipo, cadastro);
  if (!plano.ok) return plano;
  const problema = await conferirCategorias(supabase, d, plano.dados);
  if (problema) return problema;

  const { data: cidade, error: erroCidade } = await supabase.from("cidades").select("id").eq("slug", CIDADE).single();
  if (erroCidade) return mensagemDoBanco(erroCidade, "salvarSobre: cidade");
  const colunas = { nome: d.nome, categoria_principal_id: d.categoriaPrincipalId, descricao: d.descricao };

  let id: string;
  if (cadastro) {
    const { error } = await supabase.from("anunciantes").update(colunas).eq("id", cadastro.id);
    if (error) return mensagemDoBanco(error, "salvarSobre: atualização");
    id = cadastro.id;
  } else {
    const slug = await slugLivre(supabase, cidade.id as string, d.nome);
    if (!slug.ok) return slug;
    const inserir = (endereco: string) =>
      supabase
        .from("anunciantes")
        .insert({ ...colunas, cidade_id: cidade.id, tipo: d.tipo, slug: endereco, status: "rascunho", origem: "cadastro", usuario_id: usuarioId })
        .select("id")
        .single();
    let { data, error } = await inserir(slug.dados);
    // Outro rascunho, que esta conta não enxerga, pode ter o mesmo endereço.
    if (error?.code === "23505") ({ data, error } = await inserir(`${slug.dados.slice(0, 74)}-${crypto.randomUUID().slice(0, 4)}`));
    if (error) return mensagemDoBanco(error, "salvarSobre: cadastro");
    id = data!.id as string;
  }
  const adicionais = d.categoriasAdicionais.filter((c) => c !== d.categoriaPrincipalId);
  const atuais = (cadastro?.categorias ?? []).map((c) => c.categoria_id);
  const problemaCategorias = await sincronizar(supabase, "anunciante_categorias", id, cidade.id as string, "categoria_id", atuais, adicionais);
  return problemaCategorias ?? { ok: true, dados: { id } };
}

async function salvarContato(supabase: SupabaseClient, cadastro: AnuncianteAdmin, form: FormData): Promise<Falha | null> {
  const texto = (nome: string) => String(form.get(nome) ?? "").slice(0, 3000);
  const comum = { whatsapp: texto("whatsapp"), telefone: texto("telefone"), instagram: texto("instagram"), formasPagamento: form.getAll("formasPagamento").map(String) };
  if (cadastro.tipo === "profissional") {
    const lido = esquemaEtapaContato.profissional.safeParse({ ...comum, registroConselho: texto("registroConselho") });
    if (!lido.success) return errosDoEsquema(lido.error);
    const d = lido.data;
    const { error } = await supabase
      .from("anunciantes")
      .update({ whatsapp: d.whatsapp || null, telefone: d.telefone || null, instagram: d.instagram || null, formas_pagamento: d.formasPagamento, registro_conselho: d.registroConselho || null })
      .eq("id", cadastro.id);
    return error ? mensagemDoBanco(error, "salvarContato") : null;
  }
  const lido = esquemaEtapaContato.comercio.safeParse({ ...comum, siteProprio: texto("siteProprio") });
  if (!lido.success) return errosDoEsquema(lido.error);
  const d = lido.data;
  const { error } = await supabase
    .from("anunciantes")
    .update({ whatsapp: d.whatsapp || null, telefone: d.telefone || null, instagram: d.instagram || null, formas_pagamento: d.formasPagamento, site_proprio: d.siteProprio || null })
    .eq("id", cadastro.id);
  return error ? mensagemDoBanco(error, "salvarContato") : null;
}

async function salvarOnde(supabase: SupabaseClient, cadastro: AnuncianteAdmin, form: FormData): Promise<Falha | null> {
  const lista = (nome: string) => form.getAll(nome).map(String);
  const marcado = (nome: string) => form.get(nome) === "on";
  const { data: cidade, error: erroCidade } = await supabase.from("cidades").select("id").eq("slug", CIDADE).single();
  if (erroCidade) return mensagemDoBanco(erroCidade, "salvarOnde: cidade");
  const bairrosAtuais = (finalidade: "atendimento" | "entrega") => cadastro.bairros.filter((b) => b.finalidade === finalidade).map((b) => b.bairro_id);

  if (cadastro.tipo === "profissional") {
    const lido = esquemaEtapaOnde.profissional.safeParse({ atendeTodaCidade: marcado("atendeTodaCidade"), bairrosAtendidos: lista("bairrosAtendidos") });
    if (!lido.success) return errosDoEsquema(lido.error);
    const d = lido.data;
    const { error } = await supabase.from("anunciantes").update({ atende_toda_cidade: d.atendeTodaCidade }).eq("id", cadastro.id);
    if (error) return mensagemDoBanco(error, "salvarOnde: atendimento");
    const novos = d.atendeTodaCidade ? [] : d.bairrosAtendidos;
    return sincronizar(supabase, "anunciante_bairros", cadastro.id, cidade.id as string, "bairro_id", bairrosAtuais("atendimento"), novos, { finalidade: "atendimento" });
  }

  const texto = (nome: string) => String(form.get(nome) ?? "").slice(0, 3000);
  const lido = esquemaEtapaOnde.comercio.safeParse({
    endereco: { logradouro: texto("endereco.logradouro"), numero: texto("endereco.numero"), complemento: texto("endereco.complemento"), bairroId: texto("endereco.bairroId") },
    fazEntrega: marcado("fazEntrega"),
    entregaTodaCidade: marcado("entregaTodaCidade"),
    bairrosEntrega: lista("bairrosEntrega"),
  });
  if (!lido.success) return errosDoEsquema(lido.error);
  const d = lido.data;
  const { error } = await supabase
    .from("anunciantes")
    .update({ faz_entrega: d.fazEntrega, entrega_toda_cidade: d.fazEntrega && d.entregaTodaCidade })
    .eq("id", cadastro.id);
  if (error) return mensagemDoBanco(error, "salvarOnde: entrega");
  const endereco = cadastro.enderecos.find((e) => e.principal) ?? cadastro.enderecos[0];
  const problema = await salvarEndereco(supabase, cadastro.id, cidade.id as string, d.endereco, endereco);
  if (problema) return problema;
  const novos = d.fazEntrega && !d.entregaTodaCidade ? d.bairrosEntrega : [];
  return sincronizar(supabase, "anunciante_bairros", cadastro.id, cidade.id as string, "bairro_id", bairrosAtuais("entrega"), novos, { finalidade: "entrega" });
}

async function salvarHorarioDaParte(supabase: SupabaseClient, cadastro: AnuncianteAdmin, form: FormData): Promise<Falha | null> {
  const lido = esquemaHorario.safeParse(horarioDoEnvio(form));
  if (!lido.success) return errosDoEsquema(lido.error, "horario.");
  return salvarHorario(supabase, cadastro.id, lido.data, cadastro);
}

/** Plano escolhido no cadastro próprio, conferindo o tipo e as categorias adicionais já marcadas. */
async function salvarPlano(supabase: SupabaseClient, cadastro: AnuncianteAdmin, form: FormData): Promise<Falha | null> {
  if (cadastro.status !== "rascunho") return falha("CONFLITO", "O plano muda por proposta ou com a equipe.");
  const planoId = String(form.get("planoEscolhidoId") ?? "");
  const periodicidade = String(form.get("periodicidade") ?? "anual");
  if (periodicidade !== "mensal" && periodicidade !== "anual") return falha("DADOS_INVALIDOS", CONFIRA, { periodicidade: "Escolha mensal ou anual." });
  const { data: plano, error } = await supabase.from("planos").select("id, tipo, ativo, valor_mensal_centavos").eq("id", planoId).maybeSingle();
  if (error) return mensagemDoBanco(error, "salvarPlano: plano");
  if (!plano || !plano.ativo || plano.tipo !== cadastro.tipo) return falha("DADOS_INVALIDOS", CONFIRA, { planoEscolhidoId: "Escolha um dos planos da lista." });
  const categorias = await conferirCategorias(
    supabase,
    { tipo: cadastro.tipo, categoriaPrincipalId: cadastro.categoria_principal_id, categoriasAdicionais: cadastro.categorias.map((c) => c.categoria_id) },
    plano.id as string,
  );
  if (categorias) {
    return falha("LIMITE_DO_PLANO", CONFIRA, {
      planoEscolhidoId: `${categorias.erro.campos?.categoriasAdicionais ?? categorias.erro.mensagem} Desmarque categorias em "Seu anúncio" ou escolha um plano maior.`,
    });
  }
  const { error: erroGravar } = await supabase
    .from("anunciantes")
    .update({ plano_escolhido_id: plano.id, periodicidade_escolhida: plano.valor_mensal_centavos === 0 ? "mensal" : periodicidade })
    .eq("id", cadastro.id);
  return erroGravar ? mensagemDoBanco(erroGravar, "salvarPlano") : null;
}

/**
 * Grava uma parte do cadastro (etapa do cadastro próprio ou card da área). A
 * primeira parte ("sobre") cria o rascunho quando a conta ainda não tem cadastro.
 */
export async function salvarParte(
  supabase: SupabaseClient,
  usuarioId: string,
  cadastro: AnuncianteAdmin | null,
  parte: ParteDoCadastro,
  form: FormData,
  origemDoSite: string,
): Promise<Resultado<{ id: string }>> {
  if (cadastro && cadastro.usuario_id !== usuarioId) return falha("SEM_PERMISSAO", "Este cadastro não é desta conta.");
  if (parte === "fotos") return cadastro ? { ok: true, dados: { id: cadastro.id } } : falha("CONFLITO", "Comece pelo seu anúncio.");
  let resultado: Resultado<{ id: string }>;
  if (parte === "sobre") {
    resultado = await salvarSobre(supabase, usuarioId, cadastro, form);
  } else {
    if (!cadastro) return falha("CONFLITO", "Comece pelo seu anúncio.");
    const salvar = { contato: salvarContato, onde: salvarOnde, horario: salvarHorarioDaParte, plano: salvarPlano }[parte];
    const problema = await salvar(supabase, cadastro, form);
    resultado = problema ?? { ok: true, dados: { id: cadastro.id } };
  }
  if (resultado.ok && cadastro && (cadastro.status === "publicado" || cadastro.status === "pausado")) {
    await limparPerfilDoCache(origemDoSite, cadastro.slug);
  }
  return resultado;
}

/**
 * Envia o rascunho do cadastro próprio para análise (G3): confere o que é
 * obrigatório, grava o aceite das versões em vigor e muda a situação. O banco
 * confere tudo de novo. O representante indicado vem da conta (código informado
 * ao criar a conta, decisão de 24/11/2026).
 */
export async function enviarCadastroProprio(
  supabase: SupabaseClient,
  usuarioId: string,
  cadastro: AnuncianteAdmin,
  fotos: FotosDoCadastro | null,
): Promise<Resultado<null>> {
  if (!ehRascunhoProprio(cadastro, usuarioId)) return falha("CONFLITO", "Este cadastro já foi enviado.");
  if (!podeEnviarCadastro(situacaoDoMeuCadastro(cadastro, fotos))) return falha("DADOS_INVALIDOS", "Ainda falta preencher partes obrigatórias do cadastro.");
  const aceite = await aceitarDocumentosVigentes(supabase, usuarioId);
  if (!aceite.ok) return aceite;
  const { data, error } = await supabase.from("anunciantes").update({ status: "em_analise" }).eq("id", cadastro.id).eq("usuario_id", usuarioId).select("id");
  if (error) return mensagemDoBanco(error, "enviarCadastroProprio: situação");
  if (data.length === 0) {
    console.error("enviarCadastroProprio: nenhum cadastro alterado", { anunciante: cadastro.id });
    return ERRO_INTERNO;
  }
  return { ok: true, dados: null };
}

/** Resumo de uma linha do que está preenchido em cada parte, para os cards. */
export function resumosDasPartes(
  a: AnuncianteAdmin,
  opcoes: Opcoes | null,
  fotos: FotosDoCadastro | null,
): Partial<Record<ParteDoCadastro, string>> {
  const categoria = opcoes?.categorias.find((c) => c.id === a.categoria_principal_id)?.nome ?? "";
  const bairro = (id: string) => opcoes?.bairros.find((b) => b.id === id)?.nome ?? "";
  const endereco = a.enderecos.find((e) => e.principal) ?? a.enderecos[0];
  const atendidos = a.bairros.filter((b) => b.finalidade === "atendimento").map((b) => bairro(b.bairro_id));
  const dias = new Set(a.horarios.filter((h) => h.endereco_id === null).map((h) => h.dia_semana)).size;
  const planoId = a.status === "publicado" || a.status === "pausado" ? a.plano_id : (a.plano_escolhido_id ?? a.plano_id);
  const plano = opcoes?.planos.find((p) => p.id === planoId);
  const galeria = fotos?.galeria.length ?? 0;
  return {
    sobre: [a.nome, categoria].filter(Boolean).join(" · "),
    contato: [a.whatsapp && `WhatsApp ${formatarTelefone(a.whatsapp)}`, a.telefone && `Telefone ${formatarTelefone(a.telefone)}`, a.instagram && `@${a.instagram}`]
      .filter(Boolean)
      .join(" · "),
    onde:
      a.tipo === "comercio"
        ? endereco
          ? `${endereco.logradouro}, ${endereco.numero} · ${bairro(endereco.bairro_id)}`
          : ""
        : a.atende_toda_cidade
          ? "Atende a cidade toda"
          : atendidos.join(", "),
    horario: dias > 0 ? `${dias} dia(s) da semana com horário` : "",
    plano: plano ? `${plano.nome}${plano.valor_mensal_centavos > 0 && a.periodicidade_escolhida ? `, ${a.periodicidade_escolhida}` : ""}` : "",
    fotos: [fotos?.perfil && "foto de perfil", fotos?.capa && "capa", galeria > 0 && `${galeria} na galeria`].filter(Boolean).join(" · "),
  };
}

/** Chave Pix do site (configuracoes.chave_pix), mostrada a quem espera o pagamento do plano (G3). A tabela só é lida pela administração: o servidor lê com a chave de serviço. */
export async function lerChavePix(): Promise<Resultado<{ tipo: string; chave: string } | null>> {
  const { data, error } = await clienteServico().from("configuracoes").select("valor").eq("chave", "chave_pix").maybeSingle();
  if (error) return mensagemDoBanco(error, "lerChavePix");
  const valor = data?.valor as { tipo?: string; chave?: string } | undefined;
  return { ok: true, dados: valor?.chave ? { tipo: valor.tipo ?? "", chave: valor.chave } : null };
}
