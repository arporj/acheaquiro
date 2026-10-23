// Importação dos comércios de Rio das Ostras pelos dados abertos do CNPJ.
// Uso (da raiz do repositório), depois de baixar.sh:
//   node --env-file=apps/web/.env.local scripts/importar-cnpj/importar.mjs <etapa> <pasta> <AAAA-MM>
// Etapas, nesta ordem:
//   mapa          grava em cnae_categoria os CNAEs da cidade que ainda não estão lá (mapa-cnae.mjs)
//   preparar      aplica as regras e gera saida/comercios.json e as listas para revisão (não grava no banco)
//   geocodificar  busca a coordenada de cada endereço no Nominatim (OpenStreetMap), 1 consulta por segundo
//   enviar        grava os comércios novos no banco (o CNPJ já importado é pulado)
// A pasta guarda telefone e e-mail da Receita: fica fora do repositório.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { categoriaDoCnae, ajustarPeloNome } from "./mapa-cnae.mjs";

const [etapa, pastaBase, mes] = process.argv.slice(2);
if (!etapa || !pastaBase || !/^\d{4}-\d{2}$/.test(mes ?? "")) {
  console.error("Uso: importar.mjs <mapa|preparar|geocodificar|enviar> <pasta> <AAAA-MM>");
  process.exit(1);
}
const pasta = join(pastaBase, mes);
const saida = join(pasta, "saida");
mkdirSync(saida, { recursive: true });

const url = process.env.PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error("Faltam PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (rode com --env-file=apps/web/.env.local).");
  process.exit(1);
}
const banco = createClient(url, chave, { auth: { persistSession: false } });

const CIDADE_SLUG = "rio-das-ostras";
// Natureza jurídica 213-5: empresário individual (nome da pessoa). Órgãos públicos: 1xxx.
const NATUREZA_EMPRESARIO_INDIVIDUAL = "2135";

/** Órgão público entra no grupo próprio (decisão de 23/10/2026), pela atividade. */
function categoriaDoOrgaoPublico(cnae) {
  if (cnae.startsWith("85")) return "escolas-publicas";
  if (cnae.startsWith("86")) return "saude-publica";
  return "orgaos-publicos";
}

// ---------------------------------------------------------------------------
// Leitura dos arquivos da Receita
// ---------------------------------------------------------------------------

/** Linha "a";"b";"c" → ["a", "b", "c"]. */
function campos(linha) {
  return linha.replace(/^"/, "").replace(/"\r?$/, "").split('";"');
}

function lerLinhas(prefixo) {
  const arquivos = readdirSync(pasta).filter((a) => a.startsWith(prefixo) && a.endsWith(".csv"));
  if (arquivos.length === 0) throw new Error(`Nenhum arquivo ${prefixo}*.csv em ${pasta}. Rode baixar.sh antes.`);
  return arquivos.flatMap((a) => readFileSync(join(pasta, a), "utf8").split("\n").filter(Boolean).map(campos));
}

