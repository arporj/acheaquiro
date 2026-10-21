// Roda os testes pgTAP de supabase/tests/database no banco ligado (produção),
// sem Docker: o "supabase test db" exige Docker até com --linked.
// Cada arquivo roda numa transação que termina em erro de propósito, levando
// o resultado na mensagem: o banco desfaz tudo e nada fica gravado.
// Uso: npm run test:banco (lê SUPABASE_ACCESS_TOKEN do apps/web/.env.local).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PASTA = "supabase/tests/database";
const temporaria = mkdtempSync(join(tmpdir(), "testes-banco-"));
let falhas = 0;

for (const arquivo of readdirSync(PASTA).filter((nome) => nome.endsWith(".test.sql")).sort()) {
  let sql = readFileSync(join(PASTA, arquivo), "utf8");
  // Guarda a saída de cada asserção numa tabela da transação, liberada para os papéis testados.
  sql = sql.replace(
    "set local search_path = public, extensions;",
    `set local search_path = public, extensions;
create table public.teste_saida (n serial, l text);
grant all on public.teste_saida to anon, authenticated;
grant all on sequence public.teste_saida_n_seq to anon, authenticated;`,
  );
  sql = sql.replace(/^select (plan|ok|is|isnt|throws_ok|lives_ok)\(/gm, "insert into public.teste_saida (l) select $1(");
  sql = sql.replace(
    "select * from finish();\nrollback;",
    "insert into public.teste_saida (l) select * from finish();\n" +
      "do $x$ begin raise exception E'RESULTADO\n%', (select string_agg(l, E'\n' order by n) from public.teste_saida); end $x$;",
  );
  const caminho = join(temporaria, arquivo);
  writeFileSync(caminho, sql);

  let saida = "";
  try {
    saida = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", caminho], {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (erro) {
    // O erro é o esperado: o resultado vem na mensagem.
    saida = `${erro.stdout ?? ""}${erro.stderr ?? ""}`;
  }
  const inicio = saida.indexOf("RESULTADO");
  if (inicio < 0) {
    console.error(`${arquivo}: não foi possível rodar\n${saida.slice(0, 2000)}`);
    falhas += 1;
    continue;
  }
  const linhas = saida
    .slice(inicio)
    .replace(/\\n/g, "\n")
    .replace(/\n/g, "\n")
    .split("CONTEXT")[0]
    .split("\n")
    .slice(1)
    .map((linha) => linha.replace(/\+$/, "").replace(/\\"/g, '"'));
  const erradas = linhas.filter((linha) => linha.startsWith("not ok"));
  const certas = linhas.filter((linha) => linha.startsWith("ok "));
  console.log(`${arquivo}: ${certas.length} ok, ${erradas.length} com falha`);
  for (const linha of linhas.filter((l) => l.startsWith("not ok") || l.startsWith("#"))) console.log(`  ${linha}`);
  falhas += erradas.length;
}

rmSync(temporaria, { recursive: true, force: true });
process.exit(falhas > 0 ? 1 : 0);
