@echo off
setlocal
cd /d "%~dp0\..\.."
if not exist "logs" mkdir "logs"
call npm run server >> "logs\server.log" 2>&1
endlocal
