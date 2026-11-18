import { describe, expect, it } from "vitest";
import {
  blocosDoEventoAvulso,
  diaDentroDoEvento,
  diasDoEvento,
  diasDoEventoNoPeriodo,
  estilosDoEvento,
  eventoNoMes,
  impedimentoParaAparecerNaAgenda,
  precoEventoAvulso,
  problemaNasDatasDoEvento,
  representantePodeEditarEvento,
  situacaoParaOCliente,
  ultimoDiaParaComecar,
} from "./agenda";

describe("diasDoEvento", () => {
  it("conta o primeiro e o último dia", () => {
    expect(diasDoEvento("2026-11-27", "2026-11-29")).toBe(3);
    expect(diasDoEvento("2026-11-27", "2026-11-27")).toBe(1);
  });
  it("recusa o último dia antes do primeiro", () => {
    expect(() => diasDoEvento("2026-11-29", "2026-11-27")).toThrow(RangeError);
  });
});

describe("blocos e preço do evento avulso", () => {
  it("5 dias = 1 bloco; 7 = 1; 8 = 2; 14 = 2; 30 = 5", () => {
    expect(blocosDoEventoAvulso("2026-12-01", "2026-12-05")).toBe(1);
    expect(blocosDoEventoAvulso("2026-12-01", "2026-12-07")).toBe(1);
    expect(blocosDoEventoAvulso("2026-12-01", "2026-12-08")).toBe(2);
    expect(blocosDoEventoAvulso("2026-12-01", "2026-12-14")).toBe(2);
    expect(blocosDoEventoAvulso("2026-12-01", "2026-12-30")).toBe(5);
  });
  it("um dia só já é um bloco", () => {
    expect(blocosDoEventoAvulso("2026-12-01", "2026-12-01")).toBe(1);
  });
  it("multiplica o valor do bloco", () => {
    expect(precoEventoAvulso("2026-12-01", "2026-12-14", 4990)).toEqual({ blocos: 2, valorCentavos: 9980 });
  });
  it("recusa valor do bloco zerado, negativo ou quebrado", () => {
    expect(() => precoEventoAvulso("2026-12-01", "2026-12-01", 0)).toThrow(RangeError);
    expect(() => precoEventoAvulso("2026-12-01", "2026-12-01", -10)).toThrow(RangeError);
    expect(() => precoEventoAvulso("2026-12-01", "2026-12-01", 49.9)).toThrow(RangeError);
  });
});

describe("datas do evento", () => {
  const hoje = "2026-11-17";
  it("aceita até 12 meses à frente", () => {
    expect(ultimoDiaParaComecar(hoje)).toBe("2027-11-17");
    expect(problemaNasDatasDoEvento({ inicio: "2027-11-17", fim: "2027-11-20", hoje })).toBeNull();
  });
  it("recusa começar depois de 12 meses", () => {
    expect(problemaNasDatasDoEvento({ inicio: "2027-11-18", fim: "2027-11-18", hoje })).toBe(
      "A Agenda aceita eventos que começam até 12 meses à frente.",
    );
  });
  it("recusa o último dia antes do primeiro", () => {
    expect(problemaNasDatasDoEvento({ inicio: "2026-11-29", fim: "2026-11-27", hoje })).toBe("O último dia não pode vir antes do primeiro.");
  });
  it("recusa evento que já terminou, mas aceita o que está acontecendo", () => {
    expect(problemaNasDatasDoEvento({ inicio: "2026-11-10", fim: "2026-11-16", hoje })).toBe("Este evento já terminou.");
    expect(problemaNasDatasDoEvento({ inicio: "2026-11-10", fim: "2026-11-17", hoje })).toBeNull();
  });
  it("o dia da programação fica entre o primeiro e o último dia", () => {
    const evento = { inicio: "2026-11-27", fim: "2026-11-29" };
    expect(diaDentroDoEvento("2026-11-27", evento)).toBe(true);
    expect(diaDentroDoEvento("2026-11-29", evento)).toBe(true);
    expect(diaDentroDoEvento("2026-11-26", evento)).toBe(false);
    expect(diaDentroDoEvento("2026-11-30", evento)).toBe(false);
  });
});

describe("impedimentoParaAparecerNaAgenda", () => {
  it("comércio: precisa do anúncio no ar e do extra em dia ou do plano que inclui a Agenda", () => {
    expect(impedimentoParaAparecerNaAgenda({ origem: "comercio", anuncioNoAr: true, extraAgendaEmDia: true })).toBeNull();
    expect(impedimentoParaAparecerNaAgenda({ origem: "comercio", anuncioNoAr: true, planoIncluiAgenda: true })).toBeNull();
    expect(impedimentoParaAparecerNaAgenda({ origem: "comercio", anuncioNoAr: true })).toBe(
      "O comércio precisa do extra Agenda em dia ou de um plano que inclua a Agenda.",
    );
    expect(impedimentoParaAparecerNaAgenda({ origem: "comercio", anuncioNoAr: false, extraAgendaEmDia: true })).toBe("O anúncio do comércio não está no ar.");
  });
  it("artista: só o anúncio de Músicos e bandas no ar", () => {
    expect(impedimentoParaAparecerNaAgenda({ origem: "artista", anuncioNoAr: true, anuncioDeArtista: true })).toBeNull();
    expect(impedimentoParaAparecerNaAgenda({ origem: "artista", anuncioNoAr: true, anuncioDeArtista: false })).toBe(
      "Só o anúncio da categoria Músicos e bandas cadastra shows sem o extra Agenda.",
    );
    expect(impedimentoParaAparecerNaAgenda({ origem: "artista", anuncioNoAr: false, anuncioDeArtista: true })).toBe("O anúncio do artista não está no ar.");
  });
  it("avulso: pago ou cortesia", () => {
    expect(impedimentoParaAparecerNaAgenda({ origem: "avulso", pago: true })).toBeNull();
    expect(impedimentoParaAparecerNaAgenda({ origem: "avulso", cortesia: true })).toBeNull();
    expect(impedimentoParaAparecerNaAgenda({ origem: "avulso" })).toBe("O evento avulso aparece com todos os blocos de 7 dias pagos ou com a cortesia.");
  });
  it("órgão público: sempre", () => {
    expect(impedimentoParaAparecerNaAgenda({ origem: "orgao_publico" })).toBeNull();
  });
});

