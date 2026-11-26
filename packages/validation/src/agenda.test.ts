import { describe, expect, it } from "vitest";
import {
  CLASSIFICACOES_ETARIAS,
  esquemaArtista,
  esquemaBarraca,
  esquemaCortesia,
  esquemaEstiloMusical,
  esquemaEvento,
  esquemaItemProgramacao,
  ROTULO_CLASSIFICACAO,
  ROTULO_ENTRADA,
  ROTULO_ORIGEM_EVENTO,
} from "./agenda";

const BAIRRO = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";
const ANUNCIANTE = "8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ESTILO = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const mensagem = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

const evento = {
  origem: "avulso",
  nome: "  OstraCycle   Origens ",
  local: "Praça São Pedro",
  bairroId: BAIRRO,
  dataInicio: "2026-11-27",
  dataFim: "2026-11-29",
  entrada: "gratuita",
  abertoAoPublico: "sim",
};

describe("esquemaEvento", () => {
  it("aceita o mínimo e limpa os textos", () => {
    const r = esquemaEvento.parse(evento);
    expect(r).toMatchObject({
      origem: "avulso",
      anuncianteId: null,
      nome: "OstraCycle Origens",
      produtor: null,
      endereco: null,
      ruasFechadas: null,
      abertoAoPublico: true,
      classificacao: null,
      cadeiraDePraia: null,
      cooler: null,
      couvertCentavos: null,
      ingressos: [],
    });
    expect(r).not.toHaveProperty("couvert");
  });

  it("converte sim, não e não informado", () => {
    const r = esquemaEvento.parse({ ...evento, abertoAoPublico: "nao", cadeiraDePraia: "sim", cooler: "nao", classificacao: "18" });
    expect(r).toMatchObject({ abertoAoPublico: false, cadeiraDePraia: true, cooler: false, classificacao: "18" });
    expect(esquemaEvento.parse({ ...evento, cadeiraDePraia: "", cooler: "" })).toMatchObject({ cadeiraDePraia: null, cooler: null });
  });

  it("evento do comércio e show do artista exigem o anunciante", () => {
    expect(mensagem(esquemaEvento.safeParse({ ...evento, origem: "comercio" }))).toBe("Escolha o anunciante.");
    expect(mensagem(esquemaEvento.safeParse({ ...evento, origem: "artista" }))).toBe("Escolha o anunciante.");
    expect(esquemaEvento.parse({ ...evento, origem: "comercio", anuncianteId: ANUNCIANTE }).anuncianteId).toBe(ANUNCIANTE);
  });

  it("recusa o último dia antes do primeiro", () => {
    expect(mensagem(esquemaEvento.safeParse({ ...evento, dataFim: "2026-11-26" }))).toBe("O último dia não pode vir antes do primeiro.");
  });

  it("couvert exige o valor", () => {
    expect(esquemaEvento.parse({ ...evento, entrada: "couvert", couvert: "15,00" }).couvertCentavos).toBe(1500);
    expect(mensagem(esquemaEvento.safeParse({ ...evento, entrada: "couvert", couvert: "" }))).toBe("Couvert: valor inválido.");
  });

  it("ingressos: pelo menos um, ignorando linhas vazias; aceita ingresso de graça", () => {
    const r = esquemaEvento.parse({
      ...evento,
      entrada: "ingressos",
      ingressos: [
        { nome: "Inteira", valor: "40,00" },
        { nome: "", valor: "" },
        { nome: "Criança até 5 anos", valor: "0" },
      ],
    });
    expect(r.ingressos).toEqual([
      { nome: "Inteira", valorCentavos: 4000 },
      { nome: "Criança até 5 anos", valorCentavos: 0 },
    ]);
    expect(mensagem(esquemaEvento.safeParse({ ...evento, entrada: "ingressos", ingressos: [{ nome: "", valor: "" }] }))).toBe(
      "Informe pelo menos um tipo de ingresso.",
    );
    expect(mensagem(esquemaEvento.safeParse({ ...evento, entrada: "ingressos" }))).toBe("Informe pelo menos um tipo de ingresso.");
  });

  it("no máximo 10 tipos de ingresso", () => {
    const ingressos = Array.from({ length: 11 }, (_, i) => ({ nome: `Lote ${i + 1}`, valor: "10" }));
    expect(mensagem(esquemaEvento.safeParse({ ...evento, entrada: "ingressos", ingressos }))).toBe("No máximo 10 tipos de ingresso.");
  });

  it("couvert e ingressos não sobram quando a entrada é gratuita", () => {
    const r = esquemaEvento.parse({ ...evento, couvert: "15", ingressos: [{ nome: "Inteira", valor: "40" }] });
    expect(r.couvertCentavos).toBeNull();
    expect(r.ingressos).toEqual([]);
  });

  it("aceita a entrada por doação, com o que levar, e o perfil do local", () => {
    const r = esquemaEvento.parse({
      ...evento,
      entrada: "doacao",
      doacao: " 1 kg de alimento não perecível ou 1 kg de ração por pessoa ",
      localAnuncianteId: ANUNCIANTE,
    });
    expect(r.doacao).toBe("1 kg de alimento não perecível ou 1 kg de ração por pessoa");
    expect(r.localAnuncianteId).toBe(ANUNCIANTE);
    expect(r.couvertCentavos).toBeNull();
    expect(r.ingressos).toEqual([]);
  });

  it("exige o que levar na entrada por doação e ignora o texto nas outras entradas", () => {
    expect(mensagem(esquemaEvento.safeParse({ ...evento, entrada: "doacao", doacao: "" }))).toBe("Diga o que a pessoa leva para entrar.");
    const r = esquemaEvento.parse({ ...evento, doacao: "1 kg de alimento" });
    expect(r.doacao).toBeNull();
    expect(r.localAnuncianteId).toBeNull();
  });

  it("recusa perfil do local inválido", () => {
    expect(mensagem(esquemaEvento.safeParse({ ...evento, localAnuncianteId: "bar-do-ze" }))).toBe("Perfil do local inválido.");
  });

  it("recusa origem, classificação e sim/não fora da lista", () => {
    expect(esquemaEvento.safeParse({ ...evento, origem: "outra" }).success).toBe(false);
    expect(esquemaEvento.safeParse({ ...evento, classificacao: "10" }).success).toBe(false);
    expect(esquemaEvento.safeParse({ ...evento, cooler: "talvez" }).success).toBe(false);
  });
});

