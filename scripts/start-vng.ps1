# VnG launcher - one window, server + Vite in background
$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogDir = Join-Path $Root "logs"
$ServerLog = Join-Path $LogDir "server.log"
$DevLog = Join-Path $LogDir "dev.log"
$DevPort = 5173
$ServerPort = 3001

$script:ChildPids = @()
$script:BrowserOpened = $false

function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  +======================================================+" -ForegroundColor DarkCyan
    Write-Host "  |                                                      |" -ForegroundColor DarkCyan
    Write-Host "  |     ##      ##  ###   ##   ####                      |" -ForegroundColor Yellow
    Write-Host "  |     ##      ##  ####  ##  ##                         |" -ForegroundColor Yellow
    Write-Host "  |     ##  ##  ##  ## ## ##  ##  ###                    |" -ForegroundColor Yellow
    Write-Host "  |     ##  ##  ##  ##  ####  ##   ##                     |" -ForegroundColor Yellow
    Write-Host "  |      ###  ###   ##   ###   ####                      |" -ForegroundColor Yellow
    Write-Host "  |                                                      |" -ForegroundColor DarkCyan
    Write-Host "  |          VnG - online tabletop RPG                   |" -ForegroundColor DarkGray
    Write-Host "  +======================================================+" -ForegroundColor DarkCyan
    Write-Host ""
}

