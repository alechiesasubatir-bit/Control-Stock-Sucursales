# Escribe la misma version en js/config.js y sw.js. Lo llama publicar.bat.
$ErrorActionPreference = 'Stop'
$v = Get-Date -Format 'yyyy.MM.dd-HHmm'
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($f in @('js/config.js', 'sw.js')) {
  $ruta = Join-Path $PSScriptRoot $f
  $t = [IO.File]::ReadAllText($ruta)
  if ($t -notmatch "VERSION = '[^']*'") { throw "No encuentro VERSION en $f" }
  $t = $t -replace "VERSION = '[^']*'", "VERSION = '$v'"
  [IO.File]::WriteAllText($ruta, $t, $utf8)
}
Write-Host "Version $v"