describe("esquemaItemProgramacao", () => {
  it("aceita artista ou atividade", () => {
    expect(esquemaItemProgramacao.parse({ dia: "2026-11-27", inicio: "08:00", titulo: "Largada do pedal" })).toEqual({
      dia: "2026-11-27",
      inicio: "08:00",
      fim: null,
      artistaId: null,
      artistaNome: null,
      titulo: "Largada do pedal",
    });
    expect(esquemaItemProgramacao.parse({ dia: "2026-11-27", inicio: "22:00", fim: "02:00", artistaId: ANUNCIANTE }).fim).toBe("02:00");
  });
  it("aceita só o nome do artista sem cadastro, com a observação", () => {
    const r = esquemaItemProgramacao.parse({ dia: "2026-11-27", inicio: "22:30", artistaNome: "  Uns   e Outros ", titulo: "acústico" });
    expect(r.artistaNome).toBe("Uns e Outros");
    expect(r.artistaId).toBeNull();
    expect(r.titulo).toBe("acústico");
  });
  it("recusa artista cadastrado e nome sem cadastro juntos, e nome curto", () => {
    expect(mensagem(esquemaItemProgramacao.safeParse({ dia: "2026-11-27", inicio: "22:30", artistaId: ANUNCIANTE, artistaNome: "Outro" }))).toBe(
      "Escolha o artista cadastrado ou use só o nome, não os dois.",
    );
    expect(mensagem(esquemaItemProgramacao.safeParse({ dia: "2026-11-27", inicio: "22:30", artistaNome: "U" }))).toBe("Nome do artista: pelo menos 2 letras.");
  });
  it("exige artista ou atividade", () => {
    expect(mensagem(esquemaItemProgramacao.safeParse({ dia: "2026-11-27", inicio: "08:00" }))).toBe("Escolha o artista ou escreva a atividade.");
  });
  it("recusa horário fora do formato", () => {
    expect(mensagem(esquemaItemProgramacao.safeParse({ dia: "2026-11-27", inicio: "8h", titulo: "Largada" }))).toBe(
      "Horário de início inválido: use HH:MM, como 21:00.",
    );
    expect(mensagem(esquemaItemProgramacao.safeParse({ dia: "2026-11-27", inicio: "08:00", fim: "25:00", titulo: "Largada" }))).toBe(
      "Horário de fim inválido: use HH:MM, como 23:30.",
    );
  });
});

