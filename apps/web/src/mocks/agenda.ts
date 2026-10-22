// DADOS FICTÍCIOS para o layout da Agenda. Artistas e eventos inventados. As
// datas são contadas a partir de hoje (diasDepoisDeHoje), para a demonstração
// nunca ficar com a Agenda vazia; src/dados/consultas.ts transforma em datas.
import type { Apresentacao, Artista, EventoAgenda } from "@acheaqui/types";

type Relativa<T extends { data: string }> = Omit<T, "data"> & { diasDepoisDeHoje: number };

export const artistas: Artista[] = [
  { id: "ar1", slug: "banda-mare-alta", nome: "Banda Maré Alta", estilo: "Pop rock", cor: "#2563EB", descricao: "Clássicos do pop rock nacional e internacional, de Legião a Coldplay.", instagram: "bandamarealta" },
  { id: "ar2", slug: "samba-da-praca", nome: "Samba da Praça", estilo: "Samba e pagode", cor: "#E8660C", descricao: "Roda de samba com repertório de raiz e pagode dos anos 90." },
  { id: "ar3", slug: "julia-voz-e-violao", nome: "Júlia Voz e Violão", estilo: "MPB", cor: "#D81B7A", descricao: "MPB e bossa nova em formato acústico." },
  { id: "ar4", slug: "trio-forro-do-litoral", nome: "Trio Forró do Litoral", estilo: "Forró", cor: "#15803D", descricao: "Sanfona, zabumba e triângulo: forró pé de serra para dançar." },
  { id: "ar5", slug: "dj-leo-batida", nome: "DJ Léo Batida", estilo: "DJ", cor: "#7E3FC4", descricao: "Flashback, sertanejo e eletrônico.", anuncianteId: "a18", instagram: "djleobatida" },
  { id: "ar6", slug: "rafa-sertanejo", nome: "Rafa Sertanejo", estilo: "Sertanejo", cor: "#9A5B2E", descricao: "Sertanejo universitário e modão." },
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
  // Já passaram: aparecem em "Shows anteriores" na página do artista.
  { id: "ap17", artistaId: "ar1", anuncianteId: "c21", diasDepoisDeHoje: -6, inicio: "21:00" },
  { id: "ap18", artistaId: "ar3", anuncianteId: "c21", diasDepoisDeHoje: -4, inicio: "20:00" },
  { id: "ap19", artistaId: "ar5", anuncianteId: "c20", diasDepoisDeHoje: -2, inicio: "17:00" },
];
