// Senha forte (Especificação Funcional, item 4.14): pelo menos 10 caracteres,
// com letra maiúscula, letra minúscula, número e símbolo. O Supabase Auth
// aplica a mesma regra (supabase/config.toml); esta cópia serve para a tela
// mostrar o que falta enquanto a pessoa digita e para o servidor recusar antes.

export const TAMANHO_MINIMO_SENHA = 10;
/** Acima disso o Supabase Auth recusa (limite do bcrypt, 72 bytes). */
export const TAMANHO_MAXIMO_SENHA = 72;

/**
 * Os símbolos que o Supabase Auth aceita como "símbolo". Outro caractere (por
 * exemplo, "ç" ou "€") pode estar na senha, mas não conta como o símbolo exigido.
 */
export const SIMBOLOS_SENHA = "!@#$%^&*()_+-=[]{};'\:\"|<>?,./`~";

export interface RequisitoSenha {
  id: "tamanho" | "maiuscula" | "minuscula" | "numero" | "simbolo";
  descricao: string;
  atende: (senha: string) => boolean;
}

export const REQUISITOS_SENHA: readonly RequisitoSenha[] = [
  {
    id: "tamanho",
    descricao: `Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`,
    atende: (senha) => [...senha].length >= TAMANHO_MINIMO_SENHA,
  },
  { id: "maiuscula", descricao: "Uma letra maiúscula", atende: (senha) => /[A-Z]/.test(senha) },
  { id: "minuscula", descricao: "Uma letra minúscula", atende: (senha) => /[a-z]/.test(senha) },
  { id: "numero", descricao: "Um número", atende: (senha) => /[0-9]/.test(senha) },
  {
    id: "simbolo",
    descricao: "Um símbolo, como ! @ # $ % * ou ?",
    atende: (senha) => [...senha].some((caractere) => SIMBOLOS_SENHA.includes(caractere)),
  },
];

/** Requisitos que a senha ainda não cumpre, na ordem da lista. */
export function requisitosFaltando(senha: string): RequisitoSenha[] {
  return REQUISITOS_SENHA.filter((requisito) => !requisito.atende(senha));
}

export function senhaForte(senha: string): boolean {
  return requisitosFaltando(senha).length === 0 && new TextEncoder().encode(senha).length <= TAMANHO_MAXIMO_SENHA;
}
