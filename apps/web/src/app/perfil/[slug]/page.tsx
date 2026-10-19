import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EtiquetaAberto, EtiquetaFundador, FotoMarcador, Icone, IconeCategoria, Selo } from "@acheaqui/ui";
import type { Anunciante, AnuncianteComercio, AnuncianteProfissional, Categoria, FormaPagamento } from "@acheaqui/types";
import { Topo } from "@/components/anuncios/Topo";
import { BotaoCompartilhar } from "@/components/BotaoCompartilhar";
import { BarraContato, CartaoContato } from "@/components/perfil/BotoesContato";
import { BotaoDenunciar } from "@/components/perfil/BotaoDenunciar";
import { Horario } from "@/components/perfil/Horario";
import { Secao } from "@/components/perfil/Secao";
import { anunciantePorSlug, categoriaPorId, listarSlugsAnunciantes, nomeBairro, planoPorId, situacaoComercio } from "@/dados/consultas";
import { formatarPreco, linkComoChegar } from "@/lib/contato";

export function generateStaticParams() {
  return listarSlugsAnunciantes().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/perfil/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const anunciante = anunciantePorSlug(slug);
  if (!anunciante) return {};
  const categoria = categoriaPorId(anunciante.categoriaId);
  return {
    title: `${anunciante.nome} · ${categoria?.nome ?? ""}`,
    description: anunciante.descricao.slice(0, 155),
    openGraph: { title: anunciante.nome, description: `${categoria?.nome} em Rio das Ostras` },
  };
}

