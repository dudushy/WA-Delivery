@echo off

call nvm use
if errorlevel 1 exit /b 1
call npm ci
if errorlevel 1 exit /b 1
call npm run build
