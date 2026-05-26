@echo off
cd /d "%~dp0..\.."
set "ROOT=%CD%"

set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not exist "%NODE_EXE%" (
  echo [%date% %time%] ERROR: node.exe not found>> "%ROOT%\logs\server.log"
  exit /b 1
)

echo [%date% %time%] Starting game server with %NODE_EXE%>> "%ROOT%\logs\server.log"
"%NODE_EXE%" server\server.js>> "%ROOT%\logs\server.log" 2>&1
