// Resumo do visitante para contar cliques e limitar pedidos sem guardar o IP:
// o hash do IP com o navegador e o dia, que não volta a ser o IP e muda todo dia.
import { hojeNaCidade } from "@/dados/consultas";

export async function resumoDoVisitante(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const navegador = (request.headers.get("user-agent") ?? "").slice(0, 200);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${navegador}|${hojeNaCidade()}`));
  return [...new Uint8Array(bytes)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
