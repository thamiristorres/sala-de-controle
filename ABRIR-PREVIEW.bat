@echo off
REM Duplo-clique neste arquivo para pre-visualizar a Sala de Controle no seu navegador.
REM Ele abre um servidor local e a pagina http://localhost:8777
REM Para parar depois: feche a janela preta que vai abrir.

start "" powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0preview-local.ps1"
timeout /t 3 /nobreak >nul
start "" http://localhost:8777