const rotulosPagamento: Record<FormaPagamento, string> = { pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro" };

function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export default async function PaginaPerfil({ params }: PageProps<"/perfil/[slug]">) {
  const { slug } = await params;
  const anunciante = anunciantePorSlug(slug);
  if (!anunciante) notFound();

  const categoria = categoriaPorId(anunciante.categoriaId)!;
  const adicionais = anunciante.categoriasAdicionais.map(categoriaPorId).filter((c): c is Categoria => Boolean(c));
  const selo = planoPorId(anunciante.planoId)?.selo ?? "nenhum";
  const situacao = anunciante.tipo === "comercio" ? situacaoComercio(anunciante.id) : undefined;

  return (
    <>
      <Topo pagina="interna" />
      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 lg:pb-12">
        <nav aria-label="Você está em" className="flex flex-wrap items-center gap-1 text-sm font-semibold text-slate-500">
          <Link href="/" className="hover:text-azul-600">
            Início
          </Link>
          <Icone nome="direita" className="size-3.5" />
          <Link href={`/${categoria.slugLista}`} className="hover:text-azul-600">
            {categoria.nomePlural}
          </Link>
          <Icone nome="direita" className="size-3.5" />
          <span className="text-tinta">{anunciante.nome}</span>
        </nav>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
              <FotoMarcador
                foto={anunciante.galeria[0]}
                icone={categoria.icone}
                cor={categoria.cor}
                className="h-32 w-full sm:h-48"
                tamanhoIcone="text-6xl sm:text-7xl"
              />
              <div className="px-5 pb-5 sm:px-6">
                <div className="flex items-end justify-between gap-3">
                  <FotoMarcador
                    foto={anunciante.fotoPerfil}
                    icone={categoria.icone}
                    cor={categoria.cor}
                    className={`-mt-12 size-24 shrink-0 ring-4 ring-white sm:size-28 ${
                      anunciante.tipo === "profissional" ? "rounded-full" : "rounded-2xl"
                    }`}
                    tamanhoIcone="text-4xl"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-1 pt-2">
                    <BotaoCompartilhar caminho={`/perfil/${anunciante.slug}`} titulo={anunciante.nome} variante="botao" />
                    <BotaoDenunciar nomeAnunciante={anunciante.nome} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {anunciante.fundador && <EtiquetaFundador />}
                  {situacao && <EtiquetaAberto aberto={situacao.abertoAgora} />}
                </div>
                <h1 className="mt-1 font-display text-3xl leading-tight font-extrabold text-azul-900 sm:text-4xl">
                  {anunciante.nome} <Selo selo={selo} className="align-[-0.05em] text-2xl" />
                </h1>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[categoria, ...adicionais].map((c, i) => (
                    <Link
                      key={c.id}
                      href={`/${c.slugLista}`}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${
                        i === 0 ? "bg-azul-600 text-white" : "bg-azul-50 text-azul-700 hover:bg-azul-100"
                      }`}
                    >
                      <IconeCategoria nome={c.icone} className="size-4" />
                      {c.nome}
                    </Link>
                  ))}
                </div>
                <Local anunciante={anunciante} />
                {anunciante.registroConselho && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-zap-50 px-3 py-1.5 text-sm font-bold text-zap-700">
                    <Icone nome="escudo" className="size-4" />
                    {anunciante.registroConselho}
                  </p>
                )}
              </div>
            </section>

            <Secao titulo="Sobre">
              <p className="leading-relaxed text-slate-700">{anunciante.descricao}</p>
            </Secao>

            {anunciante.tipo === "comercio" ? (
              <ConteudoComercio anunciante={anunciante} categoria={categoria} />
            ) : (
              <ConteudoProfissional anunciante={anunciante} categoria={categoria} />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Secao titulo={anunciante.tipo === "comercio" ? "Horário de funcionamento" : "Horário de atendimento"}>
                <Horario horario={anunciante.horario} />
              </Secao>
              <Secao titulo="Pagamento e redes">
                <ul className="flex flex-wrap gap-1.5">
                  {anunciante.formasPagamento.map((forma) => (
                    <li key={forma} className="inline-flex items-center gap-1 rounded-full bg-fundo px-3 py-1 text-sm font-bold">
                      <Icone nome="cartao" className="size-4 text-azul-600" />
                      {rotulosPagamento[forma]}
                    </li>
                  ))}
                </ul>
                {anunciante.instagram && (
                  <a
                    href={`https://instagram.com/${anunciante.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 font-bold text-[#C2185B] hover:underline"
                  >
                    <Icone nome="instagram" className="size-5" />@{anunciante.instagram}
                  </a>
                )}
                {anunciante.tipo === "comercio" && anunciante.siteProprio && (
                  <a
                    href={anunciante.siteProprio}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-2 font-bold text-azul-600 hover:underline"
                  >
                    <Icone nome="link" className="size-5" />
                    Cardápio, loja ou site
                  </a>
                )}
              </Secao>
            </div>
          </div>

          <aside className="hidden lg:sticky lg:top-4 lg:block">
            <CartaoContato anunciante={anunciante} />
          </aside>
        </div>
      </main>
      <BarraContato anunciante={anunciante} />
    </>
  );
}

function Local({ anunciante }: { anunciante: Anunciante }) {
  const texto =
    anunciante.tipo === "profissional"
      ? anunciante.atendeTodaCidade
        ? "Atende toda a cidade"
        : `Atende: ${anunciante.bairrosAtendidos.map(nomeBairro).join(", ")}`
      : anunciante.enderecos
          .map((e) => `${e.logradouro}, ${e.numero} · ${nomeBairro(e.bairroId)}`)
          .join("  |  ");
  return (
    <p className="mt-3 flex items-start gap-1.5 text-slate-600">
      <Icone nome="pin" className="mt-1 size-4 shrink-0 text-vermelho-500" />
      {texto}
    </p>
  );
}

function ConteudoProfissional({ anunciante, categoria }: { anunciante: AnuncianteProfissional; categoria: Categoria }) {
  return (
    <>
      {anunciante.galeria.length > 0 && (
        <Secao titulo="Fotos dos trabalhos" extra={<span className="text-sm font-bold text-slate-400">{anunciante.galeria.length} fotos</span>}>
          <Galeria fotos={anunciante.galeria} categoria={categoria} />
        </Secao>
      )}
      {anunciante.antesDepois.length > 0 && (
        <Secao titulo="Antes e depois">
          <div className="space-y-4">
            {anunciante.antesDepois.map((par) => (
              <figure key={par.id}>
                <div className="grid grid-cols-2 gap-1.5 overflow-hidden rounded-2xl">
                  {[
                    { foto: par.antes, rotulo: "Antes", cor: "#64748B" },
                    { foto: par.depois, rotulo: "Depois", cor: categoria.cor },
                  ].map((lado) => (
                    <div key={lado.rotulo} className="relative">
                      <FotoMarcador foto={lado.foto} icone={categoria.icone} cor={lado.cor} className="aspect-[4/3] w-full" />
                      <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-extrabold text-white uppercase">
                        {lado.rotulo}
                      </span>
                    </div>
                  ))}
                </div>
                <figcaption className="mt-2 text-sm font-semibold text-slate-600">{par.legenda}</figcaption>
              </figure>
            ))}
          </div>
        </Secao>
      )}
    </>
  );
}

function ConteudoComercio({ anunciante, categoria }: { anunciante: AnuncianteComercio; categoria: Categoria }) {
  return (
    <>
      {anunciante.encartes.length > 0 && (
        <Secao titulo="Ofertas" extra={<Icone nome="etiqueta" className="size-5 text-vermelho-500" />}>
          <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {anunciante.encartes.map((encarte) => (
              <li key={encarte.id} className="w-56 shrink-0 snap-start">
                <div className="relative overflow-hidden rounded-2xl ring-1 ring-black/5">
                  <FotoMarcador foto={encarte.imagem} icone="tag" cor="#E5262B" className="aspect-[3/4] w-full" tamanhoIcone="text-5xl" />
                  <span className="absolute top-2 right-2 rounded-full bg-amarelo-400 px-2.5 py-0.5 text-xs font-extrabold text-azul-900">
                    Até {dataCurta(encarte.validoAte)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-bold">{encarte.titulo}</p>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {anunciante.produtos.length > 0 && (
        <Secao titulo="Vitrine" extra={<Icone nome="sacola" className="size-5 text-azul-600" />}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {anunciante.produtos.map((produto) => (
              <li key={produto.id} className="overflow-hidden rounded-2xl bg-fundo">
                <FotoMarcador foto={produto.foto} icone={categoria.icone} cor={categoria.cor} className="aspect-square w-full" tamanhoIcone="text-3xl" />
                <div className="p-2.5">
                  <p className="line-clamp-2 text-sm leading-snug font-bold">{produto.nome}</p>
                  {produto.descricao && <p className="text-xs text-slate-500">{produto.descricao}</p>}
                  <p className="mt-1 font-display text-lg font-extrabold text-vermelho-600">{formatarPreco(produto.preco)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {anunciante.galeria.length > 0 && (
        <Secao titulo="Fotos do espaço">
          <Galeria fotos={anunciante.galeria} categoria={categoria} />
        </Secao>
      )}

      <Secao titulo={anunciante.enderecos.length > 1 ? "Nossas lojas" : "Endereço"}>
        <div className="space-y-4">
          {anunciante.enderecos.map((endereco) => (
            <div key={endereco.id}>
              <div
                className="relative grid h-44 place-items-center overflow-hidden rounded-2xl bg-[#e6efe1]"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #fff 0 6px, transparent 6px), linear-gradient(0deg, #fff 0 6px, transparent 6px), linear-gradient(35deg, transparent 48%, #fde68a 48% 52%, transparent 52%)",
                  backgroundSize: "70px 70px, 90px 90px, 100% 100%",
                }}
                role="img"
                aria-label="Mapa ilustrativo"
              >
                <Icone nome="pin" className="size-11 fill-vermelho-500 text-white drop-shadow-lg" strokeWidth={1.5} />
                <span className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-0.5 text-[0.7rem] font-bold text-slate-500">
                  Mapa ilustrativo
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {endereco.logradouro}, {endereco.numero} · {nomeBairro(endereco.bairroId)}
                </p>
                <a
                  href={linkComoChegar(endereco.latitude, endereco.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-extrabold text-azul-600 hover:underline"
                >
                  <Icone nome="rota" className="size-4" />
                  Como chegar
                </a>
              </div>
            </div>
          ))}
        </div>
        {anunciante.entrega && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-azul-50 px-3 py-2.5 text-sm text-azul-900">
            <Icone nome="entrega" className="mt-0.5 size-5 shrink-0" />
            <span>
              <strong>Faz entrega</strong>{" "}
              {anunciante.entrega.todaCidade
                ? "em toda a cidade."
                : `nos bairros: ${anunciante.entrega.bairros.map(nomeBairro).join(", ")}.`}
            </span>
          </p>
        )}
      </Secao>
    </>
  );
}

function Galeria({ fotos, categoria }: { fotos: Anunciante["galeria"]; categoria: Categoria }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {fotos.map((foto) => (
        <li key={foto.id} className="group relative overflow-hidden rounded-2xl">
          <FotoMarcador foto={foto} icone={categoria.icone} cor={categoria.cor} className="aspect-square w-full" />
          {foto.legenda && (
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-6 pb-2 text-xs font-bold text-white">
              {foto.legenda}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
