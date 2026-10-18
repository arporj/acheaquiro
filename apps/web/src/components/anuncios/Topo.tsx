import { destaqueExclusivo, nomeBairro, superDestaques } from "@/dados/consultas";
import { Cabecalho } from "../Cabecalho";
import { FaixaAnuncios } from "./FaixaAnuncios";

// Cabeçalho + Destaque Exclusivo do Mês + carrossel Super Destaque (item 4.1),
// presentes no topo de todas as páginas.
export function Topo({ pagina }: { pagina: "inicial" | "interna" }) {
  const exclusivo = destaqueExclusivo();
  const destaque = exclusivo && {
    item: exclusivo.item,
    descricao: exclusivo.anunciante.descricao,
    bairro: exclusivo.anunciante.tipo === "comercio" ? nomeBairro(exclusivo.anunciante.enderecos[0].bairroId) : "Rio das Ostras",
  };

  return (
    <>
      <Cabecalho comBusca={pagina === "interna"} />
      <FaixaAnuncios pagina={pagina} destaque={destaque} superDestaques={superDestaques()} />
    </>
  );
}
