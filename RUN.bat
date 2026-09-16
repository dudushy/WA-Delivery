@echo off

call nvm use
if errorlevel 1 exit /b 1
start "" http://127.0.0.1:3000
call npm start
