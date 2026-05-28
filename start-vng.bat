@echo off
cd /d "%~dp0"
title VnG Launcher
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-vng.ps1"
echo.
pause
