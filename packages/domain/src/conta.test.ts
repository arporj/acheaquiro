import { describe, expect, it } from "vitest";
import { opcoesDeExclusao } from "./conta";

const base = { hoje: "2026-11-24", pagoAte: null, ultimoPagamento: null, exclusaoEm: null };

describe("opcoesDeExclusao", () => {
  it("sem nada pago: só excluir agora", () => {
    expect(opcoesDeExclusao(base)).toEqual({ podeManter: false, excluirEm: null, devolucaoAte: null, agendada: false });
  });
  it("com período pago: pode manter até o fim dele", () => {
    expect(opcoesDeExclusao({ ...base, pagoAte: "2027-11-27" })).toMatchObject({ podeManter: true, excluirEm: "2027-11-27" });
    expect(opcoesDeExclusao({ ...base, pagoAte: "2026-11-24" })).toMatchObject({ podeManter: true, excluirEm: "2026-11-24" });
  });
  it("período pago que já passou não conta", () => {
    expect(opcoesDeExclusao({ ...base, pagoAte: "2026-11-23" })).toMatchObject({ podeManter: false, excluirEm: null });
  });
  it("dentro dos 7 dias do último pagamento, avisa da devolução (X3)", () => {
    expect(opcoesDeExclusao({ ...base, ultimoPagamento: "2026-11-20" }).devolucaoAte).toBe("2026-11-27");
    expect(opcoesDeExclusao({ ...base, ultimoPagamento: "2026-11-17" }).devolucaoAte).toBe("2026-11-24");
    expect(opcoesDeExclusao({ ...base, ultimoPagamento: "2026-11-16" }).devolucaoAte).toBeNull();
  });
  it("exclusão já agendada", () => {
    expect(opcoesDeExclusao({ ...base, pagoAte: "2027-01-10", exclusaoEm: "2027-01-10" }).agendada).toBe(true);
  });
});
