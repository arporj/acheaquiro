// Anunciantes na administração (item 4.8; decisões de 23/10/2026): lista com
// busca e filtros, cadastro assistido, edição do perfil, mudança de situação
// e convite. Tudo usa a sessão do administrador, para a auditoria do banco
// registrar quem fez; a chave de serviço entra só no convite, que o Supabase
// Auth exige. "Recusar" volta o cadastro para rascunho com o motivo (a
// exclusão do cadastro é outra ação, pela LGPD).
import { calcularCobrancaPlano, limiteEfetivo, percentualFundadorNoAno } from "@acheaqui/domain";
import type { DegrauDescontoFundador, RegrasCobranca, Resultado } from "@acheaqui/types";
import {
  esquemaCadastroAssistido,
  esquemaMotivo,
  esquemaPerfilAnunciante,
  type CadastroAssistido,
  type PerfilAnunciante,
} from "@acheaqui/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { limparCache } from "./arquivos";
import { reenviarConvite } from "./equipe";
import { listarCategoriasAdmin, umSo, type CategoriaAdmin } from "./importacao";
import { clienteServico } from "./sessao";
import { paraSlug } from "./texto";

type CodigoFalha = "DADOS_INVALIDOS" | "CONFLITO" | "SEM_PERMISSAO" | "NAO_ENCONTRADO" | "LIMITE_DO_PLANO" | "ERRO_INTERNO";
type Falha = { ok: false; erro: { codigo: CodigoFalha; mensagem: string; campos?: Record<string, string> } };
const falha = (codigo: CodigoFalha, mensagem: string, campos?: Record<string, string>): Falha => ({ ok: false, erro: { codigo, mensagem, campos } });
const ERRO_INTERNO = falha("ERRO_INTERNO", "Não foi possível concluir agora. Tente de novo em instantes.");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CIDADE = "rio-das-ostras";

/** Mensagem das travas do banco (P0001) pode ir para a tela; o resto vai só para o registro. */
function mensagemDoBanco(erro: { code?: string; message: string }, contexto: string): Falha {
  if (erro.code === "P0001") return falha("SEM_PERMISSAO", erro.message);
  console.error(`${contexto} falhou`, { codigo: erro.code, mensagem: erro.message });
  return ERRO_INTERNO;
}

export type Situacao =
  | "rascunho"
  | "aguardando_anunciante"
  | "em_analise"
  | "aguardando_pagamento"
  | "publicado"
  | "pausado"
  | "escondido_por_vencimento"
  | "suspenso";

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  rascunho: "Rascunho",
  aguardando_anunciante: "Aguardando o anunciante",
  em_analise: "Em análise",
  aguardando_pagamento: "Aguardando pagamento",
  publicado: "Publicado",
  pausado: "Pausado pelo anunciante",
  escondido_por_vencimento: "Escondido (plano vencido)",
  suspenso: "Suspenso",
};

/** Abas da lista: cada uma junta as situações que pedem a mesma atenção. */
export const ABAS = {
  analisar: { rotulo: "Para analisar", situacoes: ["em_analise"] },
  andamento: { rotulo: "Em andamento", situacoes: ["rascunho", "aguardando_anunciante", "aguardando_pagamento"] },
  publicados: { rotulo: "Publicados", situacoes: ["publicado", "pausado"] },
  fora: { rotulo: "Fora do ar", situacoes: ["suspenso", "escondido_por_vencimento"] },
  todos: { rotulo: "Todos", situacoes: [] },
} as const satisfies Record<string, { rotulo: string; situacoes: readonly Situacao[] }>;
export type Aba = keyof typeof ABAS;

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export interface FiltroLista {
  aba: Aba;
  busca: string;
  tipo: "" | "profissional" | "comercio";
  origem: "" | "cadastro" | "receita";
  planoId: string;
  fundador: boolean;
  representanteId: string;
  categoriaId: string;
  bairroId: string;
  pagina: number;
}

export interface LinhaLista {
  id: string;
  nome: string;
  slug: string;
  tipo: "profissional" | "comercio";
  status: Situacao;
  origem: "cadastro" | "receita";
  fundador: boolean;
  criado_em: string;
  categoria: { nome: string } | null;
  plano: { nome: string } | null;
}

export const POR_PAGINA = 50;

