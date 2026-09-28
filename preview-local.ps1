# Servidor local simples para pre-visualizar o site da Sala de Controle.
# Uso: clique com o botao direito neste arquivo > "Executar com o PowerShell"
#      OU no PowerShell rode:  powershell -ExecutionPolicy Bypass -File preview-local.ps1
# Depois abra no navegador:  http://localhost:8777
# Para parar: feche a janela ou aperte Ctrl+C.

$root = $PSScriptRoot
$port = 8777
$prefix = "http://localhost:$port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
} catch {
    Write-Host "Nao consegui abrir a porta $port. Feche outra janela deste servidor e tente de novo." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Servidor local no ar." -ForegroundColor Green
Write-Host "  Abra no navegador:  $prefix" -ForegroundColor Cyan
Write-Host "  Para parar: feche esta janela ou aperte Ctrl+C." -ForegroundColor DarkGray
Write-Host ""

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".webmanifest" = "application/manifest+json"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }
    $reqPath = $context.Request.Url.LocalPath
    if ($reqPath -eq "/" ) { $reqPath = "/index.html" }
    $file = Join-Path $root ($reqPath.TrimStart("/") -replace "/", "\")

    if (Test-Path $file -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $ctype = $mime[$ext]
        if (-not $ctype) { $ctype = "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $context.Response.ContentType = $ctype
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        Write-Host ("200  " + $reqPath) -ForegroundColor DarkGray
    } else {
        $context.Response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - nao encontrado: $reqPath")
        $context.Response.OutputStream.Write($msg, 0, $msg.Length)
        Write-Host ("404  " + $reqPath) -ForegroundColor Yellow
    }
    $context.Response.OutputStream.Close()
}

$listener.Stop()
