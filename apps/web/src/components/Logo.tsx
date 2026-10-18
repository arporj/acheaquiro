import Link from "next/link";

// Logotipo provisório, até a identidade visual ser criada.
export function Logo({ tamanho = "m" }: { tamanho?: "m" | "g" }) {
  const grande = tamanho === "g";
  return (
    <Link href="/" className="group inline-flex items-center gap-2" aria-label="Ache Aqui RO, página inicial">
      <svg viewBox="0 0 32 40" className={grande ? "h-12 w-auto" : "h-9 w-auto"} aria-hidden="true">
        <path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 39 16 39s15-12 15-23.2C31 7.6 24.3 1 16 1Z" fill="#E5262B" stroke="#fff" strokeWidth="2" />
        <circle cx="16" cy="15.5" r="6.5" fill="#fff" />
      </svg>
      <span className={`font-display leading-none font-extrabold tracking-tight ${grande ? "text-4xl" : "text-[1.7rem]"}`}>
        <span className="text-white">Ache </span>
        <span className="text-amarelo-400">Aqui</span>
      </span>
      <span
        className={`rounded-md bg-amarelo-400 font-display font-extrabold text-azul-900 ${
          grande ? "px-1.5 text-xl" : "px-1 text-sm"
        }`}
      >
        RO
      </span>
    </Link>
  );
}