describe("estilosDoEvento", () => {
  it("junta os estilos dos artistas sem repetir, em ordem alfabética", () => {
    const rock = { id: "1", nome: "Rock" };
    const mpb = { id: "2", nome: "MPB" };
    const axe = { id: "3", nome: "Axé" };
    expect(estilosDoEvento([{ estilos: [rock, mpb] }, { estilos: [mpb, axe] }, { estilos: [] }])).toEqual([axe, mpb, rock]);
  });
  it("sem artistas, sem estilos", () => {
    expect(estilosDoEvento([])).toEqual([]);
  });
});

describe("mês e período do evento", () => {
  const evento = { inicio: "2026-11-29", fim: "2026-12-02" };
  it("o evento de vários dias aparece em cada mês em que acontece", () => {
    expect(eventoNoMes(evento, "2026-11")).toBe(true);
    expect(eventoNoMes(evento, "2026-12")).toBe(true);
    expect(eventoNoMes(evento, "2026-10")).toBe(false);
    expect(eventoNoMes(evento, "2027-01")).toBe(false);
  });
  it("recusa mês fora do formato", () => {
    expect(() => eventoNoMes(evento, "2026-13")).toThrow(RangeError);
    expect(() => eventoNoMes(evento, "11/2026")).toThrow(RangeError);
  });
  it("lista os dias do evento dentro do período", () => {
    expect(diasDoEventoNoPeriodo(evento, "2026-11-01", "2026-11-30")).toEqual(["2026-11-29", "2026-11-30"]);
    expect(diasDoEventoNoPeriodo(evento, "2026-12-01", "2026-12-31")).toEqual(["2026-12-01", "2026-12-02"]);
    expect(diasDoEventoNoPeriodo(evento, "2026-11-01", "2026-12-31")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });
  it("período sem nenhum dia do evento devolve lista vazia", () => {
    expect(diasDoEventoNoPeriodo(evento, "2027-01-01", "2027-01-31")).toEqual([]);
  });
});

describe("situacaoParaOCliente", () => {
  const base = { origem: "avulso" as const, situacao: "publicado" as const, liberado: true, blocos: 1, blocosPagos: 1 };
  it("publicado e liberado: no site", () => {
    expect(situacaoParaOCliente(base)).toBe("Publicado e no site.");
  });
  it("avulso sem pagamento: diz quantos blocos faltam", () => {
    expect(situacaoParaOCliente({ ...base, liberado: false, blocos: 2, blocosPagos: 0 })).toBe(
      "Publicado, mas aparece no site depois do pagamento de 2 blocos de 7 dias. Fale com a equipe para pagar.",
    );
    expect(situacaoParaOCliente({ ...base, liberado: false, blocos: 2, blocosPagos: 1 })).toContain("1 bloco de 7 dias");
  });
  it("comércio e artista sem liberação: o que falta", () => {
    expect(situacaoParaOCliente({ ...base, origem: "comercio", liberado: false })).toContain("extra Agenda");
    expect(situacaoParaOCliente({ ...base, origem: "artista", liberado: false })).toContain("Músicos e bandas");
  });
  it("órgão público nunca espera nada", () => {
    expect(situacaoParaOCliente({ ...base, origem: "orgao_publico", liberado: false })).toBe("Publicado e no site.");
  });
  it("rascunho: avisa o que vai faltar depois de publicar", () => {
    expect(situacaoParaOCliente({ ...base, situacao: "rascunho" })).toBe("Rascunho: ainda não aparece no site. Publique quando estiver pronto.");
    expect(situacaoParaOCliente({ ...base, situacao: "rascunho", liberado: false, blocosPagos: 0 })).toBe(
      "Rascunho: ainda não aparece no site. Publicado, aparece no site depois do pagamento de 1 bloco de 7 dias. Fale com a equipe para pagar.",
    );
  });
  it("cancelado", () => {
    expect(situacaoParaOCliente({ ...base, situacao: "cancelado" })).toBe("Cancelado: não aparece no site.");
  });
});

describe("representantePodeEditarEvento", () => {
  it("só o rascunho que o cliente ainda não publicou", () => {
    expect(representantePodeEditarEvento({ situacao: "rascunho", publicadoEm: null })).toBe(true);
    expect(representantePodeEditarEvento({ situacao: "rascunho", publicadoEm: "2026-11-20T10:00:00Z" })).toBe(false);
    expect(representantePodeEditarEvento({ situacao: "publicado", publicadoEm: "2026-11-20T10:00:00Z" })).toBe(false);
    expect(representantePodeEditarEvento({ situacao: "cancelado", publicadoEm: null })).toBe(false);
  });
});
