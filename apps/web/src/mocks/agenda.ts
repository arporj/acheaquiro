// DADOS FICTÍCIOS para o layout da Agenda. Artistas anunciantes (com perfil
// completo): Júlia Voz e Violão, Banda Maré Alta e DJ Léo Batida. Os outros só
// aparecem porque um bar os cadastrou, e então só com nome e estilo. Artistas e eventos inventados. As
// datas são contadas a partir de hoje (diasDepoisDeHoje), para a demonstração
// nunca ficar com a Agenda vazia; src/dados/consultas.ts transforma em datas.
import type { Apresentacao, Artista, EventoAgenda } from "@acheaqui/types";

type Relativa<T extends { data: string }> = Omit<T, "data"> & { diasDepoisDeHoje: number };

// Números inválidos de propósito, como nos anunciantes fictícios.
const zap = (n: number) => `55229000001${String(n).padStart(2, "0")}`;
const fotos = (prefixo: string, legendas: string[]) => legendas.map((legenda, i) => ({ id: `${prefixo}-${i + 1}`, legenda }));
// Fotos geradas por IA (FLUX.1 schnell, no Workers AI), em public/mock/fotos.
const foto = (id: string, legenda?: string) => ({ id, legenda, url: `/mock/fotos/${id}.webp` });
const video = (titulo: string) => ({ titulo, url: "https://exemplo.invalid/video" });

export const artistas: Artista[] = [
  {
    id: "ar1", slug: "banda-mare-alta", nome: "Banda Maré Alta", estilo: "Pop rock", cor: "#2563EB",
    descricao: "Clássicos do pop rock nacional e internacional, de Legião Urbana a Coldplay. Tocamos em bares, casamentos e festas de empresa, com som próprio.",
    formacao: "Voz, guitarra, baixo e bateria", atende: ["Bares e quiosques", "Casamentos", "Festas de empresa", "Aniversários"],
    anuncianteId: "a20", instagram: "bandamarealta", whatsapp: zap(1),
    foto: foto("ar1-perfil", "Banda Maré Alta"), capa: foto("ar1-capa", "Show ao pôr do sol"),
    galeria: fotos("ar1-g", ["Show no Quiosque Maré Cheia", "Festival de Inverno", "Casamento na praia", "Ensaio"]),
    videos: [video("Ao vivo no Festival de Inverno"), video("Medley pop rock anos 80")],
  },
  {
    id: "ar2", slug: "samba-da-praca", nome: "Samba da Praça", estilo: "Samba e pagode", cor: "#E8660C",
    descricao: "Roda de samba com repertório de raiz e pagode dos anos 90, toda sexta e sábado no Boteco da Praça.",
    formacao: "Voz, cavaquinho, pandeiro, surdo e tantã", atende: ["Bares e quiosques", "Aniversários", "Feijoadas"],
    whatsapp: zap(2), galeria: fotos("ar2-g", ["Roda no Boteco da Praça", "Feijoada de aniversário"]), videos: [video("Roda de samba ao vivo")],
  },
  {
    id: "ar3", slug: "julia-voz-e-violao", nome: "Júlia Voz e Violão", estilo: "MPB", cor: "#D81B7A",
    descricao: "MPB e bossa nova em formato acústico, para jantares, cerimônias e fins de tarde.",
    formacao: "Voz e violão", atende: ["Bares e quiosques", "Casamentos", "Jantares"],
    anuncianteId: "a19", instagram: "juliavozeviolao", whatsapp: zap(3),
    foto: foto("ar3-perfil", "Júlia"), capa: foto("ar3-capa", "Show acústico no quiosque"), galeria: [foto("ar3-g-1", "Pôr do sol no quiosque"), foto("ar3-g-2", "Cerimônia de casamento"), foto("ar3-g-3", "Show acústico")], videos: [video("Garota de Ipanema (acústico)")],
  },
  {
    id: "ar4", slug: "trio-forro-do-litoral", nome: "Trio Forró do Litoral", estilo: "Forró", cor: "#15803D",
    descricao: "Sanfona, zabumba e triângulo: forró pé de serra para dançar a noite toda.",
    formacao: "Sanfona, zabumba e triângulo", atende: ["Bares e quiosques", "Festas juninas", "Aniversários"],
    whatsapp: zap(4), galeria: fotos("ar4-g", ["Arraiá da praça", "Festival de Inverno"]), videos: [],
  },
  {
    id: "ar5", slug: "dj-leo-batida", nome: "DJ Léo Batida", estilo: "DJ", cor: "#7E3FC4",
    descricao: "Flashback, sertanejo e eletrônico, com som e iluminação próprios.",
    atende: ["Bares e quiosques", "Casamentos", "Aniversários", "Formaturas"],
    anuncianteId: "a18", instagram: "djleobatida", galeria: fotos("ar5-g", ["Pista lotada", "Equipamento", "Formatura"]), videos: [video("Set flashback")],
  },
  {
    id: "ar6", slug: "rafa-sertanejo", nome: "Rafa Sertanejo", estilo: "Sertanejo", cor: "#9A5B2E",
    descricao: "Sertanejo universitário e modão, em voz e violão ou com banda completa.",
    formacao: "Voz e violão, ou banda com 4 músicos", atende: ["Bares e quiosques", "Aniversários", "Rodeios"],
    whatsapp: zap(6), galeria: [], videos: [],
  },
];