function Get-NodePath {
    $candidates = @(
        "${env:ProgramFiles}\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Get-NpmPath {
    $candidates = @(
        "${env:ProgramFiles}\nodejs\npm.cmd",
        "${env:ProgramFiles(x86)}\nodejs\npm.cmd",
        "$env:LOCALAPPDATA\Programs\nodejs\npm.cmd"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Test-PortOpen([int]$Port) {
    try {
        $client = New-Object Net.Sockets.TcpClient
        $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(500)
        if ($ok -and $client.Connected) {
            $client.Close()
            return $true
        }
        $client.Close()
        return $false
    } catch {
        return $false
    }
}

function Get-StatusIcon([bool]$Ok) {
    if ($Ok) { return "[OK]" } else { return "[..]" }
}

function Get-NetworkUrls {
    $ips = @(
        Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -ne "127.0.0.1" -and
                $_.PrefixOrigin -ne "WellKnown" -and
                $_.IPAddress -notmatch "^169\.254\."
            } |
            Select-Object -ExpandProperty IPAddress -Unique
    )
    $rows = @([PSCustomObject]@{ Tag = "Local"; Url = "http://localhost:$DevPort/" })
    foreach ($ip in ($ips | Sort-Object)) {
        $tag = switch -Wildcard ($ip) {
            "26.*"      { "VPN" }
            "192.168.*" { "LAN" }
            "10.*"      { "LAN" }
            default     { "NET" }
        }
        $rows += [PSCustomObject]@{ Tag = $tag; Url = "http://${ip}:$DevPort/" }
    }
    return $rows
}

function Get-BrowserUrl {
    return "http://localhost:$DevPort/"
}

function Get-ListenerPids([int[]]$Ports) {
    $pids = @()
    foreach ($port in $Ports) {
        $pids += Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    }
    return $pids | Where-Object { $_ -gt 0 } | Select-Object -Unique
}

function Stop-ProcessQuiet([int]$ProcessId) {
    if ($ProcessId -le 0) { return }
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) { return }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-PortListeners([int[]]$Ports) {
    foreach ($procId in (Get-ListenerPids $Ports)) {
        Stop-ProcessQuiet $procId
    }
}

function Start-ServiceBat([string]$Label, [string]$BatFile) {
    $bat = Join-Path $Root "scripts\services\$BatFile"
    if (-not (Test-Path $bat)) {
        throw "Missing: $bat"
    }
    $proc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList @("/c", "`"$bat`"") `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -PassThru
    if ($proc) {
        $script:ChildPids += $proc.Id
        Write-Host "  + $Label (PID $($proc.Id))" -ForegroundColor DarkGray
    }
    return $proc
}

function Stop-AllChildren {
    foreach ($procId in @($script:ChildPids)) {
        Stop-ProcessQuiet $procId
    }
    $script:ChildPids = @()
    Stop-PortListeners @($ServerPort, $DevPort)
}

function Start-AllServices {
    Write-Host "  Freeing ports $ServerPort and $DevPort..." -ForegroundColor DarkGray
    Stop-PortListeners @($ServerPort, $DevPort)
    Start-Sleep -Milliseconds 400

    Write-Host "  Background processes:" -ForegroundColor Cyan
    Start-ServiceBat "Server" "run-server.bat" | Out-Null
    Start-Sleep -Seconds 2
    Start-ServiceBat "Vite UI" "run-vite.bat" | Out-Null
}

function Restart-AllServices {
    Write-Host ""
    Write-Host "  Restarting VnG..." -ForegroundColor Cyan
    Stop-AllChildren
    Start-Sleep -Milliseconds 600
    "$(Get-Date -Format o) Launcher restart" | Add-Content -Path $ServerLog -Encoding UTF8
    "$(Get-Date -Format o) Launcher restart" | Add-Content -Path $DevLog -Encoding UTF8
    Start-AllServices
    Write-Host "  Waiting for ports..." -ForegroundColor DarkGray
    $ready = Wait-ForPorts -TimeoutSec 45
    if (-not $ready) {
        Write-Host "  Warning: services did not start in time after restart." -ForegroundColor Yellow
        Show-LogTail $ServerLog
        Show-LogTail $DevLog
    } else {
        Write-Host "  Restart complete." -ForegroundColor Green
        Start-Sleep -Milliseconds 800
    }
}

function Show-Dashboard {
    param(
        [bool]$ServerUp,
        [bool]$DevUp,
        [string]$OpenUrl
    )

    Write-Banner

    $sIcon = Get-StatusIcon $ServerUp
    $dIcon = Get-StatusIcon $DevUp
    $sColor = if ($ServerUp) { "Green" } else { "Yellow" }
    $dColor = if ($DevUp) { "Green" } else { "Yellow" }

    Write-Host "  NODE" -ForegroundColor Cyan
    Write-Host "  $script:NodeExe" -ForegroundColor DarkGray
    Write-Host ""

    Write-Host "  STATUS" -ForegroundColor Cyan
    Write-Host "  $sIcon " -NoNewline -ForegroundColor $sColor
    Write-Host "Game server  " -NoNewline
    Write-Host ":$ServerPort" -ForegroundColor White
    Write-Host "  $dIcon " -NoNewline -ForegroundColor $dColor
    Write-Host "Web UI       " -NoNewline
    Write-Host ":$DevPort" -ForegroundColor White
    Write-Host ""

    Write-Host "  ADDRESSES (share with friends)" -ForegroundColor Cyan
    foreach ($row in (Get-NetworkUrls)) {
        Write-Host ("  {0,-5} " -f $row.Tag) -NoNewline -ForegroundColor DarkYellow
        Write-Host $row.Url -ForegroundColor White
    }
    Write-Host ""

    Write-Host "  BROWSER (you)" -ForegroundColor Cyan
    Write-Host "  Open: " -NoNewline -ForegroundColor DarkGray
    Write-Host $OpenUrl -ForegroundColor Green
    Write-Host ""

    Write-Host "  LOGS" -ForegroundColor Cyan
    Write-Host "  $ServerLog" -ForegroundColor DarkGray
    Write-Host "  $DevLog" -ForegroundColor DarkGray
    Write-Host ""

    Write-Host "  ------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "  [B] Browser   [R] Restart   [Q] Stop and exit" -ForegroundColor Yellow
    Write-Host ""
}

function Wait-ForPorts {
    param([int]$TimeoutSec = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $s = Test-PortOpen $ServerPort
        $d = Test-PortOpen $DevPort
        Show-Dashboard -ServerUp $s -DevUp $d -OpenUrl (Get-BrowserUrl)
        if ($s -and $d) { return $true }
        Start-Sleep -Milliseconds 600
    }
    return $false
}

function Show-LogTail([string]$Path, [int]$Lines = 8) {
    if (-not (Test-Path $Path)) { return }
    Write-Host "  --- last lines of $(Split-Path $Path -Leaf) ---" -ForegroundColor DarkYellow
    Get-Content $Path -Tail $Lines -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "  $_" -ForegroundColor DarkGray
    }
    Write-Host ""
}

try {
    $script:NodeExe = Get-NodePath
    if (-not $script:NodeExe) {
        Write-Host "ERROR: Node.js not found in Program Files." -ForegroundColor Red
        Write-Host "Install from https://nodejs.org (not only Cursor IDE)." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }

    if (-not (Test-Path (Join-Path $Root "server\server.js"))) {
        Write-Host "ERROR: server\server.js not found." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    if (-not (Test-Path (Join-Path $Root "node_modules\vite\bin\vite.js"))) {
        Write-Host "ERROR: vite not installed. Run: npm install" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    "$(Get-Date -Format o) Launcher started" | Set-Content -Path $ServerLog -Encoding UTF8
    "$(Get-Date -Format o) Launcher started" | Set-Content -Path $DevLog -Encoding UTF8

    Write-Banner
    Write-Host "  Starting VnG..." -ForegroundColor Cyan
    Write-Host "  Node: $script:NodeExe" -ForegroundColor DarkGray
    Write-Host ""

    if (-not (Test-Path (Join-Path $Root "node_modules"))) {
        Write-Host "  Installing dependencies (first run)..." -ForegroundColor Yellow
        $npm = Get-NpmPath
        if (-not $npm) {
            Write-Host "ERROR: npm.cmd not found." -ForegroundColor Red
            Read-Host "Press Enter to exit"
            exit 1
        }
        & $npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: npm install failed." -ForegroundColor Red
            Read-Host "Press Enter to exit"
            exit 1
        }
    }

    Start-AllServices

    Write-Host ""
    Write-Host "  Waiting for ports..." -ForegroundColor DarkGray

    $ready = Wait-ForPorts
    $openUrl = Get-BrowserUrl

    if (-not $script:BrowserOpened) {
        Start-Process $openUrl | Out-Null
        $script:BrowserOpened = $true
    }

    if (-not $ready) {
        Write-Host ""
        Write-Host "  Warning: services did not start in time." -ForegroundColor Yellow
        Show-LogTail $ServerLog
        Show-LogTail $DevLog
        Read-Host "Press Enter to continue anyway"
    }

    while ($true) {
        $s = Test-PortOpen $ServerPort
        $d = Test-PortOpen $DevPort
        Show-Dashboard -ServerUp $s -DevUp $d -OpenUrl $openUrl

        $refreshAt = (Get-Date).AddSeconds(2)
        while ((Get-Date) -lt $refreshAt) {
            if ([Console]::KeyAvailable) {
                $key = [Console]::ReadKey($true)
                switch ($key.Key) {
                    "B" { Start-Process $openUrl | Out-Null }
                    "R" { Restart-AllServices }
                    "Q" { return }
                }
            }
            Start-Sleep -Milliseconds 80
        }
    }
} finally {
    Write-Host ""
    Write-Host "  Stopping VnG..." -ForegroundColor Yellow
    Stop-AllChildren
    Write-Host "  Done. Good game!" -ForegroundColor Green
    Start-Sleep -Seconds 1
}
