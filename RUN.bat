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
  echo [ERRO] Node.js nao encontrado. Rode INSTALL.bat apos instalar o Node LTS.
  echo https://nodejs.org/
  goto :fail
)

rem 2) Versao minima do Node.
node "scripts\check-node.mjs"
if errorlevel 1 goto :fail

rem 3) Dependencias instaladas?
if not exist "node_modules" (
  echo Dependencias ausentes. Instalando agora (npm ci)...
  call npm ci
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias. Rode INSTALL.bat.
    goto :fail
  )
)

rem 4) Build presente?
if not exist "dist\app.js" (
  echo Build ausente. Compilando agora...
  call npm run build
  if errorlevel 1 (
    echo [ERRO] Falha ao compilar. Rode INSTALL.bat.
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