export const eventos: Relativa<EventoAgenda>[] = [
  {
    id: "ev1",
    slug: "festival-de-inverno-da-praca",
    nome: "Festival de Inverno da Praça",
    descricao: "Um dia inteiro de música, comida e artesanato na Praça São Pedro, com entrada gratuita.",
    produtor: "Associação Cultural Litoral Vivo",
    local: "Praça São Pedro",
    bairroId: "centro",
    diasDepoisDeHoje: 3,
    barracas: [
      { nome: "Marmitas da Dona Cida", vende: "Caldos e comida caseira", anuncianteId: "a13" },
      { nome: "Pizzaria Bella Ostras", vende: "Pizza no forno a lenha", anuncianteId: "c06" },
      { nome: "Artes da Lu", vende: "Artesanato e bijuterias", anuncianteId: "a12" },
      { nome: "Churros do Tonho", vende: "Churros e doces", whatsapp: "5522900000098" },
      { nome: "Pastel da Feira", vende: "Pastel e caldo de cana" },
    ],
  },
];

export const apresentacoes: Relativa<Apresentacao>[] = [
  // Festival de Inverno da Praça
  { id: "ap01", artistaId: "ar3", eventoId: "ev1", diasDepoisDeHoje: 3, inicio: "14:00", fim: "15:30" },
  { id: "ap02", artistaId: "ar4", eventoId: "ev1", diasDepoisDeHoje: 3, inicio: "16:00", fim: "17:30" },
  { id: "ap03", artistaId: "ar1", eventoId: "ev1", diasDepoisDeHoje: 3, inicio: "18:00", fim: "20:00" },
  { id: "ap04", artistaId: "ar5", eventoId: "ev1", diasDepoisDeHoje: 3, inicio: "20:30", fim: "22:00" },
  // Quiosque Maré Cheia
  { id: "ap05", artistaId: "ar3", anuncianteId: "c20", diasDepoisDeHoje: 0, inicio: "19:00", fim: "22:00" },
  { id: "ap06", artistaId: "ar1", anuncianteId: "c20", diasDepoisDeHoje: 1, inicio: "20:00", fim: "23:00" },
  { id: "ap07", artistaId: "ar6", anuncianteId: "c20", diasDepoisDeHoje: 2, inicio: "20:00", fim: "23:30" },
  { id: "ap08", artistaId: "ar5", anuncianteId: "c20", diasDepoisDeHoje: 4, inicio: "16:00", fim: "19:00" },
  { id: "ap09", artistaId: "ar3", anuncianteId: "c20", diasDepoisDeHoje: 7, inicio: "19:00", fim: "22:00" },
  { id: "ap10", artistaId: "ar4", anuncianteId: "c20", diasDepoisDeHoje: 9, inicio: "20:00", fim: "23:00" },
  { id: "ap11", artistaId: "ar1", anuncianteId: "c20", diasDepoisDeHoje: 11, inicio: "20:00", fim: "23:00" },
  // Boteco da Praça
  { id: "ap12", artistaId: "ar2", anuncianteId: "c21", diasDepoisDeHoje: 1, inicio: "21:00" },
  { id: "ap13", artistaId: "ar2", anuncianteId: "c21", diasDepoisDeHoje: 2, inicio: "18:00", fim: "22:00" },
  { id: "ap14", artistaId: "ar6", anuncianteId: "c21", diasDepoisDeHoje: 5, inicio: "20:00" },
  { id: "ap15", artistaId: "ar2", anuncianteId: "c21", diasDepoisDeHoje: 8, inicio: "21:00" },
  { id: "ap16", artistaId: "ar5", anuncianteId: "c21", diasDepoisDeHoje: 12, inicio: "22:00" },
  // Mais à frente, para mostrar a navegação pelos meses do calendário.
  { id: "ap20", artistaId: "ar3", anuncianteId: "c20", diasDepoisDeHoje: 16, inicio: "19:00", fim: "22:00" },
  { id: "ap21", artistaId: "ar2", anuncianteId: "c21", diasDepoisDeHoje: 22, inicio: "21:00" },
  { id: "ap22", artistaId: "ar1", anuncianteId: "c20", diasDepoisDeHoje: 30, inicio: "20:00", fim: "23:00" },
  { id: "ap23", artistaId: "ar3", anuncianteId: "c21", diasDepoisDeHoje: 37, inicio: "20:00" },
  { id: "ap24", artistaId: "ar3", anuncianteId: "c20", diasDepoisDeHoje: 51, inicio: "19:00", fim: "22:00" },
  { id: "ap25", artistaId: "ar1", anuncianteId: "c20", diasDepoisDeHoje: 58, inicio: "21:00", fim: "00:00" },
  { id: "ap26", artistaId: "ar5", anuncianteId: "c21", diasDepoisDeHoje: 70, inicio: "23:00" },
  // Fora dos meses que a página leva pronta: o calendário busca em /agenda/mes.
  { id: "ap27", artistaId: "ar3", anuncianteId: "c20", diasDepoisDeHoje: 110, inicio: "19:00", fim: "22:00" },
  { id: "ap28", artistaId: "ar1", anuncianteId: "c21", diasDepoisDeHoje: -75, inicio: "21:00" },
  // Já passaram: aparecem em "Shows anteriores" na página do artista.
  { id: "ap17", artistaId: "ar1", anuncianteId: "c21", diasDepoisDeHoje: -6, inicio: "21:00" },
  { id: "ap18", artistaId: "ar3", anuncianteId: "c21", diasDepoisDeHoje: -4, inicio: "20:00" },
  { id: "ap19", artistaId: "ar5", anuncianteId: "c20", diasDepoisDeHoje: -2, inicio: "17:00" },
];
