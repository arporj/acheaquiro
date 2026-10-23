// Tipos compartilhados entre a interface, o servidor e o acesso ao banco.
// Espelham as tabelas previstas na especificação funcional (v7). Toda entidade
// ligada a anunciantes carrega a cidade, porque o site nasce multicidade.

export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo

export type TipoAnunciante = "profissional" | "comercio";

export type Selo = "nenhum" | "transparente" | "prata" | "ouro";

export type FormaPagamento = "pix" | "cartao" | "dinheiro";

export interface Cidade {
  id: string;
  nome: string;
  uf: string;
  slug: string;
}

export interface Bairro {
  id: string;
  cidadeId: string;
  nome: string;
}

export interface Categoria {
  id: string;
  nome: string;
  /** Usado nos títulos das listas: "Eletricistas em Rio das Ostras". */
  nomePlural: string;
  /** Link curto da busca: acheaquiro.com.br/eletricistas */
  slugLista: string;
  grupo: string;
  /** Outros nomes pelos quais a categoria é procurada. */
  sinonimos: string[];
  /** Nome do ícone de traço (ver IconeCategoria em packages/ui). */
  icone: string;
  cor: string;
  /** Saúde e veterinário mostram o registro no conselho profissional. */
  exigeRegistroConselho: boolean;
  /** Aparece nos atalhos da página inicial. */
  atalho: boolean;
}

/** Valores e limites vêm da tabela de planos, editável pela administração. */
export interface Plano {
  id: string;
  tipo: TipoAnunciante;
  nome: string;
  selo: Selo;
  /** Quanto maior, mais acima na lista (grupo de ordenação). */
  nivel: number;
  valorMensalCentavos: number;
  /** O anual custa o equivalente a este número de mensalidades (hoje, 10). */
  mesesCobradosNoAnual: number;
  limiteFotos: number;
  limiteCategoriasAdicionais: number;
  limiteEncartesSemana: number;
  limiteProdutos: number;
  temRelatorio: boolean;
}

/** Extra avulso do item 6.4; valores vêm da tabela de extras. */
export interface Extra {
  id: string;
  nome: string;
  descricao: string;
  /** Na cobrança por dia, é o valor do bloco de dias seguidos. */
  valorMensalCentavos: number;
  /** Complemento do preço: "por categoria, em 3 bairros". */
  unidade?: string;
  /** "por_dia": o Destaque Exclusivo, escolhido em calendário (regras em `porDia`). */
  cobranca: "mensal" | "por_dia";
  porDia?: {
    diariaCentavos: number;
    valorBlocoCentavos: number;
    diasPorBloco: number;
    minimoDiasParaBloco: number;
    antecedenciaDias: number;
  };
  mesesCobradosNoAnual: number;
  /** Pacotes têm desconto de Fundador; destaques e patrocínios não. */
  aceitaDescontoFundador: boolean;
  permiteAnual: boolean;
}

/**
 * Um degrau do desconto de Fundador: o percentual vale até o ano de assinatura
 * indicado (inclusive). O último degrau não tem fim. Decisão de 21/10/2026:
 * [{ ateAno: 3, percentual: 50 }, { percentual: 25 }].
 */
export interface DegrauDescontoFundador {
  ateAno?: number;
  percentual: number;
}

/** Regras de cobrança da tabela de configurações da cidade. */
export interface RegrasCobranca {
  escalaDescontoFundador: DegrauDescontoFundador[];
  /** Último dia para pagar o anual e virar Fundador (AAAA-MM-DD). */
  prazoFundador: string;
  /** Dias depois do vencimento até o Fundador perder a condição. */
  toleranciaVencimentoDias: number;
}

export interface Foto {
  id: string;
  /** Vazio enquanto não houver Storage; a interface mostra um marcador. */
  url?: string;
  legenda?: string;
  /**
   * Antes e depois (item 4.3): duas fotos da galeria com o mesmo parId,
   * mostradas lado a lado. A legenda do par é a da foto "antes".
   */
  parId?: string;
  papelNoPar?: "antes" | "depois";
}

export interface IntervaloHorario {
  abre: string; // "08:00"
  fecha: string; // "18:00"
}

export interface HorarioDia {
  dia: DiaSemana;
  intervalos: IntervaloHorario[]; // vazio = fechado
}

export interface Endereco {
  id: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairroId: string;
  /** Vazio quando o endereço ainda não foi localizado no mapa. */
  latitude?: number;
  longitude?: number;
}

export interface Encarte {
  id: string;
  titulo: string;
  imagem: Foto;
  validoAte: string; // AAAA-MM-DD
}

export interface Produto {
  id: string;
  nome: string;
  descricao?: string;
  preco: number;
  foto: Foto;
}

interface AnuncianteBase {
  id: string;
  /** "receita": importado dos dados abertos do CNPJ (decisão de 22/10/2026). */
  origem?: "cadastro" | "receita";
  /** Importado que já tem dono (convite enviado pela administração). */
  assumido?: boolean;
  slug: string;
  cidadeId: string;
  nome: string;
  categoriaId: string;
  categoriasAdicionais: string[];
  planoId: string;
  fundador: boolean;
  descricao: string;
  /** Vazio no comércio importado da Receita, que ainda não informou contato. */
  whatsapp?: string;
  telefone?: string;
  fotoPerfil: Foto;
  galeria: Foto[];
  horario: HorarioDia[];
  instagram?: string;
  formasPagamento: FormaPagamento[];
  registroConselho?: string;
}

export interface AnuncianteProfissional extends AnuncianteBase {
  tipo: "profissional";
  atendeTodaCidade: boolean;
  bairrosAtendidos: string[];
}

