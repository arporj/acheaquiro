// DADOS FICTÍCIOS para o layout. Bairros: lista inicial do item 4.13 da
// especificação, ainda a conferir pela equipe.
import type { Bairro, Cidade } from "@acheaqui/types";
import { paraSlug } from "@/lib/texto";

export const cidadeAtual: Cidade = {
  id: "rio-das-ostras",
  nome: "Rio das Ostras",
  uf: "RJ",
  slug: "rio-das-ostras",
};

const nomesBairros = [
  "Alphaville", "Área Rural de Rio das Ostras", "Atlântica", "Balneário das Garças",
  "Balneário Remanso", "Boca da Barra", "Bosque Beira Rio", "Bosque da Areia",
  "Bosque da Praia", "Cantagalo", "Cantinho do Mar", "Casa Grande", "Centro",
  "Chácara Mariléa", "Cidade Beira Mar", "Cidade Praiana", "Colinas",
  "Condomínio Porto Seguro", "Costazul", "Enseada das Gaivotas", "Extensão do Bosque",
  "Extensão Novo Rio das Ostras", "Fazenda Palmeiras", "Floresta das Gaivotas",
  "Gelson Apicelo", "Jardim Bela Vista", "Jardim Campomar", "Jardim Mariléa",
  "Jardim Miramar", "Jardim Patrícia", "Liberdade", "Loteamento Extensão do Serramar",
  "Mar do Norte", "Maria Turri", "Mar Y Lago", "Nova Aliança", "Nova Cidade",
  "Nova Esperança", "Novo Rio das Ostras", "Operário", "Ouro Verde", "Palmital",
  "Parque São Jorge", "Parque Zabulão", "Peroba", "Praia Mar", "Recanto", "Recreio",
  "Reduto da Paz", "Residencial Camping do Bosque", "Residencial Praia Âncora",
  "Residencial Rio das Ostras", "Rocha Leão", "São Cristóvão", "Serramar",
  "Sobradinho Cerveja", "Terra Firme", "Terras do Contorno", "Verdes Mares", "Vila Real",
  "Village Rio das Ostras", "Village Sol e Mar", "Viverde I", "Viverde II", "Viverde III",
  "Zona Zen",
];

export const bairros: Bairro[] = nomesBairros.map((nome) => ({
  id: paraSlug(nome),
  cidadeId: cidadeAtual.id,
  nome,
}));
