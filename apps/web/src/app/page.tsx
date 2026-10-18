import Link from "next/link";
import { Icone, classesBotao } from "@acheaqui/ui";
import { Topo } from "@/components/anuncios/Topo";
import { FormBusca } from "@/components/FormBusca";
import { categoriasAtalho, categoriasPorGrupo } from "@/dados/consultas";

const buscasPopulares = ["Diarista", "Pizza", "Bombeiro hidráulico", "Farmácia", "Pet shop", "Marmita"];

// Estrela de 16 pontas do selo "R$ 1,99" do flyer.
const pontasEstrela = Array.from({ length: 32 }, (_, i) => {
  const angulo = (Math.PI * 2 * i) / 32 - Math.PI / 2;
  const raio = i % 2 === 0 ? 50 : 42;
  return `${(50 + raio * Math.cos(angulo)).toFixed(1)}% ${(50 + raio * Math.sin(angulo)).toFixed(1)}%`;
}).join(", ");

export default function PaginaInicial() {
  return (
    <>
      <Topo pagina="inicial" />

      <main>
        <section className="fundo-raios mt-4 text-white">
          <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
            <h1 className="max-w-3xl font-display text-[2rem] leading-[1.05] font-extrabold sm:text-5xl">
              Aqui você encontra os melhores <span className="text-amarelo-400">profissionais e serviços</span> de Rio
              das Ostras!
            </h1>
            <p className="mt-3 max-w-xl text-lg text-white/85">
              Busque, escolha e fale direto pelo WhatsApp. Sem cadastro, sem complicação.
            </p>
            <div className="mt-6 max-w-4xl">
              <FormBusca variante="destaque" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-white/70">Mais buscados:</span>
              {buscasPopulares.map((termo) => (
                <Link
                  key={termo}
                  href={`/busca?q=${encodeURIComponent(termo)}`}
                  className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold text-white hover:bg-white/25"
                >
                  {termo}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="categorias" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="font-display text-3xl font-extrabold text-azul-900">O que você procura?</h2>
            <a href="#todas" className="shrink-0 text-sm font-extrabold text-azul-600 hover:underline">
              Ver todas
            </a>
          </div>
          <ul className="grid grid-cols-3 gap-2.5 sm:gap-3 md:grid-cols-5">
            {categoriasAtalho().map((categoria) => (
              <li key={categoria.id}>
                <Link
                  href={`/${categoria.slugLista}`}
                  className="group relative flex aspect-square flex-col overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-xl sm:aspect-[5/4]"
                  style={{ backgroundColor: categoria.cor }}
                >
                  <span className="absolute -top-6 -right-6 size-20 rounded-full bg-white/20" aria-hidden="true" />
                  <span className="grid flex-1 place-items-center text-4xl drop-shadow-md transition group-hover:scale-110 sm:text-5xl" aria-hidden="true">
                    {categoria.icone}
                  </span>
                  <span className="bg-black/25 px-1.5 py-1.5 text-center font-display text-[0.8rem] leading-tight font-bold text-white sm:text-base">
                    {categoria.nome}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white py-10">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="mb-6 font-display text-3xl font-extrabold text-azul-900">Como funciona</h2>
            <ol className="grid gap-4 md:grid-cols-3">
              {[
                { icone: "busca", titulo: "Busque", texto: "Digite o que precisa ou toque numa categoria. Escolha o bairro, se quiser." },
                { icone: "estrela", titulo: "Escolha", texto: "Veja fotos dos trabalhos, bairros atendidos e horários de cada anunciante." },
                { icone: "mensagem", titulo: "Fale direto", texto: "Peça orçamento pelo WhatsApp ou ligue. A negociação é direto com o anunciante." },
              ].map((passo, i) => (
                <li key={passo.titulo} className="flex gap-4 rounded-3xl bg-fundo p-5">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-azul-600 font-display text-2xl font-extrabold text-amarelo-400">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-bold text-azul-900">{passo.titulo}</h3>
                    <p className="text-slate-600">{passo.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="relative overflow-hidden rounded-[2rem] bg-tinta px-6 py-8 text-white md:px-10 md:py-10">
            <div className="relative z-10 max-w-xl">
              <p className="font-display text-lg font-bold text-amarelo-400">Você é profissional ou tem um comércio?</p>
              <h2 className="mt-1 font-display text-4xl leading-none font-extrabold md:text-5xl">
                Seu serviço <span className="text-amarelo-400">mais visível!</span>
              </h2>
              <ul className="mt-5 space-y-1.5 text-lg font-semibold">
                {["Mais clientes", "Mais oportunidades", "Mais resultados"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Icone nome="certo" className="size-6 text-amarelo-400" strokeWidth={3} />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-white/75">É fácil, rápido e você chega até mais clientes.</p>
              <Link href="/anuncie" className={classesBotao("amarelo", "g", "mt-6")}>
                <Icone nome="megafone" className="size-5" />
                Quero anunciar
              </Link>
            </div>
            <div
              className="mt-8 grid size-44 place-items-center bg-vermelho-500 text-center text-white md:absolute md:top-1/2 md:right-12 md:mt-0 md:size-60 md:-translate-y-1/2 md:rotate-6"
              style={{ clipPath: `polygon(${pontasEstrela})` }}
            >
              <div className="leading-none">
                <p className="text-xs font-extrabold uppercase md:text-sm">Profissional,</p>
                <p className="text-xs font-extrabold uppercase md:text-sm">a partir de</p>
                <p className="font-display text-5xl font-extrabold text-amarelo-400 md:text-6xl">R$ 1,99</p>
                <p className="text-xs font-bold md:text-sm">por mês</p>
              </div>
            </div>
            <span className="absolute -top-20 -left-20 size-64 rounded-full bg-azul-600/40 blur-2xl" aria-hidden="true" />
          </div>
        </section>

        <section id="todas" className="mx-auto max-w-6xl scroll-mt-4 px-4 pb-14">
          <h2 className="mb-5 font-display text-3xl font-extrabold text-azul-900">Todas as categorias</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {categoriasPorGrupo().map(({ grupo, categorias }) => (
              <details key={grupo} className="group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-display text-lg font-bold text-azul-900">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true">{categorias[0].icone}</span>
                    {grupo}
                    <span className="text-sm font-semibold text-slate-400">({categorias.length})</span>
                  </span>
                  <Icone nome="abaixo" className="size-5 text-slate-400 transition group-open:rotate-180" />
                </summary>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {categorias.map((categoria) => (
                    <li key={categoria.id}>
                      <Link
                        href={`/${categoria.slugLista}`}
                        className="inline-flex items-center gap-1 rounded-full bg-fundo px-3 py-1 text-sm font-semibold text-tinta hover:bg-azul-50 hover:text-azul-700"
                      >
                        <span aria-hidden="true">{categoria.icone}</span>
                        {categoria.nome}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
