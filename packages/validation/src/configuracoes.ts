// Configurações gerais editadas na administração (decisão N4, 27/10/2026): dia
// da abertura ao público, último dia para virar Fundador, dias de tolerância
// depois do vencimento e percentual da carteira do representante. Ficam na
// tabela configuracoes; o banco guarda e o site lê de lá.
import { z } from "zod";

const inteiro = (minimo: number, maximo: number, mensagem: string) =>
  z.coerce.number({ error: mensagem }).int(mensagem).min(minimo, mensagem).max(maximo, mensagem);

export const esquemaConfiguracoesGerais = z
  .object({
    aberturaAoPublico: z.iso.date("Informe o dia da abertura ao público."),
    prazoFundador: z.iso.date("Informe o último dia para virar Fundador."),
    toleranciaVencimentoDias: inteiro(1, 30, "Tolerância: de 1 a 30 dias."),
    percentualCarteira: inteiro(0, 30, "Carteira: de 0% a 30%, sem casas decimais."),
  })
  .refine((c) => c.prazoFundador < c.aberturaAoPublico, {
    path: ["prazoFundador"],
    message: "O prazo dos Fundadores precisa terminar antes da abertura ao público.",
  });
export type ConfiguracoesGerais = z.infer<typeof esquemaConfiguracoesGerais>;