describe("esquemaBarraca", () => {
  it("sem WhatsApp, não precisa de autorização", () => {
    expect(esquemaBarraca.parse({ nome: "Pastel da Vó", vende: "Pastéis e caldo de cana", whatsapp: "" })).toEqual({
      nome: "Pastel da Vó",
      vende: "Pastéis e caldo de cana",
      whatsapp: null,
      anuncianteId: null,
    });
  });
  it("com WhatsApp, exige a autorização do barraqueiro", () => {
    expect(mensagem(esquemaBarraca.safeParse({ nome: "Pastel da Vó", vende: "Pastéis", whatsapp: "(22) 99999-0000" }))).toBe(
      "Confirme que o barraqueiro autorizou publicar o WhatsApp.",
    );
    expect(esquemaBarraca.parse({ nome: "Pastel da Vó", vende: "Pastéis", whatsapp: "(22) 99999-0000", whatsappAutorizado: "sim" }).whatsapp).toBe(
      "5522999990000",
    );
  });
});

describe("esquemaArtista", () => {
  it("separa os tipos de evento por linha e ignora vídeos vazios", () => {
    const r = esquemaArtista.parse({
      nome: "Banda Maré Alta",
      estiloIds: [ESTILO, ESTILO],
      atende: "Bares e quiosques\n\n  Casamentos  ",
      videos: [
        { titulo: "Ao vivo", url: " https://www.youtube.com/watch?v=abc " },
        { titulo: "", url: "" },
      ],
    });
    expect(r).toEqual({
      nome: "Banda Maré Alta",
      estiloIds: [ESTILO],
      anuncianteId: null,
      formacao: null,
      atende: ["Bares e quiosques", "Casamentos"],
      videos: [{ titulo: "Ao vivo", url: "https://www.youtube.com/watch?v=abc" }],
    });
  });
  it("exige pelo menos um estilo e no máximo 5", () => {
    expect(mensagem(esquemaArtista.safeParse({ nome: "Banda", estiloIds: [] }))).toBe("Escolha pelo menos um estilo.");
    const seis = Array.from({ length: 6 }, (_, i) => `1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5${i}`);
    expect(mensagem(esquemaArtista.safeParse({ nome: "Banda", estiloIds: seis }))).toBe("No máximo 5 estilos.");
  });
  it("recusa vídeo sem https", () => {
    expect(mensagem(esquemaArtista.safeParse({ nome: "Banda", estiloIds: [ESTILO], videos: [{ titulo: "Show", url: "http://x.com/v" }] }))).toBe(
      "Vídeo: use o endereço completo, começando com https://.",
    );
  });
  it("no máximo 8 tipos de evento", () => {
    const atende = Array.from({ length: 9 }, (_, i) => `Tipo ${i}`).join("\n");
    expect(mensagem(esquemaArtista.safeParse({ nome: "Banda", estiloIds: [ESTILO], atende }))).toBe("No máximo 8 tipos de evento.");
  });
});

describe("estilo musical e cortesia", () => {
  it("estilo com nome de 2 a 40 letras", () => {
    expect(esquemaEstiloMusical.parse({ nome: " Jazz/blues " }).nome).toBe("Jazz/blues");
    expect(esquemaEstiloMusical.safeParse({ nome: "J" }).success).toBe(false);
  });
  it("cortesia com motivo de pelo menos 10 letras", () => {
    expect(esquemaCortesia.parse({ motivo: "Divulgação da abertura do site" }).motivo).toBe("Divulgação da abertura do site");
    expect(esquemaCortesia.safeParse({ motivo: "curto" }).success).toBe(false);
  });
});

describe("rótulos", () => {
  it("cobrem todas as opções", () => {
    expect(Object.keys(ROTULO_ORIGEM_EVENTO)).toEqual(["comercio", "artista", "avulso", "orgao_publico"]);
    expect(Object.keys(ROTULO_ENTRADA)).toEqual(["gratuita", "couvert", "ingressos", "doacao"]);
    expect(CLASSIFICACOES_ETARIAS.map((c) => ROTULO_CLASSIFICACAO[c])).toEqual([
      "Livre para todos",
      "A partir de 12 anos",
      "A partir de 14 anos",
      "A partir de 16 anos",
      "A partir de 18 anos",
    ]);
  });
});
