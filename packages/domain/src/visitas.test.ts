import { describe, expect, it } from "vitest";
import { numeroDoContadorDeVisitas, textoDoContadorDeVisitas } from "./visitas";

describe("numeroDoContadorDeVisitas", () => {
  it("devolve só o número arredondado, escrito em português", () => {
    expect(numeroDoContadorDeVisitas(501)).toBe("500");
    expect(numeroDoContadorDeVisitas(500)).toBe("490");
    expect(numeroDoContadorDeVisitas(12_345)).toBe("12.340");
  });

  it("abaixo do mínimo ou inválido, nada", () => {
    expect(numeroDoContadorDeVisitas(100)).toBeNull();
    expect(numeroDoContadorDeVisitas(Number.NaN)).toBeNull();
  });
});

describe("textoDoContadorDeVisitas", () => {
  it("arredonda para baixo em dezenas", () => {
    expect(textoDoContadorDeVisitas(501)).toBe("Mais de 500 visitas");
    expect(textoDoContadorDeVisitas(509)).toBe("Mais de 500 visitas");
    expect(textoDoContadorDeVisitas(510)).toBe("Mais de 500 visitas");
    expect(textoDoContadorDeVisitas(511)).toBe("Mais de 510 visitas");
    expect(textoDoContadorDeVisitas(523.7)).toBe("Mais de 520 visitas");
  });

  it('com o número exato, o "mais de" continua verdadeiro', () => {
    expect(textoDoContadorDeVisitas(520)).toBe("Mais de 510 visitas");
  });

  it("escreve milhares como no português", () => {
    expect(textoDoContadorDeVisitas(12_345)).toBe("Mais de 12.340 visitas");
  });

  it("abaixo do mínimo, não mostra nada", () => {
    expect(textoDoContadorDeVisitas(100)).toBeNull();
    expect(textoDoContadorDeVisitas(0)).toBeNull();
    expect(textoDoContadorDeVisitas(101)).toBe("Mais de 100 visitas");
  });

  it("valor inválido não mostra nada", () => {
    expect(textoDoContadorDeVisitas(Number.NaN)).toBeNull();
    expect(textoDoContadorDeVisitas(-5)).toBeNull();
  });
});
