@echo off
cd /d "%~dp0..\.."
set "ROOT=%CD%"

set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not exist "%NODE_EXE%" (
  echo [%date% %time%] ERROR: node.exe not found>> "%ROOT%\logs\dev.log"
  exit /b 1
)

echo [%date% %time%] Starting Vite with %NODE_EXE%>> "%ROOT%\logs\dev.log"
"%NODE_EXE%" node_modules\vite\bin\vite.js --host 0.0.0.0 --port 5173>> "%ROOT%\logs\dev.log" 2>&1