/** Tira da busca os caracteres que mudam a sintaxe do filtro do PostgREST e os curingas. */
const limparBusca = (texto: string) => texto.replace(/[%_,()*\\:"']/g, " ").trim().replace(/\s+/g, " ").slice(0, 80);

export function lerFiltro(p: URLSearchParams): FiltroLista {
  const aba = (p.get("aba") ?? "") in ABAS ? (p.get("aba") as Aba) : "analisar";
  const id = (nome: string) => (UUID.test(p.get(nome) ?? "") ? p.get(nome)! : "");
  const pagina = Number.parseInt(p.get("pagina") ?? "1", 10);
  return {
    aba,
    busca: limparBusca(p.get("q") ?? ""),
    tipo: p.get("tipo") === "profissional" || p.get("tipo") === "comercio" ? (p.get("tipo") as FiltroLista["tipo"]) : "",
    origem: p.get("origem") === "cadastro" || p.get("origem") === "receita" ? (p.get("origem") as FiltroLista["origem"]) : "",
    planoId: id("plano"),
    fundador: p.get("fundador") === "1",
    representanteId: id("representante"),
    categoriaId: id("categoria"),
    bairroId: id("bairro"),
    pagina: Number.isInteger(pagina) && pagina > 0 && pagina <= 1000 ? pagina : 1,
  };
}

export async function listarAnunciantes(
  supabase: SupabaseClient,
  f: FiltroLista,
): Promise<Resultado<{ linhas: LinhaLista[]; total: number; porAba: Record<Aba, number> }>> {
  // O filtro de bairro usa o bairro do endereço (só os comércios têm endereço).
  const selecao =
    "id, nome, slug, tipo, status, origem, fundador, criado_em, categoria:categorias(nome), plano:planos!anunciantes_plano_id_fkey(nome)" +
    (f.bairroId ? ", enderecos!inner(bairro_id)" : "");
  let consulta = supabase.from("anunciantes").select(selecao, { count: "exact" });
  const situacoes: readonly Situacao[] = ABAS[f.aba].situacoes;
  // "Para analisar" também traz os importados assumidos que foram ao ar sem aprovação prévia.
  if (f.aba === "analisar") consulta = consulta.or("status.eq.em_analise,revisar.eq.true");
  else if (situacoes.length > 0) consulta = consulta.in("status", situacoes);
  if (f.busca) consulta = consulta.or(`nome.ilike.%${f.busca}%,slug.ilike.%${paraSlug(f.busca) || f.busca}%`);
  if (f.tipo) consulta = consulta.eq("tipo", f.tipo);
  if (f.origem) consulta = consulta.eq("origem", f.origem);
  if (f.planoId) consulta = consulta.eq("plano_id", f.planoId);
  if (f.fundador) consulta = consulta.eq("fundador", true);
  if (f.representanteId) consulta = consulta.eq("representante_id", f.representanteId);
  if (f.categoriaId) consulta = consulta.eq("categoria_principal_id", f.categoriaId);
  if (f.bairroId) consulta = consulta.eq("enderecos.bairro_id", f.bairroId);
  const inicio = (f.pagina - 1) * POR_PAGINA;

  // Contador de cada aba, sem os outros filtros: mostra o tamanho de cada fila.
  const abas = Object.keys(ABAS) as Aba[];
  const contagens = abas.map((aba) => {
    const q = supabase.from("anunciantes").select("id", { count: "exact", head: true });
    const s: readonly Situacao[] = ABAS[aba].situacoes;
    if (aba === "analisar") return q.or("status.eq.em_analise,revisar.eq.true");
    return s.length > 0 ? q.in("status", s) : q;
  });
  const [lista, ...porAba] = await Promise.all([consulta.order("nome").order("id").range(inicio, inicio + POR_PAGINA - 1), ...contagens]);
  if (lista.error) return mensagemDoBanco(lista.error, "listarAnunciantes");
  const erroContagem = porAba.find((c) => c.error)?.error;
  if (erroContagem) return mensagemDoBanco(erroContagem, "listarAnunciantes: contagem");
  return {
    ok: true,
    dados: {
      linhas: lista.data as unknown as LinhaLista[],
      total: lista.count ?? 0,
      porAba: Object.fromEntries(abas.map((aba, i) => [aba, porAba[i]!.count ?? 0])) as Record<Aba, number>,
    },
  };
}

// ---------------------------------------------------------------------------
// Opções dos formulários e dos filtros
// ---------------------------------------------------------------------------

export interface PlanoOpcao {
  id: string;
  nome: string;
  tipo: "profissional" | "comercio";
  valor_mensal_centavos: number;
  limite_categorias_adicionais: number;
  /** Valor de cada periodicidade, calculado por calcularCobrancaPlano (packages/domain). */
  valores: { mensal: number; anual: number; anualFundador: number | null };
}

export interface Opcoes {
  categorias: CategoriaAdmin[];
  bairros: { id: string; nome: string }[];
  planos: PlanoOpcao[];
  representantes: { id: string; nome: string; codigo: string }[];
}

/**
 * Opções do formulário. O representante não lê as configurações nem os outros
 * representantes: a página dele passa as regras do catálogo público e recebe
 * a lista de representantes vazia.
 */
export async function lerOpcoes(supabase: SupabaseClient, regrasPublicas?: RegrasCobranca): Promise<Resultado<Opcoes>> {
  const vazio = Promise.resolve({ data: [], error: null });
  const [categorias, bairros, planos, representantes, perfis, config] = await Promise.all([
    listarCategoriasAdmin(supabase),
    supabase.from("bairros").select("id, nome").eq("ativo", true).order("nome"),
    supabase
      .from("planos")
      .select("id, nome, tipo, valor_mensal_centavos, meses_cobrados_no_anual, limite_categorias_adicionais")
      .eq("ativo", true)
      .order("tipo")
      .order("nivel"),
    regrasPublicas ? vazio : supabase.from("representantes").select("id, codigo, usuario_id").eq("ativo", true).order("codigo"),
    regrasPublicas ? vazio : supabase.from("perfis_usuario").select("usuario_id, nome").eq("papel", "representante"),
    regrasPublicas
      ? Promise.resolve({
          data: [
            { chave: "desconto_fundador_escala", valor: regrasPublicas.escalaDescontoFundador },
            { chave: "prazo_fundador", valor: regrasPublicas.prazoFundador },
          ],
          error: null,
        })
      : supabase.from("configuracoes").select("chave, valor").in("chave", ["desconto_fundador_escala", "prazo_fundador"]),
  ]);
  if (!categorias.ok) return categorias;
  if (bairros.error) return mensagemDoBanco(bairros.error, "lerOpcoes: bairros");
  if (planos.error) return mensagemDoBanco(planos.error, "lerOpcoes: planos");
  if (representantes.error) return mensagemDoBanco(representantes.error, "lerOpcoes: representantes");
  if (perfis.error) return mensagemDoBanco(perfis.error, "lerOpcoes: perfis");
  if (config.error) return mensagemDoBanco(config.error, "lerOpcoes: configurações");
  const nomes = new Map(perfis.data.map((p) => [p.usuario_id as string, p.nome as string]));

  // Preço de Fundador (1º ano, anual) só até o prazo; depois, só o valor cheio.
  const valorConfig = (chave: string) => config.data.find((c) => c.chave === chave)?.valor;
  const escala = valorConfig("desconto_fundador_escala") as DegrauDescontoFundador[] | undefined;
  const prazo = valorConfig("prazo_fundador") as string | undefined;
  const percentualFundador = escala && prazo && hoje() <= prazo ? percentualFundadorNoAno(escala, 1) : null;
  const sem = { fundador: false, percentualFundador: 0 };

  return {
    ok: true,
    dados: {
      categorias: categorias.dados,
      bairros: bairros.data,
      planos: planos.data.map((p) => {
        const valores = { valorMensalCentavos: p.valor_mensal_centavos, mesesCobradosNoAnual: p.meses_cobrados_no_anual };
        const anual = calcularCobrancaPlano(valores, "anual", sem).valorDevidoCentavos;
        return {
          id: p.id,
          nome: p.nome,
          tipo: p.tipo,
          valor_mensal_centavos: p.valor_mensal_centavos,
          limite_categorias_adicionais: p.limite_categorias_adicionais,
          valores: {
            mensal: calcularCobrancaPlano(valores, "mensal", sem).valorDevidoCentavos,
            anual,
            anualFundador:
              percentualFundador !== null && anual > 0
                ? calcularCobrancaPlano(valores, "anual", { fundador: true, percentualFundador }).valorDevidoCentavos
                : null,
          },
        };
      }),
      representantes: representantes.data.map((r) => ({ id: r.id, codigo: r.codigo, nome: nomes.get(r.usuario_id) || r.codigo })),
    },
  };
}

// ---------------------------------------------------------------------------
// Um anunciante
// ---------------------------------------------------------------------------

export interface AnuncianteAdmin {
  id: string;
  nome: string;
  slug: string;
  tipo: "profissional" | "comercio";
  status: Situacao;
  origem: "cadastro" | "receita";
  fundador: boolean;
  fundador_desde: string | null;
  usuario_id: string | null;
  representante_id: string | null;
  email_convite: string | null;
  plano_id: string | null;
  plano_escolhido_id: string | null;
  periodicidade_escolhida: "mensal" | "anual" | null;
  motivo_correcao: string | null;
  categoria_principal_id: string;
  descricao: string;
  whatsapp: string | null;
  telefone: string | null;
  instagram: string | null;
  formas_pagamento: ("pix" | "cartao" | "dinheiro")[];
  registro_conselho: string | null;
  site_proprio: string | null;
  atende_toda_cidade: boolean;
  faz_entrega: boolean;
  entrega_toda_cidade: boolean;
  aprovado_em: string | null;
  criado_em: string;
  /** Rascunho que vai substituir este comércio importado quando o comerciante aceitar. */
  importado_id: string | null;
  /** Foi ao ar sem a aprovação prévia da equipe (importado assumido): aparece em "Para analisar". */
  revisar: boolean;
  categorias: { categoria_id: string }[];
  bairros: { bairro_id: string; finalidade: "atendimento" | "entrega" }[];
  enderecos: { id: string; logradouro: string; numero: string; complemento: string | null; bairro_id: string; principal: boolean }[];
  dados_receita: { cnpj: string; razao_social: string; telefones: string[]; email: string | null } | null;
}

export async function lerAnunciante(supabase: SupabaseClient, id: string): Promise<Resultado<AnuncianteAdmin>> {
  if (!UUID.test(id)) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const { data, error } = await supabase
    .from("anunciantes")
    .select(
      "id, nome, slug, tipo, status, origem, fundador, fundador_desde, usuario_id, representante_id, email_convite, plano_id, plano_escolhido_id, " +
        "periodicidade_escolhida, motivo_correcao, categoria_principal_id, descricao, whatsapp, telefone, instagram, formas_pagamento, registro_conselho, " +
        "site_proprio, atende_toda_cidade, faz_entrega, entrega_toda_cidade, aprovado_em, criado_em, importado_id, revisar, " +
        "categorias:anunciante_categorias(categoria_id), bairros:anunciante_bairros(bairro_id, finalidade), " +
        "enderecos(id, logradouro, numero, complemento, bairro_id, principal), dados_receita(cnpj, razao_social, telefones, email)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return mensagemDoBanco(error, "lerAnunciante");
  if (!data) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const lido = data as unknown as Omit<AnuncianteAdmin, "dados_receita"> & { dados_receita: AnuncianteAdmin["dados_receita"] | AnuncianteAdmin["dados_receita"][] };
  return { ok: true, dados: { ...lido, dados_receita: umSo(lido.dados_receita) } };
}

export interface RegistroHistorico {
  id: number;
  ator_id: string | null;
  acao: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  criado_em: string;
}

/** Últimas alterações do cadastro (tabela anunciantes), para a tela de detalhe. */
export async function lerHistorico(supabase: SupabaseClient, id: string): Promise<Resultado<RegistroHistorico[]>> {
  const { data, error } = await supabase
    .from("auditoria")
    .select("id, ator_id, acao, antes, depois, criado_em")
    .eq("tabela", "anunciantes")
    .eq("registro_id", id)
    .order("id", { ascending: false })
    .limit(20);
  if (error) return mensagemDoBanco(error, "lerHistorico");
  return { ok: true, dados: data as RegistroHistorico[] };
}

// ---------------------------------------------------------------------------
// Formulário → dados validados
// ---------------------------------------------------------------------------

export interface DadosFormulario {
  perfil: PerfilAnunciante;
  cadastro: CadastroAssistido;
}

/** Lê o formulário (FormularioAnunciante.astro) e valida no servidor. */
export function lerFormulario(form: FormData, tipoFixo?: "profissional" | "comercio"): Resultado<DadosFormulario> {
  const texto = (nome: string) => String(form.get(nome) ?? "").slice(0, 3000);
  const lista = (nome: string) => form.getAll(nome).map(String);
  const marcado = (nome: string) => form.get(nome) === "on";
  const perfil = esquemaPerfilAnunciante.safeParse({
    tipo: tipoFixo ?? texto("tipo"),
    nome: texto("nome"),
    categoriaPrincipalId: texto("categoriaPrincipalId"),
    categoriasAdicionais: lista("categoriasAdicionais"),
    descricao: texto("descricao"),
    whatsapp: texto("whatsapp"),
    telefone: texto("telefone"),
    instagram: texto("instagram"),
    formasPagamento: lista("formasPagamento"),
    registroConselho: texto("registroConselho"),
    atendeTodaCidade: marcado("atendeTodaCidade"),
    bairrosAtendidos: lista("bairrosAtendidos"),
    siteProprio: texto("siteProprio"),
    endereco: {
      logradouro: texto("endereco.logradouro"),
      numero: texto("endereco.numero"),
      complemento: texto("endereco.complemento"),
      bairroId: texto("endereco.bairroId"),
    },
    fazEntrega: marcado("fazEntrega"),
    entregaTodaCidade: marcado("entregaTodaCidade"),
    bairrosEntrega: lista("bairrosEntrega"),
  });
  const cadastro = esquemaCadastroAssistido.safeParse({
    emailConvite: texto("emailConvite"),
    planoEscolhidoId: texto("planoEscolhidoId"),
    periodicidade: texto("periodicidade") || "anual",
    representanteId: texto("representanteId"),
  });
  if (perfil.success && cadastro.success) return { ok: true, dados: { perfil: perfil.data, cadastro: cadastro.data } };
  const campos: Record<string, string> = {};
  for (const problema of [...(perfil.error?.issues ?? []), ...(cadastro.error?.issues ?? [])]) {
    const chave = problema.path.map(String).join(".");
    campos[chave] ??= problema.message;
  }
  return falha("DADOS_INVALIDOS", "Confira os campos marcados.", campos);
}

// ---------------------------------------------------------------------------
// Gravação (cadastro assistido e edição)
// ---------------------------------------------------------------------------

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Confere categorias (tipo e limite do plano) antes de gravar. */
async function conferirCategorias(supabase: SupabaseClient, perfil: PerfilAnunciante, planoId: string | null): Promise<Falha | null> {
  const categorias = await listarCategoriasAdmin(supabase);
  if (!categorias.ok) return categorias as Falha;
  const porId = new Map(categorias.dados.map((c) => [c.id, c]));
  const servem = (id: string) => {
    const c = porId.get(id);
    return c !== undefined && (c.tipo === "ambos" || c.tipo === perfil.tipo);
  };
  if (!servem(perfil.categoriaPrincipalId)) {
    return falha("DADOS_INVALIDOS", "Confira os campos marcados.", { categoriaPrincipalId: "Esta categoria não serve para este tipo de anunciante." });
  }
  const adicionais = perfil.categoriasAdicionais.filter((id) => id !== perfil.categoriaPrincipalId);
  if (adicionais.some((id) => !servem(id))) {
    return falha("DADOS_INVALIDOS", "Confira os campos marcados.", { categoriasAdicionais: "Há categoria que não serve para este tipo de anunciante." });
  }
  if (adicionais.length === 0) return null;

  let limite = 0;
  if (planoId) {
    const { data, error } = await supabase.from("planos").select("limite_categorias_adicionais").eq("id", planoId).maybeSingle();
    if (error) return mensagemDoBanco(error, "conferirCategorias: plano");
    // Os pacotes extras contratados entram aqui quando a tela de extras existir.
    limite = limiteEfetivo(
      { fotos: 0, categoriasAdicionais: data?.limite_categorias_adicionais ?? 0, encartesSemana: 0, produtos: 0, enderecos: 0 },
      [],
      "categoriasAdicionais",
      hoje(),
    );
  }
  if (adicionais.length > limite) {
    const mensagem = planoId ? `O plano permite até ${limite} categoria(s) adicional(is).` : "Escolha o plano para poder marcar categorias adicionais.";
    return falha("LIMITE_DO_PLANO", "Confira os campos marcados.", { categoriasAdicionais: mensagem });
  }
  return null;
}

function colunasDoPerfil(perfil: PerfilAnunciante) {
  const comum = {
    nome: perfil.nome,
    categoria_principal_id: perfil.categoriaPrincipalId,
    descricao: perfil.descricao,
    whatsapp: perfil.whatsapp || null,
    telefone: perfil.telefone || null,
    instagram: perfil.instagram || null,
    formas_pagamento: perfil.formasPagamento,
  };
  return perfil.tipo === "profissional"
    ? { ...comum, registro_conselho: perfil.registroConselho || null, atende_toda_cidade: perfil.atendeTodaCidade, site_proprio: null, faz_entrega: false, entrega_toda_cidade: false }
    : {
        ...comum,
        registro_conselho: null,
        atende_toda_cidade: false,
        site_proprio: perfil.siteProprio || null,
        faz_entrega: perfil.fazEntrega,
        entrega_toda_cidade: perfil.fazEntrega && perfil.entregaTodaCidade,
      };
}

/** Slug livre na cidade: o nome, e com -2, -3... quando já existe. */
async function slugLivre(supabase: SupabaseClient, cidadeId: string, nome: string): Promise<Resultado<string>> {
  const base = (paraSlug(nome) || "anunciante").slice(0, 75).replace(/-$/, "");
  const { data, error } = await supabase.from("anunciantes").select("slug").eq("cidade_id", cidadeId).like("slug", `${base}%`).limit(1000);
  if (error) return mensagemDoBanco(error, "slugLivre");
  const usados = new Set(data.map((r) => r.slug as string));
  let slug = base;
  for (let n = 2; usados.has(slug); n++) slug = `${base}-${n}`;
  return { ok: true, dados: slug };
}

/** Troca a lista de uma tabela de ligação só no que mudou (a auditoria registra só a diferença). */
async function sincronizar(
  supabase: SupabaseClient,
  tabela: "anunciante_categorias" | "anunciante_bairros",
  anuncianteId: string,
  cidadeId: string,
  coluna: "categoria_id" | "bairro_id",
  atuais: string[],
  novos: string[],
  extra: Record<string, string> = {},
): Promise<Falha | null> {
  const sair = atuais.filter((id) => !novos.includes(id));
  const entrar = novos.filter((id) => !atuais.includes(id));
  if (sair.length > 0) {
    let q = supabase.from(tabela).delete().eq("anunciante_id", anuncianteId).in(coluna, sair);
    for (const [c, v] of Object.entries(extra)) q = q.eq(c, v);
    const { error } = await q;
    if (error) return mensagemDoBanco(error, `sincronizar ${tabela}: saída`);
  }
  if (entrar.length > 0) {
    const { error } = await supabase.from(tabela).insert(entrar.map((id) => ({ anunciante_id: anuncianteId, cidade_id: cidadeId, [coluna]: id, ...extra })));
    if (error) return mensagemDoBanco(error, `sincronizar ${tabela}: entrada`);
  }
  return null;
}

async function salvarEndereco(
  supabase: SupabaseClient,
  anuncianteId: string,
  cidadeId: string,
  endereco: Extract<PerfilAnunciante, { tipo: "comercio" }>["endereco"],
  atual: AnuncianteAdmin["enderecos"][number] | undefined,
): Promise<Falha | null> {
  const colunas = {
    logradouro: endereco.logradouro,
    numero: endereco.numero,
    complemento: endereco.complemento || null,
    bairro_id: endereco.bairroId,
  };
  if (!atual) {
    const { error } = await supabase.from("enderecos").insert({ ...colunas, anunciante_id: anuncianteId, cidade_id: cidadeId, principal: true });
    return error ? mensagemDoBanco(error, "salvarEndereco: novo") : null;
  }
  const mudou = atual.logradouro !== colunas.logradouro || atual.numero !== colunas.numero || atual.bairro_id !== colunas.bairro_id;
  if (!mudou && (atual.complemento ?? null) === colunas.complemento) return null;
  // Endereço novo: o ponto antigo no mapa deixa de valer (o "Como chegar" usa o endereço escrito).
  const { error } = await supabase.from("enderecos").update(mudou ? { ...colunas, local: null } : colunas).eq("id", atual.id);
  return error ? mensagemDoBanco(error, "salvarEndereco") : null;
}

export async function limparPerfilDoCache(origemDoSite: string, slug: string): Promise<void> {
  try {
    await limparCache([`${origemDoSite}/perfil/${slug}`]);
  } catch (erro) {
    // A página sai do cache sozinha em até 5 minutos; a alteração já está gravada.
    console.error("limparPerfilDoCache falhou", { slug, erro: String(erro) });
  }
}

/**
 * Cria (id vazio) ou atualiza o cadastro. Um cadastro novo começa como
 * rascunho; só vai para o ar depois que o anunciante aceitar os Termos e a
 * administração aprovar. As etapas não ficam numa transação só: se uma falhar
 * no meio, salvar de novo completa o que faltou.
 */
export async function salvarAnunciante(
  supabase: SupabaseClient,
  autorId: string,
  id: string | null,
  { perfil, cadastro }: DadosFormulario,
  origemDoSite: string,
  /** Cadastro feito pelo representante: fica sempre ligado a ele, seja qual for o envio. */
  representanteFixo?: string,
): Promise<Resultado<{ id: string }>> {
  const { data: cidade, error: erroCidade } = await supabase.from("cidades").select("id").eq("slug", CIDADE).single();
  if (erroCidade) return mensagemDoBanco(erroCidade, "salvarAnunciante: cidade");

  let atual: AnuncianteAdmin | null = null;
  if (id) {
    const lido = await lerAnunciante(supabase, id);
    if (!lido.ok) return lido;
    atual = lido.dados;
    if (atual.tipo !== perfil.tipo) return falha("DADOS_INVALIDOS", "O tipo do anunciante não muda depois do cadastro.");
    if (atual.usuario_id && (cadastro.emailConvite || null) !== atual.email_convite) {
      return falha("CONFLITO", "A conta já está ligada a este e-mail. Para trocar, o anunciante muda o e-mail na própria conta.");
    }
  }

  // Plano obrigatório: o comércio começa no Gratuito (o banco preenche o plano em
  // vigor) e o autônomo escolhe um plano para se cadastrar.
  const { data: plano, error: erroPlano } = await supabase.from("planos").select("tipo").eq("id", cadastro.planoEscolhidoId).maybeSingle();
  if (erroPlano) return mensagemDoBanco(erroPlano, "salvarAnunciante: plano");
  if (!plano || plano.tipo !== perfil.tipo) {
    return falha("DADOS_INVALIDOS", "Confira os campos marcados.", { planoEscolhidoId: "Este plano não é deste tipo de anunciante." });
  }
  // No ar, vale o plano em vigor; antes de publicar, o escolhido (o perfil é preparado para ele).
  const noAr = atual?.status === "publicado" || atual?.status === "pausado";
  const problemaCategorias = await conferirCategorias(supabase, perfil, noAr ? atual!.plano_id : cadastro.planoEscolhidoId);
  if (problemaCategorias) return problemaCategorias;

  const colunas = {
    ...colunasDoPerfil(perfil),
    email_convite: cadastro.emailConvite || null,
    plano_escolhido_id: cadastro.planoEscolhidoId,
    periodicidade_escolhida: cadastro.periodicidade,
    representante_id: representanteFixo ?? (cadastro.representanteId || null),
  };

  let anuncianteId: string;
  if (atual) {
    const { error } = await supabase.from("anunciantes").update(colunas).eq("id", atual.id);
    if (error) return mensagemDoBanco(error, "salvarAnunciante: atualização");
    anuncianteId = atual.id;
  } else {
    const slug = await slugLivre(supabase, cidade.id, perfil.nome);
    if (!slug.ok) return slug;
    const inserir = (endereco: string) =>
      supabase
        .from("anunciantes")
        .insert({ ...colunas, cidade_id: cidade.id, tipo: perfil.tipo, slug: endereco, status: "rascunho", origem: "cadastro", cadastrado_por: autorId })
        .select("id")
        .single();
    let { data, error } = await inserir(slug.dados);
    // O representante não vê os rascunhos dos outros: o endereço pode já estar em uso sem ele saber.
    if (error?.code === "23505") ({ data, error } = await inserir(`${slug.dados.slice(0, 74)}-${crypto.randomUUID().slice(0, 4)}`));
    if (error?.code === "23505") return falha("CONFLITO", "Já existe um anunciante com este endereço. Mude um pouco o nome e salve de novo.");
    if (error) return mensagemDoBanco(error, "salvarAnunciante: cadastro");
    anuncianteId = data!.id;
  }

  const categoriasAtuais = (atual?.categorias ?? []).map((c) => c.categoria_id);
  const adicionais = perfil.categoriasAdicionais.filter((c) => c !== perfil.categoriaPrincipalId);
  const bairrosAtuais = (finalidade: "atendimento" | "entrega") =>
    (atual?.bairros ?? []).filter((b) => b.finalidade === finalidade).map((b) => b.bairro_id);
  const etapas: (() => Promise<Falha | null>)[] = [
    () => sincronizar(supabase, "anunciante_categorias", anuncianteId, cidade.id, "categoria_id", categoriasAtuais, adicionais),
  ];
  if (perfil.tipo === "profissional") {
    const novos = perfil.atendeTodaCidade ? [] : perfil.bairrosAtendidos;
    etapas.push(() => sincronizar(supabase, "anunciante_bairros", anuncianteId, cidade.id, "bairro_id", bairrosAtuais("atendimento"), novos, { finalidade: "atendimento" }));
  } else {
    const novos = perfil.fazEntrega && !perfil.entregaTodaCidade ? perfil.bairrosEntrega : [];
    const endereco = atual?.enderecos.find((e) => e.principal) ?? atual?.enderecos[0];
    etapas.push(() => sincronizar(supabase, "anunciante_bairros", anuncianteId, cidade.id, "bairro_id", bairrosAtuais("entrega"), novos, { finalidade: "entrega" }));
    etapas.push(() => salvarEndereco(supabase, anuncianteId, cidade.id, perfil.endereco, endereco));
  }
  for (const etapa of etapas) {
    const problema = await etapa();
    if (problema) return problema;
  }

  if (atual?.status === "publicado") await limparPerfilDoCache(origemDoSite, atual.slug);
  return { ok: true, dados: { id: anuncianteId } };
}

// ---------------------------------------------------------------------------
// Situação
// ---------------------------------------------------------------------------

/** Importado assumido que foi ao ar sem aprovação prévia: a equipe confere e tira de "Para analisar". */
export async function marcarConferido(supabase: SupabaseClient, id: string): Promise<Resultado<null>> {
  if (!UUID.test(id)) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const { error } = await supabase.from("anunciantes").update({ revisar: false }).eq("id", id).eq("revisar", true);
  return error ? mensagemDoBanco(error, "marcarConferido") : { ok: true, dados: null };
}

/** Marcação "não procurar mais" do comércio importado (quem marcou e quando); null se não há. */
export async function lerNaoProcurar(supabase: SupabaseClient, id: string): Promise<Resultado<{ marcadoEm: string; marcadoPor: string } | null>> {
  const { data, error } = await supabase.from("nao_procurar").select("marcado_em, marcado_por").eq("anunciante_id", id).maybeSingle();
  if (error) return mensagemDoBanco(error, "lerNaoProcurar");
  return { ok: true, dados: data ? { marcadoEm: data.marcado_em as string, marcadoPor: data.marcado_por as string } : null };
}

/** Só a equipe desfaz o "não procurar mais": o comércio volta para a prospecção de todos. */
export async function desfazerNaoProcurar(supabase: SupabaseClient, id: string): Promise<Resultado<null>> {
  if (!UUID.test(id)) return falha("NAO_ENCONTRADO", "Anunciante não encontrado.");
  const { error } = await supabase.from("nao_procurar").delete().eq("anunciante_id", id);
  return error ? mensagemDoBanco(error, "desfazerNaoProcurar") : { ok: true, dados: null };
}

export type AcaoSituacao = "aprovar" | "correcao" | "recusar" | "suspender" | "reativar";

/** De quais situações cada ação parte. */
export const ORIGENS_DA_ACAO: Record<AcaoSituacao, readonly Situacao[]> = {
  aprovar: ["em_analise"],
  correcao: ["em_analise"],
  recusar: ["em_analise", "aguardando_anunciante", "aguardando_pagamento"],
  suspender: ["publicado", "pausado", "aguardando_pagamento", "escondido_por_vencimento"],
  reativar: ["suspenso"],
};
export const PEDE_MOTIVO: readonly AcaoSituacao[] = ["correcao", "recusar", "suspender"];

/**
 * Aprovar publica quando o plano já está em vigor ou quando o escolhido é
 * gratuito; com plano pago escolhido, o cadastro espera o Pix.
 */
export async function mudarSituacao(
  supabase: SupabaseClient,
  autorId: string,
  id: string,
  acao: AcaoSituacao,
  motivoInformado: string,
  origemDoSite: string,
): Promise<Resultado<{ situacao: Situacao }>> {
  const lido = await lerAnunciante(supabase, id);
  if (!lido.ok) return lido;
  const a = lido.dados;
  if (!ORIGENS_DA_ACAO[acao].includes(a.status)) {
    return falha("CONFLITO", `Esta ação não vale para um cadastro "${ROTULO_SITUACAO[a.status]}". Atualize a página.`);
  }
  let motivo: string | null = null;
  if (PEDE_MOTIVO.includes(acao)) {
    const m = esquemaMotivo.safeParse(motivoInformado);
    if (!m.success) return falha("DADOS_INVALIDOS", m.error.issues[0]!.message);
    motivo = m.data;
  }

  let mudanca: Record<string, unknown>;
  switch (acao) {
    case "aprovar": {
      let planoId = a.plano_id;
      if (!planoId) {
        if (!a.plano_escolhido_id) return falha("DADOS_INVALIDOS", "Escolha o plano no cadastro antes de aprovar.");
        const { data: plano, error } = await supabase.from("planos").select("valor_mensal_centavos").eq("id", a.plano_escolhido_id).single();
        if (error) return mensagemDoBanco(error, "mudarSituacao: plano");
        if (plano.valor_mensal_centavos > 0) {
          mudanca = { status: "aguardando_pagamento", motivo_correcao: null };
          break;
        }
        planoId = a.plano_escolhido_id;
      }
      mudanca = { status: "publicado", plano_id: planoId, motivo_correcao: null, aprovado_em: new Date().toISOString(), aprovado_por: autorId };
      break;
    }
    case "correcao":
      mudanca = { status: "aguardando_anunciante", motivo_correcao: motivo };
      break;
    case "recusar":
      mudanca = { status: "rascunho", motivo_correcao: motivo };
      break;
    case "suspender":
      mudanca = { status: "suspenso", motivo_correcao: motivo };
      break;
    case "reativar":
      if (!a.plano_id) return falha("DADOS_INVALIDOS", "Este cadastro não tem plano em vigor: use \"Recusar\" ou registre o pagamento.");
      mudanca = { status: "publicado", motivo_correcao: null };
      break;
  }

  // A condição na situação de partida evita que duas pessoas mudem o mesmo cadastro ao mesmo tempo.
  const { data, error } = await supabase.from("anunciantes").update(mudanca).eq("id", id).eq("status", a.status).select("status");
  if (error) return mensagemDoBanco(error, "mudarSituacao");
  if (data.length === 0) return falha("CONFLITO", "Outra pessoa mudou este cadastro agora. Atualize a página.");
  const nova = data[0]!.status as Situacao;
  if (a.status === "publicado" || nova === "publicado") await limparPerfilDoCache(origemDoSite, a.slug);
  return { ok: true, dados: { situacao: nova } };
}

// ---------------------------------------------------------------------------
// Convite
// ---------------------------------------------------------------------------

/**
 * Manda o convite ao e-mail do cadastro (o Supabase Auth cria a conta como
 * anunciante) e liga a conta ao cadastro, que passa a "aguardando o
 * anunciante". Com a conta já ligada, só reenvia o e-mail.
 */
export async function enviarConvite(supabase: SupabaseClient, id: string): Promise<Resultado<{ reenvio: boolean }>> {
  const lido = await lerAnunciante(supabase, id);
  if (!lido.ok) return lido;
  const a = lido.dados;
  if (!a.email_convite) return falha("DADOS_INVALIDOS", "Informe o e-mail do anunciante no cadastro e salve antes de enviar o convite.");
  if (a.status !== "rascunho" && a.status !== "aguardando_anunciante") return falha("CONFLITO", "O anunciante já assumiu este cadastro.");
  if (a.usuario_id) {
    const reenvio = await reenviarConvite(a.email_convite);
    return reenvio.ok ? { ok: true, dados: { reenvio: true } } : reenvio;
  }

  const { data: convite, error } = await clienteServico().auth.admin.inviteUserByEmail(a.email_convite, { data: { nome: a.nome } });
  if (error) {
    if (error.code === "email_exists" || error.status === 422) {
      return falha("CONFLITO", "Já existe uma conta com este e-mail. Use outro e-mail para este cadastro.");
    }
    console.error("enviarConvite: inviteUserByEmail falhou", { codigo: error.code, status: error.status, mensagem: error.message });
    return ERRO_INTERNO;
  }
  const { error: erroLigacao } = await supabase.rpc("vincular_conta_anunciante", { p_anunciante: a.id, p_usuario: convite.user.id });
  if (erroLigacao) {
    // O convite já saiu: a conta existe sem cadastro ligado. Fica no registro para a equipe resolver.
    console.error("enviarConvite: ligação da conta falhou depois do convite", {
      anunciante: a.id,
      usuario: convite.user.id,
      codigo: erroLigacao.code,
      mensagem: erroLigacao.message,
    });
    return mensagemDoBanco(erroLigacao, "enviarConvite: ligação");
  }
  return { ok: true, dados: { reenvio: false } };
}

// ---------------------------------------------------------------------------
// Valores do formulário (do banco ou do envio com erro)
// ---------------------------------------------------------------------------

export interface ValoresFormulario {
  tipo: "profissional" | "comercio" | "";
  nome: string;
  categoriaPrincipalId: string;
  categoriasAdicionais: string[];
  descricao: string;
  whatsapp: string;
  telefone: string;
  instagram: string;
  formasPagamento: string[];
  registroConselho: string;
  atendeTodaCidade: boolean;
  bairrosAtendidos: string[];
  siteProprio: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairroEnderecoId: string;
  fazEntrega: boolean;
  entregaTodaCidade: boolean;
  bairrosEntrega: string[];
  emailConvite: string;
  planoEscolhidoId: string;
  periodicidade: "mensal" | "anual";
  representanteId: string;
}

export const VALORES_VAZIOS: ValoresFormulario = {
  tipo: "",
  nome: "",
  categoriaPrincipalId: "",
  categoriasAdicionais: [],
  descricao: "",
  whatsapp: "",
  telefone: "",
  instagram: "",
  formasPagamento: [],
  registroConselho: "",
  atendeTodaCidade: false,
  bairrosAtendidos: [],
  siteProprio: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairroEnderecoId: "",
  fazEntrega: false,
  entregaTodaCidade: false,
  bairrosEntrega: [],
  emailConvite: "",
  planoEscolhidoId: "",
  periodicidade: "anual",
  representanteId: "",
};

/** 5522999990000 → (22) 99999-0000, para editar no mesmo formato em que se digita. */
function telefoneLegivel(numero: string | null): string {
  if (!numero) return "";
  const local = numero.replace(/^55/, "");
  const meio = local.length === 11 ? 7 : 6;
  return `(${local.slice(0, 2)}) ${local.slice(2, meio)}-${local.slice(meio)}`;
}

export function valoresDoAnunciante(a: AnuncianteAdmin): ValoresFormulario {
  const endereco = a.enderecos.find((e) => e.principal) ?? a.enderecos[0];
  const bairros = (f: "atendimento" | "entrega") => a.bairros.filter((b) => b.finalidade === f).map((b) => b.bairro_id);
  return {
    tipo: a.tipo,
    nome: a.nome,
    categoriaPrincipalId: a.categoria_principal_id,
    categoriasAdicionais: a.categorias.map((c) => c.categoria_id).filter((id) => id !== a.categoria_principal_id),
    descricao: a.descricao,
    whatsapp: telefoneLegivel(a.whatsapp),
    telefone: telefoneLegivel(a.telefone),
    instagram: a.instagram ?? "",
    formasPagamento: a.formas_pagamento,
    registroConselho: a.registro_conselho ?? "",
    atendeTodaCidade: a.atende_toda_cidade,
    bairrosAtendidos: bairros("atendimento"),
    siteProprio: a.site_proprio ?? "",
    logradouro: endereco?.logradouro ?? "",
    numero: endereco?.numero ?? "",
    complemento: endereco?.complemento ?? "",
    bairroEnderecoId: endereco?.bairro_id ?? "",
    fazEntrega: a.faz_entrega,
    entregaTodaCidade: a.entrega_toda_cidade,
    bairrosEntrega: bairros("entrega"),
    emailConvite: a.email_convite ?? "",
    planoEscolhidoId: a.plano_escolhido_id ?? a.plano_id ?? "",
    periodicidade: a.periodicidade_escolhida ?? "anual",
    representanteId: a.representante_id ?? "",
  };
}

/** Repõe o que foi digitado quando o envio volta com erro. */
export function valoresDoEnvio(form: FormData, tipoFixo?: "profissional" | "comercio"): ValoresFormulario {
  const texto = (nome: string) => String(form.get(nome) ?? "").slice(0, 3000);
  const lista = (nome: string) => form.getAll(nome).map(String);
  const tipo = tipoFixo ?? texto("tipo");
  return {
    tipo: tipo === "profissional" || tipo === "comercio" ? tipo : "",
    nome: texto("nome"),
    categoriaPrincipalId: texto("categoriaPrincipalId"),
    categoriasAdicionais: lista("categoriasAdicionais"),
    descricao: texto("descricao"),
    whatsapp: texto("whatsapp"),
    telefone: texto("telefone"),
    instagram: texto("instagram"),
    formasPagamento: lista("formasPagamento"),
    registroConselho: texto("registroConselho"),
    atendeTodaCidade: form.get("atendeTodaCidade") === "on",
    bairrosAtendidos: lista("bairrosAtendidos"),
    siteProprio: texto("siteProprio"),
    logradouro: texto("endereco.logradouro"),
    numero: texto("endereco.numero"),
    complemento: texto("endereco.complemento"),
    bairroEnderecoId: texto("endereco.bairroId"),
    fazEntrega: form.get("fazEntrega") === "on",
    entregaTodaCidade: form.get("entregaTodaCidade") === "on",
    bairrosEntrega: lista("bairrosEntrega"),
    emailConvite: texto("emailConvite"),
    planoEscolhidoId: texto("planoEscolhidoId"),
    periodicidade: texto("periodicidade") === "mensal" ? "mensal" : "anual",
    representanteId: texto("representanteId"),
  };
}
