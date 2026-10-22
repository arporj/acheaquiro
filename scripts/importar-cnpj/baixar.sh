#!/usr/bin/env bash
# Baixa os dados abertos do CNPJ (Receita Federal) e guarda só as linhas de um
# município. Uso: bash scripts/importar-cnpj/baixar.sh <pasta> <AAAA-MM> [codigo_municipio]
# O código do município é o da tabela da Receita (Rio das Ostras = 2921), não o do IBGE.
# Precisa de curl, unzip e iconv (vêm com o Git Bash no Windows).
#
# Cada zip é baixado inteiro (com retomada, porque o servidor derruba downloads
# longos), conferido, filtrado e apagado. Arquivo já filtrado não é baixado de novo.
# Empresas e Simples são filtrados pelos CNPJs básicos dos estabelecimentos da cidade.

set -u
pasta="$1"
mes="$2"
municipio="${3:-2921}"
base="https://arquivos.receitafederal.gov.br/public.php/webdav/$mes"
# Compartilhamento público da Receita (arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9).
acesso="YggdBLfdninEJX9:"
mkdir -p "$pasta/$mes"
cd "$pasta/$mes" || exit 1

baixar() {
  local nome="$1"
  for tentativa in 1 2 3 4 5 6 7 8; do
    curl -s -C - -u "$acesso" -o "$nome.zip" "$base/$nome.zip" && unzip -tq "$nome.zip" >/dev/null 2>&1 && return 0
    echo "$nome: tentativa $tentativa falhou; nova tentativa em $((tentativa * 60)) s"
    sleep $((tentativa * 60))
  done
  echo "$nome: ERRO, não baixou depois de 8 tentativas"
  return 1
}

# Tabelas pequenas.
for nome in Cnaes Naturezas Municipios; do
  [ -f "$nome.csv" ] && continue
  baixar "$nome" && unzip -p "$nome.zip" | iconv -f latin1 -t utf-8 > "$nome.csv" && rm -f "$nome.zip"
done

# Estabelecimentos do município (campo 21).
for i in 0 1 2 3 4 5 6 7 8 9; do
  saida="estabelecimentos$i.csv"
  [ -f "$saida" ] && continue
  baixar "Estabelecimentos$i" || exit 1
  unzip -p "Estabelecimentos$i.zip" | iconv -f latin1 -t utf-8 | awk -F'";"' -v m="$municipio" '$21 == m' > "$saida.tmp" \
    && mv "$saida.tmp" "$saida" && rm -f "Estabelecimentos$i.zip"
  echo "Estabelecimentos$i: $(wc -l < "$saida") linhas"
  sleep 30
done

# CNPJs básicos da cidade, para filtrar Empresas e Simples.
cat estabelecimentos?.csv | cut -d';' -f1 | tr -d '"' | sort -u > basicos.txt

for nome in Empresas0 Empresas1 Empresas2 Empresas3 Empresas4 Empresas5 Empresas6 Empresas7 Empresas8 Empresas9 Simples; do
  saida="$(echo "$nome" | tr 'A-Z' 'a-z').csv"
  [ -f "$saida" ] && continue
  baixar "$nome" || exit 1
  unzip -p "$nome.zip" | iconv -f latin1 -t utf-8 \
    | awk -F'";"' 'NR == FNR { b["\"" $0] = 1; next } b[$1]' basicos.txt - > "$saida.tmp" \
    && mv "$saida.tmp" "$saida" && rm -f "$nome.zip"
  echo "$nome: $(wc -l < "$saida") linhas"
  sleep 30
done
echo FIM
