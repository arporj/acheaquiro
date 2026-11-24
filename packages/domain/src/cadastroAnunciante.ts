// Partes do cadastro do anunciante e o que falta em cada uma (decisões C1, G2 e
// G3 de 24/11/2026). As mesmas partes viram as etapas do cadastro próprio e os
// cards da área do anunciante. "Obrigatório" impede o envio para análise;
// "recomendado" só aparece como dica.

export type ParteDoCadastro = "sobre" | "contato" | "onde" | "horario" | "plano" | "fotos";

/** Ordem das etapas do cadastro próprio; depois delas vem "Conferir e enviar". */
export const PARTES_DO_CADASTRO: readonly ParteDoCadastro[] = ["sobre", "contato", "onde", "horario", "plano", "fotos"];

export interface ResumoDoCadastro {
  tipo: "profissional" | "comercio";
  nome: string;
  temCategoriaPrincipal: boolean;
  temDescricao: boolean;
  temWhatsapp: boolean;
  temTelefone: boolean;
  /** Comércio: rua, número e bairro preenchidos. */
  temEndereco: boolean;
  atendeTodaCidade: boolean;
  bairrosAtendidos: number;
  diasComHorario: number;
  temPlano: boolean;
  temFotoPerfil: boolean;
  temFotoCapa: boolean;
}

export interface SituacaoDaParte {
  parte: ParteDoCadastro;
  /** O que falta e impede o envio. */
  obrigatorio: string[];
  /** O que deixaria o anúncio melhor, sem impedir o envio. */
  recomendado: string[];
}

function situacao(parte: ParteDoCadastro, obrigatorio: (string | false)[], recomendado: (string | false)[]): SituacaoDaParte {
  return {
    parte,
    obrigatorio: obrigatorio.filter((t): t is string => typeof t === "string"),
    recomendado: recomendado.filter((t): t is string => typeof t === "string"),
  };
}

/** O que falta em cada parte, na ordem das etapas. */
export function situacaoDoCadastro(r: ResumoDoCadastro): SituacaoDaParte[] {
  const comercio = r.tipo === "comercio";
  return [
    situacao(
      "sobre",
      [r.nome.trim().length < 2 && "o nome", !r.temCategoriaPrincipal && "a categoria principal"],
      [!r.temDescricao && "uma descrição do que você faz"],
    ),
    situacao("contato", [!r.temWhatsapp && !r.temTelefone && "o WhatsApp ou o telefone"], [!r.temWhatsapp && "o WhatsApp, que é o contato mais usado"]),
    situacao(
      "onde",
      [comercio ? !r.temEndereco && "o endereço" : !r.atendeTodaCidade && r.bairrosAtendidos === 0 && "os bairros em que atende (ou a cidade toda)"],
      [],
    ),
    situacao("horario", [], [r.diasComHorario === 0 && (comercio ? "o horário de funcionamento" : "o horário de atendimento")]),
    situacao("plano", [!r.temPlano && "o plano"], []),
    situacao("fotos", [], [!r.temFotoPerfil && "a foto de perfil", !r.temFotoCapa && "a foto de capa"]),
  ];
}

/** O cadastro pode ir para análise quando nenhuma parte tem pendência obrigatória. */
export function podeEnviarCadastro(situacoes: SituacaoDaParte[]): boolean {
  return situacoes.every((s) => s.obrigatorio.length === 0);
}

/** Etapa seguinte do cadastro próprio; null depois da última (vem "Conferir e enviar"). */
export function proximaParte(atual: ParteDoCadastro): ParteDoCadastro | null {
  const i = PARTES_DO_CADASTRO.indexOf(atual);
  return PARTES_DO_CADASTRO[i + 1] ?? null;
}

/** Etapa anterior; null na primeira. */
export function parteAnterior(atual: ParteDoCadastro): ParteDoCadastro | null {
  const i = PARTES_DO_CADASTRO.indexOf(atual);
  return i > 0 ? PARTES_DO_CADASTRO[i - 1]! : null;
}

/** Texto do que falta, em uma frase: "Falta o nome e a categoria principal." */
export function textoDoQueFalta(itens: string[]): string {
  if (itens.length === 0) return "";
  const lista = itens.length === 1 ? itens[0]! : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
  return `Falta ${lista}.`;
}
