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
  valorMensal: number;
}

export interface Foto {
  id: string;
  /** Vazio enquanto não houver Storage; a interface mostra um marcador. */
  url?: string;
  legenda?: string;
}

export interface ParAntesDepois {
  id: string;
  antes: Foto;
  depois: Foto;
  legenda: string;
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
  latitude: number;
  longitude: number;
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
  slug: string;
  cidadeId: string;
  nome: string;
  categoriaId: string;
  categoriasAdicionais: string[];
  planoId: string;
  fundador: boolean;
  descricao: string;
  whatsapp: string;
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
  antesDepois: ParAntesDepois[];
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

export interface LinkPatrocinado {
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