function normalizar(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function paraSlug(texto) {
  return normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
}

const PALAVRAS_MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para", "com"]);
const SIGLAS = new Set(["ltda", "me", "epp", "s/a", "sa", "rj", "ii", "iii", "iv", "tv", "ti", "dj", "pet", "cia"]);

/** "PADARIA DO JOAO" → "Padaria do Joao". */
function nomeBonito(texto) {
  return normalizarEspacos(texto)
    .toLowerCase()
    .split(" ")
    .map((p, i) => {
      if (i > 0 && PALAVRAS_MINUSCULAS.has(p)) return p;
      if (SIGLAS.has(p) && p !== "pet") return p.toUpperCase();
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

function normalizarEspacos(texto) {
  return texto.replace(/\s+/g, " ").trim();
}

/** Tira o tipo societário do fim da razão social. */
function semTipoSocietario(razao) {
  let r = normalizarEspacos(razao);
  for (;;) {
    const antes = r;
    r = r.replace(/[\s\-.,]+(LTDA|EIRELI|S\/?A|S\.A\.?|ME|EPP|SLU|SS|SIMPLES|LIMITADA)\.?$/i, "").trim();
    if (r === antes) return r;
  }
}

function telefone(ddd, numero) {
  const t = `${ddd}${numero}`.replace(/\D/g, "");
  return t.length >= 10 && t.length <= 11 ? t : null;
}

/** O Supabase devolve no máximo 1.000 linhas por consulta: lê todas as páginas. */
async function lerTudo(montarConsulta) {
  const linhas = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await montarConsulta().range(inicio, inicio + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

async function carregarCatalogo() {
  const { data: cidade, error: e1 } = await banco.from("cidades").select("id").eq("slug", CIDADE_SLUG).single();
  if (e1) throw e1;
  const { data: categorias, error: e2 } = await banco.from("categorias").select("id, slug_lista").eq("cidade_id", cidade.id);
  if (e2) throw e2;
  const { data: bairros, error: e3 } = await banco.from("bairros").select("id, nome").eq("cidade_id", cidade.id);
  if (e3) throw e3;
  // Bairros da Receita escritos de outro jeito, resolvidos na administração (/admin/bairros-importacao).
  const { data: apelidos, error: e4 } = await banco.from("apelidos_bairro").select("nome_receita, bairro_id, ignorar").eq("cidade_id", cidade.id);
  if (e4) throw e4;
  return {
    cidadeId: cidade.id,
    categoriaPorSlug: new Map(categorias.map((c) => [c.slug_lista, c.id])),
    slugPorCategoria: new Map(categorias.map((c) => [c.id, c.slug_lista])),
    bairroPorNome: new Map(bairros.map((b) => [normalizar(b.nome), b.id])),
    nomeDoBairro: new Map(bairros.map((b) => [b.id, b.nome])),
    apelidos: new Map(apelidos.map((a) => [a.nome_receita, a])),
  };
}


function lerJson(arquivo, padrao) {
  const caminho = join(saida, arquivo);
  return existsSync(caminho) ? JSON.parse(readFileSync(caminho, "utf8")) : padrao;
}

function gravarJson(arquivo, dados) {
  writeFileSync(join(saida, arquivo), JSON.stringify(dados, null, 1));
}

function gravarCsv(arquivo, linhas) {
  const texto = linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  writeFileSync(join(saida, arquivo), "﻿" + texto);
}

// ---------------------------------------------------------------------------
// Etapa mapa
// ---------------------------------------------------------------------------

async function etapaMapa() {
  const { cidadeId, categoriaPorSlug } = await carregarCatalogo();
  const descricoes = new Map(lerLinhas("Cnaes").map(([c, d]) => [c, d]));
  const usados = new Set();
  for (const e of lerLinhas("estabelecimentos")) {
    if (e[5] !== "02") continue;
    usados.add(e[11]);
    for (const s of e[12].split(",").filter(Boolean)) usados.add(s);
  }
  const existentes = await lerTudo(() => banco.from("cnae_categoria").select("cnae").eq("cidade_id", cidadeId).order("cnae"));
  const jaGravados = new Set(existentes.map((r) => r.cnae));

  const novos = [];
  const semRegra = [];
  for (const cnae of [...usados].sort()) {
    if (jaGravados.has(cnae)) continue;
    const slug = categoriaDoCnae(cnae);
    if (slug === undefined) {
      semRegra.push([cnae, descricoes.get(cnae) ?? ""]);
      continue;
    }
    if (slug !== null && !categoriaPorSlug.has(slug)) throw new Error(`Categoria ${slug} (CNAE ${cnae}) não existe no banco.`);
    novos.push({ cidade_id: cidadeId, cnae, descricao: descricoes.get(cnae) ?? cnae, categoria_id: slug ? categoriaPorSlug.get(slug) : null });
  }
  for (let i = 0; i < novos.length; i += 500) {
    const { error: e } = await banco.from("cnae_categoria").insert(novos.slice(i, i + 500));
    if (e) throw e;
  }
  gravarCsv("cnaes_sem_regra.csv", [["cnae", "descricao"], ...semRegra]);
  console.log(`CNAEs gravados: ${novos.length}. Sem regra (ficam fora até entrar no mapa): ${semRegra.length}, em saida/cnaes_sem_regra.csv.`);
}

// ---------------------------------------------------------------------------
// Etapa preparar
// ---------------------------------------------------------------------------

async function etapaPreparar() {
  const { cidadeId, categoriaPorSlug, slugPorCategoria, bairroPorNome, nomeDoBairro, apelidos } = await carregarCatalogo();
  const { data: bloqueados, error: eBloqueados } = await banco.from("cnpjs_bloqueados").select("cnpj").eq("cidade_id", cidadeId);
  if (eBloqueados) throw eBloqueados;
  const cnpjsBloqueados = new Set(bloqueados.map((b) => b.cnpj));
  const mapa = await lerTudo(() => banco.from("cnae_categoria").select("cnae, categoria_id").eq("cidade_id", cidadeId).order("cnae"));
  const categoriaDoMapa = new Map(mapa.map((m) => [m.cnae, m.categoria_id]));

  const empresas = new Map(lerLinhas("empresas").map((e) => [e[0], { razao: e[1], natureza: e[2] }]));
  const mei = new Set(lerLinhas("simples").filter((s) => s[4] === "S").map((s) => s[0]));

  const contagem = { ativos: 0, bloqueados: 0, mei: 0, empresario_individual: 0, orgao_publico: 0, sem_empresa: 0, cnae_fora: 0, sem_bairro: 0, prontos: 0 };
  const comercios = [];
  const semBairro = [];
  const espera = [];
  const slugsUsados = new Set();

  for (const e of lerLinhas("estabelecimentos")) {
    if (e[5] !== "02") continue;
    contagem.ativos++;
    const basico = e[0];
    if (cnpjsBloqueados.has(`${basico}${e[1]}${e[2]}`)) { contagem.bloqueados++; continue; }
    const empresa = empresas.get(basico);
    if (!empresa) { contagem.sem_empresa++; continue; }
    if (mei.has(basico)) { contagem.mei++; continue; }
    if (empresa.natureza === NATUREZA_EMPRESARIO_INDIVIDUAL) { contagem.empresario_individual++; continue; }
    const publico = empresa.natureza.startsWith("1");
    if (publico) contagem.orgao_publico++;

    const categoriaId = publico ? categoriaPorSlug.get(categoriaDoOrgaoPublico(e[11])) : categoriaDoMapa.get(e[11]);
    if (!categoriaId) { contagem.cnae_fora++; continue; }

    const razao = normalizarEspacos(empresa.razao);
    const nome = nomeBonito(e[4] ? e[4] : semTipoSocietario(razao)).slice(0, 100);
    if (nome.length < 2) { contagem.cnae_fora++; continue; }
    const slugCategoria = publico ? slugPorCategoria.get(categoriaId) : ajustarPeloNome(slugPorCategoria.get(categoriaId), normalizar(`${e[4]} ${razao}`));
    const categoriaFinal = categoriaPorSlug.get(slugCategoria);

    const bairroReceita = normalizarEspacos(e[17]);
    const nomeReceita = normalizar(bairroReceita).slice(0, 100) || "(vazio)";
    const apelido = apelidos.get(nomeReceita);
    const bairroId = apelido?.ignorar ? undefined : (apelido?.bairro_id ?? bairroPorNome.get(nomeReceita));
    const nomeBairro = nomeDoBairro.get(bairroId) ?? bairroReceita;
    const cnpj = `${basico}${e[1]}${e[2]}`;
    const numero = normalizarEspacos(e[15]).toUpperCase();
    const comercio = {
      cnpj,
      nome,
      categoria_id: categoriaFinal,
      endereco: {
        logradouro: nomeBonito(`${e[13]} ${e[14]}`).slice(0, 120),
        numero: (/^(S\/?N|SN|0+)?$/.test(numero) ? "S/N" : numero).slice(0, 10),
        complemento: e[16] ? nomeBonito(e[16]).slice(0, 60) : null,
        bairro_id: bairroId,
        bairro: nomeBairro,
        cep: e[18],
      },
      receita: {
        razao_social: razao.slice(0, 200),
        nome_fantasia: e[4] ? normalizarEspacos(e[4]).slice(0, 200) : null,
        telefones: [telefone(e[21], e[22]), telefone(e[23], e[24])].filter(Boolean),
        email: e[27] ? e[27].toLowerCase().slice(0, 254) : null,
        cnae_principal: e[11],
        cnaes_secundarios: e[12].split(",").filter(Boolean),
        abertura: /^\d{8}$/.test(e[10]) ? `${e[10].slice(0, 4)}-${e[10].slice(4, 6)}-${e[10].slice(6)}` : null,
        bairro_receita: bairroReceita.slice(0, 100) || null,
      },
    };

    // Sem bairro (pendente ou deixado de fora): vai para a espera, publicada pelo
    // banco quando a administração ligar o nome a um bairro.
    if (!bairroId) {
      contagem.sem_bairro++;
      espera.push({ ...comercio, slug: paraSlug(nome), nome_receita: nomeReceita });
      if (!apelido?.ignorar) {
        semBairro.push({ bairro: bairroReceita, nome, endereco: `${comercio.endereco.logradouro}, ${comercio.endereco.numero}`, cep: e[18] });
      }
      continue;
    }

    // Slug único na cidade: nome; se repetir, nome + bairro; depois um número.
    let slug = paraSlug(nome);
    if (slugsUsados.has(slug)) slug = paraSlug(`${nome} ${nomeBairro}`);
    for (let n = 2; slugsUsados.has(slug); n++) slug = `${paraSlug(`${nome} ${nomeBairro}`).slice(0, 75)}-${n}`;
    slugsUsados.add(slug);
    comercios.push({ ...comercio, slug });
  }
  contagem.prontos = comercios.length;

  gravarJson("comercios.json", comercios);
  gravarJson("espera.json", espera);
  // Bairros sem correspondência vão para a fila da administração, com o número de
  // comércios e até 50 deles (nome, endereço e CEP), para a equipe decidir que bairro é.
  const porBairro = new Map();
  for (const item of semBairro) {
    const chave = normalizar(item.bairro).slice(0, 100) || "(vazio)";
    const lista = porBairro.get(chave) ?? [];
    lista.push({ nome: item.nome, endereco: item.endereco, cep: item.cep });
    porBairro.set(chave, lista);
  }
  const pendentes = [...porBairro]
    .filter(([nome]) => !apelidos.get(nome)?.ignorar)
    .map(([nome_receita, lista]) => ({ cidade_id: cidadeId, nome_receita, comercios: lista.length, exemplos: lista.slice(0, 50) }));
  if (pendentes.length > 0) {
    const { error: ePendentes } = await banco.from("apelidos_bairro").upsert(pendentes, { onConflict: "cidade_id,nome_receita" });
    if (ePendentes) throw ePendentes;
  }
  gravarCsv("bairros_sem_correspondencia.csv", [["bairro_na_receita", "comercios"], ...[...porBairro].map(([b, l]) => [b, l.length]).sort((a, b) => b[1] - a[1])]);
  const porCategoria = new Map();
  for (const c of comercios) {
    const s = slugPorCategoria.get(c.categoria_id);
    porCategoria.set(s, (porCategoria.get(s) ?? 0) + 1);
  }
  gravarCsv("comercios_por_categoria.csv", [["categoria", "comercios"], ...[...porCategoria].sort((a, b) => b[1] - a[1])]);
  console.log(contagem);
}

// ---------------------------------------------------------------------------
// Etapa geocodificar
// ---------------------------------------------------------------------------

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function etapaGeocodificar() {
  const comercios = lerJson("comercios.json", null);
  if (!comercios) throw new Error("Rode a etapa preparar antes.");
  const cache = lerJson("coordenadas.json", {});
  let feitos = 0;
  let achados = 0;
  for (const c of comercios) {
    const e = c.endereco;
    const chave = normalizar(`${e.logradouro}|${e.numero}|${e.bairro}`);
    if (chave in cache) continue;
    const parametros = new URLSearchParams({
      street: e.numero === "S/N" ? e.logradouro : `${e.numero} ${e.logradouro}`,
      city: "Rio das Ostras",
      state: "Rio de Janeiro",
      country: "Brasil",
      format: "jsonv2",
      limit: "1",
    });
    const resposta = await fetch(`https://nominatim.openstreetmap.org/search?${parametros}`, {
      // A política do Nominatim pede identificação de quem consulta.
      headers: { "User-Agent": "AcheAquiRO-importacao/1.0 (https://acheaquiro.com.br)" },
    });
    if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}; o que já foi feito está em coordenadas.json.`);
    const [achado] = await resposta.json();
    // Só aceita resultado dentro do município (o Nominatim às vezes devolve a rua de outra cidade).
    cache[chave] = achado && /Rio das Ostras/.test(achado.display_name) ? [Number(achado.lon), Number(achado.lat)] : null;
    if (cache[chave]) achados++;
    if (++feitos % 50 === 0) {
      gravarJson("coordenadas.json", cache);
      console.log(`${feitos} consultados, ${achados} com coordenada`);
    }
    await esperar(1100);
  }
  gravarJson("coordenadas.json", cache);
  console.log(`Fim: ${feitos} consultados agora, ${achados} com coordenada.`);
}

// ---------------------------------------------------------------------------
// Etapa enviar
// ---------------------------------------------------------------------------

async function etapaEnviar() {
  const { cidadeId } = await carregarCatalogo();
  const comercios = lerJson("comercios.json", null);
  if (!comercios) throw new Error("Rode a etapa preparar antes.");
  const cache = lerJson("coordenadas.json", {});
  const { data: plano, error: ePlano } = await banco.from("planos").select("id").eq("cidade_id", cidadeId).eq("codigo", "com-gratuito").single();
  if (ePlano) throw ePlano;

  const jaImportados = await lerTudo(() => banco.from("dados_receita").select("cnpj").order("cnpj"));
  const cnpjsNoBanco = new Set(jaImportados.map((r) => r.cnpj));
  const slugsExistentes = await lerTudo(() => banco.from("anunciantes").select("slug").eq("cidade_id", cidadeId).order("slug"));
  const slugsNoBanco = new Set(slugsExistentes.map((r) => r.slug));

  const agora = new Date().toISOString();
  let gravados = 0;
  let falhas = 0;
  for (const c of comercios) {
    if (cnpjsNoBanco.has(c.cnpj)) continue;
    let slug = c.slug;
    for (let n = 2; slugsNoBanco.has(slug); n++) slug = `${c.slug.slice(0, 75)}-${n}`;

    const { data: anunciante, error: eAnunciante } = await banco
      .from("anunciantes")
      .insert({
        cidade_id: cidadeId,
        tipo: "comercio",
        slug,
        nome: c.nome,
        status: "publicado",
        origem: "receita",
        plano_id: plano.id,
        categoria_principal_id: c.categoria_id,
        aprovado_em: agora,
      })
      .select("id")
      .single();
    if (eAnunciante) {
      falhas++;
      console.error(`CNPJ ${c.cnpj}: ${eAnunciante.message}`);
      continue;
    }
    const e = c.endereco;
    const coordenada = cache[normalizar(`${e.logradouro}|${e.numero}|${e.bairro}`)];
    const { error: eEndereco } = await banco.from("enderecos").insert({
      anunciante_id: anunciante.id,
      cidade_id: cidadeId,
      logradouro: e.logradouro,
      numero: e.numero,
      complemento: e.complemento,
      bairro_id: e.bairro_id,
      local: coordenada ? `SRID=4326;POINT(${coordenada[0]} ${coordenada[1]})` : null,
      principal: true,
    });
    const { error: eReceita } = eEndereco
      ? { error: null }
      : await banco.from("dados_receita").insert({ anunciante_id: anunciante.id, cidade_id: cidadeId, cnpj: c.cnpj, referencia: mes, ...c.receita });
    if (eEndereco || eReceita) {
      // Sem endereço ou sem os dados da Receita o cadastro fica incompleto: desfaz.
      falhas++;
      console.error(`CNPJ ${c.cnpj}: ${(eEndereco ?? eReceita).message}`);
      const { error: eDesfazer } = await banco.from("anunciantes").delete().eq("id", anunciante.id);
      if (eDesfazer) console.error(`CNPJ ${c.cnpj}: não consegui desfazer o anunciante ${anunciante.id}: ${eDesfazer.message}`);
      continue;
    }
    slugsNoBanco.add(slug);
    if (++gravados % 100 === 0) console.log(`${gravados} gravados`);
  }
  console.log(`Fim: ${gravados} gravados, ${falhas} com erro.`);

  // Espera: comércios sem bairro, publicados pelo banco quando o nome da Receita
  // for ligado a um bairro. Quem já está no site ou passou a ter bairro sai dela.
  const espera = lerJson("espera.json", []);
  const { data: bloqueados, error: eBloqueados } = await banco.from("cnpjs_bloqueados").select("cnpj").eq("cidade_id", cidadeId);
  if (eBloqueados) throw eBloqueados;
  const foraDaEspera = new Set([...cnpjsNoBanco, ...bloqueados.map((b) => b.cnpj), ...comercios.map((c) => c.cnpj)]);
  const linhasEspera = espera
    .filter((c) => !foraDaEspera.has(c.cnpj))
    .map((c) => ({
      cnpj: c.cnpj,
      cidade_id: cidadeId,
      nome_receita: c.nome_receita,
      nome: c.nome,
      slug: c.slug,
      categoria_id: c.categoria_id,
      logradouro: c.endereco.logradouro,
      numero: c.endereco.numero,
      complemento: c.endereco.complemento,
      receita: c.receita,
      referencia: mes,
    }));
  for (let i = 0; i < linhasEspera.length; i += 500) {
    const { error } = await banco.from("comercios_em_espera").upsert(linhasEspera.slice(i, i + 500), { onConflict: "cnpj" });
    if (error) throw error;
  }
  const { data: emEspera, error: eEspera } = await banco.from("comercios_em_espera").select("cnpj").eq("cidade_id", cidadeId);
  if (eEspera) throw eEspera;
  const saem = emEspera.map((r) => r.cnpj).filter((cnpj) => foraDaEspera.has(cnpj));
  for (let i = 0; i < saem.length; i += 200) {
    const { error } = await banco.from("comercios_em_espera").delete().in("cnpj", saem.slice(i, i + 200));
    if (error) throw error;
  }
  console.log(`Espera: ${linhasEspera.length} comércios sem bairro guardados; ${saem.length} saíram da espera.`);
  if (falhas > 0) process.exitCode = 1;
}

const etapas = { mapa: etapaMapa, preparar: etapaPreparar, geocodificar: etapaGeocodificar, enviar: etapaEnviar };
if (!etapas[etapa]) {
  console.error(`Etapa desconhecida: ${etapa}`);
  process.exit(1);
}
etapas[etapa]().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
