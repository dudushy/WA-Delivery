@echo off
setlocal enabledelayedexpansion
title WA-Delivery - Instalacao

rem Usa o diretorio deste script como raiz, mesmo com espacos/acentos no caminho.
pushd "%~dp0"

echo ============================================
echo   WA-Delivery - Instalacao
echo ============================================
echo.

rem 1) Verifica se o Node.js esta disponivel.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo Instale o Node.js LTS compativel em: https://nodejs.org/
  echo Depois feche e abra esta janela novamente.
  goto :fail
)

rem 2) Verifica se o npm esta disponivel.
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] npm nao encontrado. Reinstale o Node.js LTS: https://nodejs.org/
  goto :fail
)

rem 3) Valida a versao minima do Node (logica em scripts/check-node.mjs).
node "scripts\check-node.mjs"
if errorlevel 1 goto :fail

echo.
echo Instalando dependencias (npm ci)...
call npm ci
if errorlevel 1 (
  echo [ERRO] Falha ao instalar as dependencias.
  goto :fail
)

echo.
echo Compilando a aplicacao (build)...
call npm run build
if errorlevel 1 (
  echo [ERRO] Falha ao compilar a aplicacao.
  goto :fail
)

echo.
echo ============================================
echo   Instalacao concluida com sucesso!
echo   Seus dados em data\ foram preservados.
echo   Agora execute RUN.bat para iniciar.
echo ============================================
popd
echo.
pause
exit /b 0

:fail
popd
echo.
echo A instalacao NAO foi concluida. Veja a mensagem acima.
pause
exit /b 1
