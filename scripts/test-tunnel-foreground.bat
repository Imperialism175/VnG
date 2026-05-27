@echo off
cd /d "%~dp0\.."
title VnG - tunnel test (keep window open)
echo.
echo  VnG tunnel test
echo  ===============
echo.
echo  1. start-vng.bat - [OK] Server :3001
echo  2. Turn OFF WARP. Radmin/ZeroTier can stay if not routing all traffic.
echo  3. Close extra cloudflared in Task Manager
echo.
echo  IMPORTANT: 530 on THIS PC is often NORMAL for trycloudflare.
echo  After URL appears - test on PHONE with MOBILE INTERNET (not Wi-Fi).
echo.
pause
echo.
taskkill /F /IM cloudflared.exe >nul 2>&1
if not exist "cloudflared.exe" (
  echo ERROR: cloudflared.exe not found in project folder.
  pause
  exit /b 1
)
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object InterfaceAlias -eq 'Ethernet' | Select-Object -First 1 -ExpandProperty IPAddress)"') do set BIND=%%i
if "%BIND%"=="" (
  echo No Ethernet bind IP - starting without --edge-bind-address
  cloudflared.exe tunnel --protocol http2 --edge-ip-version 4 --url http://127.0.0.1:3001 --http-host-header 127.0.0.1:3001 --no-chunked-encoding
) else (
  echo Binding cloudflared outbound to Ethernet IP %BIND%
  cloudflared.exe tunnel --protocol http2 --edge-ip-version 4 --edge-bind-address %BIND% --url http://127.0.0.1:3001 --http-host-header 127.0.0.1:3001 --no-chunked-encoding
)
echo.
pause
