import { describe, expect, it } from "vitest";
import {
  SEGUNDOS_POR_DESTAQUE,
  contarDestaquesPorSituacao,
  destaqueEhDivulgacao,
  destaquesNoAr,
  segundosAteVoltar,
  situacaoDoDestaque,
  type DestaqueParaRegra,
} from "./destaques";

const base: DestaqueParaRegra = { inicio: "2026-11-20", fim: "2026-11-30", ligado: true, ordem: 0 };

describe("situacaoDoDestaque", () => {
  it("no ar do primeiro ao último dia, inclusive", () => {
    expect(situacaoDoDestaque(base, "2026-11-20")).toBe("no_ar");
    expect(situacaoDoDestaque(base, "2026-11-25")).toBe("no_ar");
    expect(situacaoDoDestaque(base, "2026-11-30")).toBe("no_ar");
  });

  it("programado antes do início e encerrado depois do fim", () => {
    expect(situacaoDoDestaque(base, "2026-11-19")).toBe("programado");
    expect(situacaoDoDestaque(base, "2026-12-01")).toBe("encerrado");
  });

  it("desligado vale mais que as datas", () => {
    expect(situacaoDoDestaque({ ...base, ligado: false }, "2026-11-25")).toBe("desligado");
    expect(situacaoDoDestaque({ ...base, ligado: false }, "2026-12-10")).toBe("desligado");
  });

  it("o destaque de evento encerra quando o evento acaba, se ele acabar antes", () => {
    const evento = { ...base, eventoFim: "2026-11-22" };
    expect(situacaoDoDestaque(evento, "2026-11-22")).toBe("no_ar");
    expect(situacaoDoDestaque(evento, "2026-11-23")).toBe("encerrado");
  });

  it("evento que acaba depois do destaque não estica o destaque", () => {
    expect(situacaoDoDestaque({ ...base, eventoFim: "2026-12-15" }, "2026-12-01")).toBe("encerrado");
    expect(situacaoDoDestaque({ ...base, eventoFim: null }, "2026-11-30")).toBe("no_ar");
  });
});

describe("destaquesNoAr", () => {
  it("deixa só os do dia, na ordem da administração", () => {
    const lista = [
      { ...base, id: "c", ordem: 2 },
      { ...base, id: "fora", inicio: "2026-11-26" },
      { ...base, id: "a", ordem: 0 },
      { ...base, id: "desligado", ligado: false },
      { ...base, id: "b", ordem: 1 },
    ];
    expect(destaquesNoAr(lista, "2026-11-25").map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("na mesma ordem, o que começou antes vem primeiro", () => {
    const lista = [
      { ...base, id: "depois", inicio: "2026-11-22" },
      { ...base, id: "antes", inicio: "2026-11-21" },
    ];
    expect(destaquesNoAr(lista, "2026-11-25").map((d) => d.id)).toEqual(["antes", "depois"]);
  });

  it("sem nenhum no ar, lista vazia", () => {
    expect(destaquesNoAr([{ ...base, ligado: false }], "2026-11-25")).toEqual([]);
  });
});

describe("contarDestaquesPorSituacao", () => {
  it("conta cada situação, também as que não aparecem", () => {
    const lista = [base, base, { ...base, inicio: "2026-11-28" }, { ...base, ligado: false }];
    expect(contarDestaquesPorSituacao(lista, "2026-11-25")).toEqual({ no_ar: 2, programado: 1, encerrado: 0, desligado: 1 });
    expect(contarDestaquesPorSituacao([], "2026-11-25")).toEqual({ no_ar: 0, programado: 0, encerrado: 0, desligado: 0 });
  });
});

describe("segundosAteVoltar", () => {
  it("é a rodada inteira: quantidade vezes o tempo de cada um", () => {
    expect(segundosAteVoltar(10)).toBe(60);
    expect(segundosAteVoltar(2)).toBe(2 * SEGUNDOS_POR_DESTAQUE);
    expect(segundosAteVoltar(3, 5)).toBe(15);
  });

  it("com um ou nenhum, não há troca", () => {
    expect(segundosAteVoltar(1)).toBe(0);
    expect(segundosAteVoltar(0)).toBe(0);
  });

  it("recusa quantidade inválida", () => {
    expect(() => segundosAteVoltar(-1)).toThrow();
    expect(() => segundosAteVoltar(1.5)).toThrow();
  });
});

describe("destaqueEhDivulgacao", () => {
  it("comércio citado leva a etiqueta", () => {
    expect(destaqueEhDivulgacao({ tipo: "campanha", comercio: "Jack's House" })).toBe(true);
  });

  it("campanha sem comércio e divulgação do Ache Aqui não levam", () => {
    expect(destaqueEhDivulgacao({ tipo: "campanha", comercio: null })).toBe(false);
    expect(destaqueEhDivulgacao({ tipo: "ache_aqui", comercio: "Qualquer" })).toBe(false);
  });

  it("evento leva, menos o de órgão público", () => {
    expect(destaqueEhDivulgacao({ tipo: "evento", comercio: null, origemEvento: "comercio" })).toBe(true);
    expect(destaqueEhDivulgacao({ tipo: "evento", comercio: null, origemEvento: "avulso" })).toBe(true);
    expect(destaqueEhDivulgacao({ tipo: "evento", comercio: null, origemEvento: "artista" })).toBe(true);
    expect(destaqueEhDivulgacao({ tipo: "evento", comercio: null, origemEvento: "orgao_publico" })).toBe(false);
  });
});
