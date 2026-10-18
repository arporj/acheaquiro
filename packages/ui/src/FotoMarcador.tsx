// Ocupa o lugar das fotos enquanto não houver Storage: fundo na cor da
// categoria com o ícone dela. Quando a foto existir, mostra a imagem.
import type { Foto } from "@acheaqui/types";

function variacao(semente: string): number {
  let soma = 0;
  for (const letra of semente) soma = (soma * 31 + letra.charCodeAt(0)) % 997;
  return soma;
}

export function FotoMarcador({
  foto,
  icone,
  cor,
  className = "",
  tamanhoIcone = "text-4xl",
}: {
  foto?: Foto;
  icone: string;
  cor: string;
  className?: string;
  tamanhoIcone?: string;
}) {
  const semente = variacao(foto?.id ?? icone);
  const angulo = 120 + (semente % 90);
  const claridade = 18 + (semente % 3) * 8;

  if (foto?.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto.url} alt={foto.legenda ?? ""} className={`object-cover ${className}`} />;
  }

  return (
    <div
      role="img"
      aria-label={foto?.legenda ?? "Foto ilustrativa"}
      className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(${angulo}deg, ${cor} 0%, color-mix(in srgb, ${cor} ${100 - claridade}%, white) 100%)`,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute -right-4 -bottom-6 size-24 rounded-full bg-white/15"
        style={{ transform: `scale(${1 + (semente % 5) / 4})` }}
      />
      <span aria-hidden="true" className={`relative drop-shadow-md ${tamanhoIcone}`}>
        {icone}
      </span>
    </div>
  );
}
