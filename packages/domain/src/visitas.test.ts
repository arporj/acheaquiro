import { describe, expect, it } from "vitest";
import { textoDoContadorDeVisitas } from "./visitas";

describe("textoDoContadorDeVisitas", () => {
  it("arredonda para baixo em centenas", () => {
    expect(textoDoContadorDeVisitas(501)).toBe("Mais de 500 visitas");
    expect(textoDoContadorDeVisitas(599)).toBe("Mais de 500 visitas");
    expect(textoDoContadorDeVisitas(600)).toBe("Mais de 500 visitas");
    expect(textoDoContadorDeVisitas(601)).toBe("Mais de 600 visitas");
  });

  it('com o número exato, o "mais de" continua verdadeiro', () => {
    expect(textoDoContadorDeVisitas(500)).toBe("Mais de 400 visitas");
  });

  it("escreve milhares como no português", () => {
    expect(textoDoContadorDeVisitas(12_345)).toBe("Mais de 12.300 visitas");
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