export interface AnuncianteComercio extends AnuncianteBase {
  tipo: "comercio";
  /** Comércio com mais de uma loja na mesma cidade tem vários endereços. */
  enderecos: Endereco[];
  encartes: Encarte[];
  produtos: Produto[];
  entrega?: { todaCidade: boolean; bairros: string[] };
  siteProprio?: string;
}

export type Anunciante = AnuncianteProfissional | AnuncianteComercio;

export interface LinkDestacado {
  anuncianteId: string;
  categoriaId: string;
  /** Vazio = vale para qualquer bairro. */
  bairroId?: string;
  plus: boolean;
}

export type MotivoDenuncia =
  | "informacao_falsa"
  | "telefone_errado"
  | "servico_nao_prestado"
  | "conteudo_improprio"
  | "outro";

// Contrato padrão das operações de domínio (especificação técnica, seção 4.2).
// A mensagem é para o usuário final; detalhes técnicos vão só para o log.
export type CodigoErro =
  | "NAO_AUTENTICADO"
  | "SEM_PERMISSAO"
  | "VERIFICACAO_DUAS_ETAPAS_EXIGIDA"
  | "DADOS_INVALIDOS"
  | "NAO_ENCONTRADO"
  | "CONFLITO"
  | "LIMITE_DO_PLANO"
  | "LIMITE_DE_REQUISICOES"
  | "VERIFICACAO_ROBO_FALHOU"
  | "ARQUIVO_INVALIDO"
  | "ERRO_INTERNO";

export type Resultado<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: { codigo: CodigoErro; mensagem: string; campos?: Record<string, string> } };

/**
 * Dados públicos do catálogo de uma cidade, lidos de uma vez pelas páginas
 * (função catalogo_publico no banco). Os ids são os nomes fixos: slug do
 * bairro, link curto da categoria e código do plano e do extra.
 */
export interface CatalogoPublico {
  cidade: Cidade;
  bairros: Bairro[];
  categorias: Categoria[];
  /** Links curtos das categorias dos atalhos da página inicial, na ordem. */
  ordemAtalhos: string[];
  planos: Plano[];
  extras: Extra[];
  regras: RegrasCobranca;
  /** AAAA-MM-DD */
  aberturaAoPublico: string;
}

/** Cotas de patrocínio (proposta Patrocinadores v3, ainda em discussão). */
export type CotaPatrocinio = "master" | "ouro" | "apoio" | "grupo" | "categoria" | "agenda";

export interface Patrocinador {
  id: string;
  /** Endereço curto /p/[slug], que conta o clique e leva ao WhatsApp. */
  slug: string;
  nome: string;
  /** Ramo da empresa: só entra uma de cada ramo por cota (menos Apoio). */
  ramo: string;
  frase: string;
  whatsapp: string;
  /** Endereço do logo, no formato da cota. */
  logo: string;
  /** Tamanho do logo da cota, em pixels (vem da cota). */
  formatoLogo: { largura: number; altura: number };
  cota: CotaPatrocinio;
  /** Cota "grupo": nome do grupo de categorias. */
  grupo?: string;
  /** Cota "categoria": id da categoria. */
  categoriaId?: string;
  /** Último dia do contrato (AAAA-MM-DD): 12 meses desde a entrada no ar, mais o tempo de site fora do ar. */
  fim: string;
}


// Agenda de shows e eventos (módulo de eventos, decisão de 21 e 22/10/2026).

export interface Artista {
  id: string;
  slug: string;
  nome: string;
  /** Estilo musical ou tipo de apresentação. */
  estilo: string;
  descricao: string;
  /** Cor do avatar e da capa enquanto não houver foto. */
  cor: string;
  /** Foto do artista ou da banda, quadrada. */
  foto?: Foto;
  /** Capa do perfil, larga. */
  capa?: Foto;
  instagram?: string;
  /** Para contratar o artista ou a banda. */
  whatsapp?: string;
  /** Integrantes e formação (exemplo: "voz, guitarra, baixo e bateria"). */
  formacao?: string;
  /** Tipos de evento que o artista aceita fazer. */
  atende: string[];
  galeria: Foto[];
  /** Vídeos em sites externos (YouTube, Instagram); abrem fora do site, sem script de terceiros. */
  videos: { titulo: string; url: string }[];
  /** Quando o artista também é anunciante, o nome leva ao perfil. */
  anuncianteId?: string;
}

export interface Barraca {
  nome: string;
  vende: string;
  whatsapp?: string;
  anuncianteId?: string;
}

/** Evento com produtor (festival, feira), com programação e barracas. */
export interface EventoAgenda {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  produtor: string;
  local: string;
  bairroId: string;
  /** AAAA-MM-DD. */
  data: string;
  barracas: Barraca[];
}

/** Uma apresentação: num comércio com o extra de Agenda ou num evento. */
export interface Apresentacao {
  id: string;
  artistaId: string;
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM. */
  inicio: string;
  fim?: string;
  anuncianteId?: string;
  eventoId?: string;
}

/** Cota de patrocínio à venda: valores e vagas, editáveis pela administração. */
export interface CotaPatrocinioVenda {
  cota: CotaPatrocinio;
  nome: string;
  /** O que o patrocinador ganha, item por item. */
  beneficios: string[];
  /** Valor por 12 meses, em centavos. */
  valorCentavos: number;
  /** Valor para quem fecha até o prazo de Fundador, em centavos. */
  valorFundadorCentavos: number;
  /** Vagas fixas; nas cotas de grupo e de categoria, uma por grupo ou por categoria (vem do catálogo). */
  vagas?: number;
  /** Tamanho em que o logo deve ser enviado, em pixels. */
  formatoLogo: { largura: number; altura: number };
}
