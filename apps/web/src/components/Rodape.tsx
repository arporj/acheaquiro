import Link from "next/link";
import { Icone } from "@acheaqui/ui";
import { Logo } from "./Logo";

const links = [
  { href: "/sobre", rotulo: "Sobre o Ache Aqui RO" },
  { href: "/anuncie", rotulo: "Anuncie aqui" },
  { href: "/representante", rotulo: "Seja um representante" },
  { href: "/termos", rotulo: "Termos de Uso" },
  { href: "/privacidade", rotulo: "Política de Privacidade" },
];

export function Rodape() {
  return (
    <footer className="mt-auto bg-azul-900 text-white/80">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed">
            Os melhores profissionais e comércios de Rio das Ostras, num lugar só. Você fala direto com eles, pelo
            WhatsApp ou telefone.
          </p>
        </div>
        <nav aria-label="Institucional">
          <h2 className="mb-3 font-display text-lg font-bold text-amarelo-400">O Ache Aqui</h2>
          <ul className="space-y-2 text-sm">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white hover:underline">
                  {link.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-amarelo-400">Fale com o Ache Aqui</h2>
          <p className="mb-3 text-sm">Dúvidas sobre o site, sugestões ou parcerias.</p>
          <Link
            href="/contato"
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
          >
            <Icone nome="mensagem" className="size-4" />
            Fale com o Ache Aqui
          </Link>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs leading-relaxed text-white/60">
          O Ache Aqui RO apenas divulga os anunciantes. Não se responsabiliza pelos serviços prestados nem pelas
          negociações entre as partes. © 2026 Ache Aqui RO · Rio das Ostras, RJ
        </p>
      </div>
    </footer>
  );
}
