@echo off
setlocal enabledelayedexpansion
title WA-Delivery

pushd "%~dp0"

echo ============================================
echo   WA-Delivery - Iniciando
echo ============================================
echo.

rem 1) Node.js disponivel?
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale o Node.js LTS e rode RUN.bat novamente.
  echo https://nodejs.org/
  goto :fail
)

rem 2) Versao minima do Node.
node "scripts\check-node.mjs"
if errorlevel 1 goto :fail

rem 3) Dependencias instaladas?
if not exist "node_modules" (
  echo Dependencias ausentes. Instalando agora com npm ci...
  call npm ci
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias. Verifique sua conexao e rode RUN.bat novamente.
    goto :fail
  )
)

rem 4) Build presente?
if not exist "dist\app.js" (
  echo Build ausente. Compilando agora...
  call npm run build
  if errorlevel 1 (
    echo [ERRO] Falha ao compilar. Rode RUN.bat novamente.
    goto :fail
  )
)

echo.
echo Iniciando a aplicacao e abrindo o navegador...
echo Feche esta janela ou pressione Ctrl+C para encerrar.
echo.
node "scripts\start.mjs"
set EXITCODE=%errorlevel%
popd
if not "%EXITCODE%"=="0" (
  echo.
  echo A aplicacao encerrou com codigo %EXITCODE%.
  pause
)
exit /b %EXITCODE%

:fail
popd
echo.
pause
exit /b 1
