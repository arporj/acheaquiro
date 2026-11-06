# Roda uma ferramenta de linha de comando com as credenciais DESTE projeto, lidas
# de .credenciais.local (fora do Git). As variáveis valem só durante o comando: ao
# terminar, o terminal volta ao que era, para outro projeto não herdar estes tokens.
#
# Uso:  .\scripts\cli.ps1 supabase migration list --linked
#       .\scripts\cli.ps1 supabase db push
#       .\scripts\cli.ps1 wrangler whoami              (roda em apps/web)
#       .\scripts\cli.ps1 npm run deploy:producao -w web
#       .\scripts\cli.ps1 --conferir                   (nomes e situação, sem os valores)
#
# Em worktree, sem o arquivo na própria pasta, usa o da pasta principal do repositório.

$ErrorActionPreference = 'Stop'
$comando = @($args)
$raiz = Split-Path -Parent $PSScriptRoot

# Ref do projeto Supabase, fixado aqui para valer também nos worktrees, que não têm
# o supabase/.temp do "supabase link". Não é segredo: já aparece no endereço do site.
$REF_SUPABASE = 'tvlcrvsoedkfafxofhht'

# Sem o token do projeto, a ferramenta usaria o login global do computador, que pode
# ser de outra conta. Por isso ela nem começa.
$TOKEN_OBRIGATORIO = @{
    wrangler = 'CLOUDFLARE_API_TOKEN'
    supabase = 'SUPABASE_ACCESS_TOKEN'
}

function Localizar-Credenciais {
    $local = Join-Path $raiz '.credenciais.local'
    if (Test-Path $local) { return $local }

    $ErrorActionPreference = 'Continue'
    $gitComum = & git -C $raiz rev-parse --path-format=absolute --git-common-dir 2>$null
    if ($LASTEXITCODE -eq 0 -and $gitComum) {
        $principal = Join-Path (Split-Path -Parent $gitComum) '.credenciais.local'
        if (Test-Path $principal) { return $principal }
    }
    throw "Arquivo .credenciais.local não encontrado em $raiz. Crie o arquivo com os nomes listados em apps/web/.env.example."
}

function Ler-Credenciais($arquivo) {
    $valores = @{}
    foreach ($linha in Get-Content $arquivo) {
        if ($linha -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $valores[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    return $valores
}

if ($comando.Count -eq 0) {
    throw 'Informe o comando. Exemplo: .\scripts\cli.ps1 supabase migration list --linked'
}

$arquivo = Localizar-Credenciais
$credenciais = Ler-Credenciais $arquivo

if ($comando[0] -eq '--conferir') {
    Write-Output "Arquivo: $arquivo"
    foreach ($nome in ($credenciais.Keys | Sort-Object)) {
        $situacao = if ($credenciais[$nome]) { 'preenchida' } else { 'VAZIA' }
        Write-Output "${nome}: $situacao"
    }
    exit 0
}

$ferramenta = $comando[0]
$obrigatorio = $TOKEN_OBRIGATORIO[$ferramenta]
if ($obrigatorio -and -not $credenciais[$obrigatorio]) {
    throw "$obrigatorio não está preenchida em $arquivo. O comando não rodou, para não usar o login global do computador."
}

$credenciais['SUPABASE_PROJECT_ID'] = $REF_SUPABASE

$anteriores = @{}
foreach ($nome in $credenciais.Keys) {
    $anteriores[$nome] = [Environment]::GetEnvironmentVariable($nome, 'Process')
    if ($credenciais[$nome]) {
        [Environment]::SetEnvironmentVariable($nome, $credenciais[$nome], 'Process')
    }
}

# O wrangler procura a configuração só da pasta atual para cima, e ela fica em apps/web.
$pasta = if ($ferramenta -eq 'wrangler') { Join-Path $raiz 'apps\web' } else { $raiz }
$local = Join-Path $raiz "node_modules\.bin\$ferramenta.cmd"
$executavel = if (Test-Path $local) { $local } else { $ferramenta }
$resto = @($comando | Select-Object -Skip 1)

Push-Location $pasta
# As ferramentas escrevem o progresso no stderr; no PowerShell 5.1, com 'Stop', isso
# interromperia o comando. O resultado vale pelo código de saída.
$ErrorActionPreference = 'Continue'
try {
    & $executavel @resto
    $codigo = $LASTEXITCODE
}
finally {
    Pop-Location
    foreach ($nome in $anteriores.Keys) {
        [Environment]::SetEnvironmentVariable($nome, $anteriores[$nome], 'Process')
    }
}
exit $codigo
