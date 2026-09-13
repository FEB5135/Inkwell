@echo off
rem Inkwell - yerel sunucuyu baslatir ve tarayicida acar
cd /d "%~dp0"
start "Inkwell sunucusu" /min cmd /c "node tools\serve.mjs"
timeout /t 1 /nobreak >nul
start "" "http://localhost:4173"
