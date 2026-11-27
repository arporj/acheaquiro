// Termos de Uso e Política de Privacidade (Especificação Técnica, seção 14,
// item 8): o texto fica no repositório, cada versão com endereço fixo
// (/termos/v1), e o git prova qual texto foi aceito. A versão vigente é a que
// o aceite grava em aceites_documentos (documentos_legais no banco).
import type { MarkdownInstance } from "astro";

type Texto = MarkdownInstance<Record<string, never>>;

/** O termo de confidencialidade é só do representante: aparece na área dele (/representante/termo). */
export type Documento = "termos" | "privacidade" | "confidencialidade";

const textos = import.meta.glob<Texto>("../conteudo/*-v*.md", { eager: true });

export const DOCUMENTOS: Record<Documento, { titulo: string; vigente: string }> = {
  termos: { titulo: "Termos de Uso", vigente: "4" },
  privacidade: { titulo: "Política de Privacidade", vigente: "2" },
  confidencialidade: { titulo: "Termo de Confidencialidade do Representante", vigente: "1" },
};

/**
 * Texto de uma versão; vazio se a versão não existe ou ainda não está em vigor
 * (a versão nova fica no repositório antes da data e só aparece no site quando
 * DOCUMENTOS.<documento>.vigente muda).
 */
export function textoDocumento(documento: Documento, versao: string): Texto | undefined {
  if (!/^\d{1,3}$/.test(versao) || Number(versao) > Number(DOCUMENTOS[documento].vigente)) return undefined;
  return textos[`../conteudo/${documento}-v${versao}.md`];
}

export function enderecoDocumento(documento: Documento, versao = DOCUMENTOS[documento].vigente): string {
  return `/${documento}/v${versao}`;
}
