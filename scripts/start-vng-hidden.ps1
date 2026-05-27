$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogDir = Join-Path $Root "logs"
$ServerLog = Join-Path $LogDir "server.log"
$DevLog = Join-Path $LogDir "dev.log"
$TunnelLauncherLog = Join-Path $LogDir "tunnel-launcher.log"
$TunnelCfLog = Join-Path $LogDir "tunnel-cloudflared.log"
$TunnelUrlFile = Join-Path $LogDir "tunnel-url.txt"
$ServerPort = 3001
$UiPort = 5173

$script:ChildPids = @()
$script:NodeExe = $null
$script:CloudflaredExe = $null
$script:TunnelEnabled = $false
$script:TunnelTryIndex = 0
$script:LastHint = $null
$script:LastServiceRestartAt = $null
$script:TunnelWaitStartedAt = $null
$script:LastTunnelRestartAt = $null
$script:ActionBanner = $null
$script:ShouldQuit = $false

function Write-LauncherLog([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date), $Message
    try { Add-Content -Path $TunnelLauncherLog -Encoding UTF8 -Value $line } catch {}
}

function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  +======================================================+" -ForegroundColor DarkCyan
    Write-Host "  |                  VnG Hidden Launcher                 |" -ForegroundColor DarkCyan
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

function Get-CloudflaredPath {
    $localInProject = Join-Path $Root "cloudflared.exe"
    if (Test-Path $localInProject) { return $localInProject }
    try {
        $whereOut = & where.exe cloudflared 2>$null
        if ($LASTEXITCODE -eq 0 -and $whereOut) {
            $first = ($whereOut | Select-Object -First 1).ToString().Trim()
            if ($first -and (Test-Path $first)) { return $first }
        }
    } catch {}
    $candidates = @(
        (Join-Path $env:ProgramFiles "Cloudflare\Cloudflared\cloudflared.exe"),
        (Join-Path $env:ProgramFiles "cloudflared\cloudflared.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Cloudflare\Cloudflared\cloudflared.exe")
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Test-CloudflaredRunnable([string]$ExePath) {
    if (-not $ExePath -or -not (Test-Path $ExePath)) { return $false }
    try {
        & $ExePath --version > $null 2>&1
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

function Test-TunnelProcessRunning {
    return [bool](Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue)
}

function Test-WarpLikelyActive {
    if (Get-Process -Name "warp-svc", "Cloudflare WARP" -ErrorAction SilentlyContinue) { return $true }
    try {
        $adapters = Get-NetAdapter -ErrorAction SilentlyContinue |
            Where-Object { $_.Status -eq "Up" -and ($_.Name -match "WARP|Cloudflare" -or $_.InterfaceDescription -match "WARP|Cloudflare") }
        return [bool]$adapters
    } catch {
        return $false
    }
}

function Get-VpnAdapterNames {
    try {
        return @(Get-NetAdapter -ErrorAction SilentlyContinue |
            Where-Object { $_.Status -eq "Up" -and $_.Name -match "Radmin|ZeroTier|WeOnlyDo|WARP|WireGuard|Tailscale" } |
            Select-Object -ExpandProperty Name)
    } catch {
        return @()
    }
}

function Get-EthernetBindAddress {
    try {
        $onEthernet = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.InterfaceAlias -eq "Ethernet" -and $_.IPAddress -match "^\d+\.\d+\.\d+\.\d+$" } |
            Select-Object -First 1 -ExpandProperty IPAddress
        if ($onEthernet) { return $onEthernet }
        return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -match "^(192\.168|10\.)" -and
                $_.InterfaceAlias -notmatch "Radmin|ZeroTier|WeOnlyDo|WARP|Loopback|vEthernet"
            } | Select-Object -First 1 -ExpandProperty IPAddress)
    } catch {
        return $null
    }
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

function Wait-ForPort([int]$Port, [int]$TimeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortOpen $Port) { return $true }
        Start-Sleep -Milliseconds 350
    }
    return $false
}

function Start-NodeService([string]$ScriptRel, [string[]]$ExtraArgs, [string]$OutLog) {
    $entry = Join-Path $Root $ScriptRel
    if (-not (Test-Path $entry)) { return $null }
    $errLog = "$OutLog.err"
    $argList = @($entry) + $ExtraArgs
    try {
        $proc = Start-Process -FilePath $script:NodeExe `
            -ArgumentList $argList `
            -WorkingDirectory $Root `
            -WindowStyle Hidden `
            -RedirectStandardOutput $OutLog `
            -RedirectStandardError $errLog `
            -PassThru
        if ($proc) { $script:ChildPids += $proc.Id }
        return $proc
    } catch {
        try { Add-Content -Path $OutLog -Encoding UTF8 -Value ("launcher: failed to start {0}: {1}" -f $ScriptRel, $_) } catch {}
        return $null
    }
}

function Start-ServerProcess {
    return Start-NodeService "server\server.js" @() $ServerLog
}

function Start-ViteProcess {
    return Start-NodeService "node_modules\vite\bin\vite.js" @("--host", "0.0.0.0", "--port", "$UiPort") $DevLog
}

function Stop-TunnelProcesses {
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-ProcessQuiet $_.Id
    }
}

function Save-TunnelUrl([string]$Url) {
    if (-not $Url) { return }
    try { $Url.Trim() | Set-Content -Path $TunnelUrlFile -Encoding UTF8 -NoNewline } catch {}
}

function Clear-TunnelUrl {
    try { Remove-Item -Path $TunnelUrlFile -Force -ErrorAction SilentlyContinue } catch {}
}

function Test-TunnelEdgeHealthy {
    if (-not (Test-TunnelProcessRunning)) { return $false }
    if (-not (Test-Path $TunnelCfLog)) { return $false }
    try {
        $lines = Get-Content $TunnelCfLog -Tail 12 -ErrorAction SilentlyContinue
        if (-not $lines) { return $false }
        $lastReg = -1
        $lastErr = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match 'Registered tunnel connection') { $lastReg = $i }
            if ($lines[$i] -match 'Lost connection with the edge|Connection terminated|Serve tunnel error|client disconnected|control stream encountered a failure') {
                $lastErr = $i
            }
        }
        return ($lastReg -ge 0 -and $lastReg -gt $lastErr)
    } catch {
        return $false
    }
}

function Start-TunnelProcess([switch]$Force) {
    if (-not $script:TunnelEnabled) { return $null }
    if (-not $Force -and (Test-TunnelProcessRunning)) {
        return Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if ($Force) {
        Stop-TunnelProcesses
        Clear-TunnelUrl
    }
    $bindIp = Get-EthernetBindAddress
    $bindLabel = if ($bindIp) { "bind $bindIp" } else { "bind auto" }
    Write-LauncherLog ("starting tunnel (HTTP/2 + IPv4, {0}, origin :{1})" -f $bindLabel, $ServerPort)
    try { "" | Set-Content -Path $TunnelCfLog -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
    $args = @(
        "tunnel",
        "--protocol", "http2",
        "--edge-ip-version", "4",
        "--retries", "12",
        "--url", "http://127.0.0.1:$ServerPort",
        "--http-host-header", "127.0.0.1:$ServerPort",
        "--no-chunked-encoding",
        "--logfile", $TunnelCfLog,
        "--loglevel", "info"
    )
    if ($bindIp) { $args += @("--edge-bind-address", $bindIp) }
    $proc = Start-Process -FilePath $script:CloudflaredExe `
        -ArgumentList $args `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -PassThru
    Start-Sleep -Milliseconds 400
    if ($proc -and -not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
        Write-LauncherLog "cloudflared exited immediately (PID $($proc.Id))"
        return $null
    }
    return $proc
}

function Is-ProcessAlive([int]$ProcessId) {
    if ($ProcessId -le 0) { return $false }
    return [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Stop-AllChildren {
    foreach ($procId in @($script:ChildPids)) { Stop-ProcessQuiet $procId }
    $script:ChildPids = @()
    Stop-TunnelProcesses
    Stop-PortListeners @($ServerPort, $UiPort)
}

function Test-TunnelUrlReachable([string]$Url) {
    if (-not $Url) { return $false }
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 12 -MaximumRedirection 5
        return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400)
    } catch {
        try {
            if ($_.Exception.Response) {
                $code = [int]$_.Exception.Response.StatusCode
                if ($code -eq 530 -or $code -eq 520 -or $code -eq 502 -or $code -eq 503) { return $false }
            }
        } catch {}
        return $false
    }
}

function Get-TunnelUrlFromLog {
    if (Test-Path $TunnelUrlFile) {
        $saved = (Get-Content $TunnelUrlFile -Raw -ErrorAction SilentlyContinue).Trim()
        if ($saved -match 'https://[a-z0-9-]+\.trycloudflare\.com') { return $saved }
    }
    foreach ($path in @($TunnelCfLog, (Join-Path $LogDir "tunnel.log"))) {
        if (-not (Test-Path $path)) { continue }
        try {
            $lines = Get-Content $path -Tail 250 -ErrorAction SilentlyContinue
            $re = [regex]'https://[a-z0-9-]+\.trycloudflare\.com'
            for ($i = $lines.Count - 1; $i -ge 0; $i--) {
                $m = $re.Match($lines[$i])
                if ($m.Success) { return $m.Value }
            }
        } catch {}
    }
    return $null
}

# Returns: Mode = wait | reconnect | verified | edge
function Get-TunnelDisplay {
    $url = Get-TunnelUrlFromLog
    if (-not $url) { return @{ Mode = "wait"; Url = $null } }
    if (-not (Test-TunnelEdgeHealthy)) { return @{ Mode = "reconnect"; Url = $url } }
    if (Test-TunnelUrlReachable $url) {
        Save-TunnelUrl $url
        return @{ Mode = "verified"; Url = $url }
    }
    Save-TunnelUrl $url
    return @{ Mode = "edge"; Url = $url }
}

function Get-LanPlayUrls {
    if (-not (Test-PortOpen $ServerPort)) { return @() }
    try {
        $info = Invoke-RestMethod -Uri "http://127.0.0.1:$ServerPort/api/server/info" -TimeoutSec 3
        $urls = @("http://127.0.0.1:$ServerPort/")
        foreach ($ip in @($info.addresses)) {
            if ($ip -and $ip -ne "127.0.0.1") {
                $urls += "http://${ip}:$ServerPort/"
            }
        }
        return $urls | Select-Object -Unique
    } catch {
        return @()
    }
}

function Get-LatestTunnelError {
    foreach ($path in @($TunnelCfLog, (Join-Path $LogDir "tunnel.log"))) {
        if (-not (Test-Path $path)) { continue }
        try {
            $lines = Get-Content $path -Tail 200 -ErrorAction SilentlyContinue
            for ($i = $lines.Count - 1; $i -ge 0; $i--) {
                $line = $lines[$i]
                if ($line -match 'level":"error"|level":"fatal|ERR|ERROR|failed|timeout|unregistered|Unable|lookup|not available') {
                    if ($line -match 'message":"([^"]+)"') { return $Matches[1].Trim() }
                    return $line.Trim()
                }
            }
        } catch {}
    }
    return $null
}

function Show-Dashboard {
    param(
        [bool]$ServerUp,
        [bool]$UiUp,
        [bool]$TunnelProcUp,
        [string]$TunnelUrl,
        [string]$TunnelMode,
        [string]$TunnelError
    )
    Write-Banner
    if ($script:ActionBanner) {
        Write-Host ("  >>> {0} <<<" -f $script:ActionBanner) -ForegroundColor Cyan
        Write-Host ""
    }
    $serverStateColor = if ($ServerUp) { "Green" } else { "Yellow" }
    $uiStateColor = if ($UiUp) { "Green" } else { "Yellow" }
    $tunnelStateColor = if ($TunnelProcUp) { "Green" } else { "Yellow" }
    Write-Host "  STATUS" -ForegroundColor Cyan
    Write-Host ("  {0} Server :{1}" -f (Get-StatusIcon $ServerUp), $ServerPort) -ForegroundColor $serverStateColor
    Write-Host ("  {0} UI     :{1}" -f (Get-StatusIcon $UiUp), $UiPort) -ForegroundColor $uiStateColor
    if ($script:TunnelEnabled) {
        $edgeOk = Test-TunnelEdgeHealthy
        Write-Host ("  {0} Tunnel process" -f (Get-StatusIcon $TunnelProcUp)) -ForegroundColor $tunnelStateColor
        $edgeLabel = if ($edgeOk) { "Cloudflare edge: connected" } elseif ($TunnelProcUp) { "Cloudflare edge: reconnecting..." }
        if ($edgeLabel) {
            $edgeColor = if ($edgeOk) { "Green" } else { "Yellow" }
            Write-Host ("  {0}" -f $edgeLabel) -ForegroundColor $edgeColor
        }
        Write-Host ("  cloudflared: {0}" -f $script:CloudflaredExe) -ForegroundColor DarkGray
    } else {
        Write-Host ("  [..] Tunnel disabled") -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "  LINKS" -ForegroundColor Cyan
    Write-Host "  UI:     http://localhost:5173/" -ForegroundColor White
    if ($TunnelUrl -and $TunnelMode -eq "verified") {
        Write-Host "  Tunnel: $TunnelUrl" -ForegroundColor Green
        Write-Host "  (verified from this PC - safe to share)" -ForegroundColor Green
    } elseif ($TunnelUrl -and $TunnelMode -eq "edge") {
        Write-Host "  Tunnel: $TunnelUrl" -ForegroundColor Yellow
        Write-Host "  Edge OK. This PC often gets 530 on trycloudflare (normal)." -ForegroundColor Yellow
        Write-Host "  TEST: open URL on phone with mobile internet, not Wi-Fi." -ForegroundColor Yellow
        Write-Host "  If phone works - send link to friends. Press C to copy." -ForegroundColor Yellow
    } elseif ($TunnelUrl -and $TunnelMode -eq "reconnect") {
        Write-Host "  Tunnel: $TunnelUrl" -ForegroundColor DarkYellow
        Write-Host "  URL exists but edge reconnecting - wait or press R" -ForegroundColor DarkYellow
    } else {
        Write-Host "  Tunnel: waiting for URL (~15-25 sec after R)..." -ForegroundColor DarkYellow
        if ($script:TunnelWaitStartedAt) {
            $waitSec = [int]((Get-Date) - $script:TunnelWaitStartedAt).TotalSeconds
            if ($waitSec -ge 25) { Write-Host ("  Waited: {0}s (press R to restart)" -f $waitSec) -ForegroundColor DarkYellow }
        }
    }
    $vpnNames = Get-VpnAdapterNames
    if ($vpnNames.Count -gt 0 -and $script:TunnelEnabled) {
        Write-Host ("  VPN adapters up: {0}" -f ($vpnNames -join ", ")) -ForegroundColor DarkYellow
    }
    if ($ServerUp) {
        $lanUrls = Get-LanPlayUrls
        if ($lanUrls.Count -gt 0) {
            Write-Host ""
            Write-Host "  LAN / VPN (often more stable than tunnel)" -ForegroundColor Cyan
            foreach ($u in $lanUrls) {
                Write-Host "  $u" -ForegroundColor White
            }
        }
    }
    Write-Host ""
    Write-Host "  LOGS" -ForegroundColor Cyan
    Write-Host "  $ServerLog" -ForegroundColor DarkGray
    Write-Host "  $DevLog" -ForegroundColor DarkGray
    Write-Host "  $TunnelCfLog" -ForegroundColor DarkGray
    Write-Host ""
    if ($TunnelError) {
        Write-Host "  ISSUE" -ForegroundColor Red
        Write-Host "  $TunnelError" -ForegroundColor Red
        if ((Test-WarpLikelyActive) -and $script:TunnelEnabled) {
            Write-Host "  WARP/VPN detected - this often kills trycloudflare (530)" -ForegroundColor Red
            Write-Host "  Fix: disable WARP, or split-tunnel exclude cloudflared.exe" -ForegroundColor DarkYellow
        }
        Write-Host ""
    } elseif ($script:LastHint) {
        Write-Host "  HINT" -ForegroundColor DarkGray
        Write-Host "  $($script:LastHint)" -ForegroundColor DarkGray
        Write-Host ""
    }
    Write-Host "  COMMANDS (type letter + Enter)" -ForegroundColor Yellow
    Write-Host "  O = open UI in browser" -ForegroundColor DarkGray
    if ($script:TunnelEnabled) {
        Write-Host "  C = copy tunnel URL (only if verified)" -ForegroundColor DarkGray
        Write-Host "  L = copy LAN/VPN URL for friends" -ForegroundColor DarkGray
    }
    Write-Host "  R = restart all services" -ForegroundColor DarkGray
    Write-Host "  Q = stop and exit" -ForegroundColor DarkGray
    Write-Host "  Enter alone = refresh status" -ForegroundColor DarkGray
    Write-Host ""
}

function Init-Logs {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
    $stamp = "$(Get-Date -Format o) Hidden launcher started"
    try { $stamp | Set-Content -Path $ServerLog -Encoding UTF8 } catch {}
    try { $stamp | Set-Content -Path $DevLog -Encoding UTF8 } catch {}
    try { $stamp | Set-Content -Path $TunnelLauncherLog -Encoding UTF8 } catch {}
    Write-LauncherLog "services starting"
}

function Start-AllServices {
    Stop-AllChildren
    Init-Logs
    $script:LastTunnelRestartAt = $null
    $script:TunnelWaitStartedAt = Get-Date
    Start-Sleep -Milliseconds 200
    $serverProc = Start-ServerProcess
    $serverUp = Wait-ForPort $ServerPort 30
    if (-not $serverUp) {
        $script:LastHint = "Server not listening on :$ServerPort - see server.log and server.log.err"
    }
    $viteProc = Start-ViteProcess
    $null = Wait-ForPort $UiPort 25
    $tunnelProc = $null
    if ($script:TunnelEnabled -and $serverUp) {
        $tunnelProc = Start-TunnelProcess -Force
        $script:LastTunnelRestartAt = Get-Date
    } elseif ($script:TunnelEnabled) {
        $script:LastHint = "Tunnel waits for server :$ServerPort. Press R when server is OK."
    }
    return @{
        ServerPid = if($serverProc){$serverProc.Id}else{0}
        VitePid = if($viteProc){$viteProc.Id}else{0}
        TunnelPid = if($tunnelProc){$tunnelProc.Id}else{0}
    }
}

function Invoke-DashboardCommand {
    param([string]$InputLine)
    $trimmed = $InputLine.Trim()
    if (-not $trimmed) { return $null }
    $ch = [char]::ToUpperInvariant($trimmed[0])
    switch ($ch) {
        'O' {
            $script:ActionBanner = "Opening UI in browser..."
            Start-Process "http://localhost:$UiPort/" | Out-Null
            Start-Sleep -Milliseconds 900
            $script:ActionBanner = $null
        }
        'C' {
            $td = Get-TunnelDisplay
            if ($td.Url) {
                Set-Clipboard -Value $td.Url
                if ($td.Mode -eq "verified") {
                    $script:ActionBanner = "Verified tunnel URL copied"
                } else {
                    $script:ActionBanner = "Tunnel URL copied - verify on phone (mobile data)"
                }
            } else {
                $script:ActionBanner = "No tunnel URL yet - wait or press R"
            }
            Start-Sleep -Milliseconds 1200
            $script:ActionBanner = $null
        }
        'L' {
            $lan = @(Get-LanPlayUrls | Where-Object { $_ -notmatch '127\.0\.0\.1' })
            if ($lan.Count -eq 0) { $lan = @(Get-LanPlayUrls) }
            if ($lan.Count -gt 0) {
                Set-Clipboard -Value $lan[0]
                $script:ActionBanner = ("LAN URL copied: {0}" -f $lan[0])
            } else {
                $script:ActionBanner = "No LAN URL - start server first"
            }
            Start-Sleep -Milliseconds 1200
            $script:ActionBanner = $null
        }
        'R' {
            Clear-Host
            Write-Host ""
            Write-Host "  >>> RESTARTING ALL SERVICES... <<<" -ForegroundColor Cyan
            Write-Host ""
            $pids = Start-AllServices
            Write-Host ""
            Write-Host "  >>> RESTART COMPLETE <<<" -ForegroundColor Green
            Write-Host "  Wait ~20s for a new tunnel URL." -ForegroundColor DarkGray
            Write-Host ""
            Start-Sleep -Seconds 2
            return $pids
        }
        'Q' {
            Clear-Host
            Write-Host ""
            Write-Host "  >>> STOPPING VNG... <<<" -ForegroundColor Yellow
            Write-Host ""
            $script:ShouldQuit = $true
        }
    }
    return $null
}

try {
    $script:NodeExe = Get-NodePath
    if (-not $script:NodeExe) {
        Write-Host "Node.js not found. Install Node.js first." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    if (-not (Test-Path (Join-Path $Root "server\server.js"))) {
        Write-Host "Missing server\server.js" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    if (-not (Test-Path (Join-Path $Root "node_modules\vite\bin\vite.js"))) {
        Write-Host "Vite not installed. Run npm install first." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    $script:CloudflaredExe = Get-CloudflaredPath
    $script:TunnelEnabled = Test-CloudflaredRunnable $script:CloudflaredExe
    if (-not $script:TunnelEnabled) {
        $script:LastHint = "cloudflared not found - LAN/VPN only, or put cloudflared.exe in project root."
    } else {
        $script:LastHint = "530 on this PC may be false. Test tunnel URL on PHONE (mobile data). Hotspot test: scripts\test-tunnel-foreground.bat"
    }

    $pids = Start-AllServices
    $serverPid = $pids.ServerPid
    $vitePid = $pids.VitePid
    $tunnelPid = $pids.TunnelPid

    while (-not $script:ShouldQuit) {
        $serverUp = Test-PortOpen $ServerPort
        $uiUp = Test-PortOpen $UiPort
        $tunnelProcUp = Test-TunnelProcessRunning
        $tunnelEdgeOk = Test-TunnelEdgeHealthy
        $tunnelDisplay = if ($script:TunnelEnabled -and $serverUp) { Get-TunnelDisplay } else { @{ Mode = "wait"; Url = $null } }
        $tunnelUrl = $tunnelDisplay.Url
        $tunnelMode = $tunnelDisplay.Mode
        $tunnelError = $null
        if ($script:TunnelEnabled -and -not $tunnelProcUp) {
            $tunnelError = "cloudflared not running - press R"
        } elseif ($script:TunnelEnabled -and -not $serverUp) {
            $tunnelError = "Server :$ServerPort down - start server first"
        } elseif ($script:TunnelEnabled -and $tunnelMode -eq "reconnect") {
            $tunnelError = "Edge reconnecting - wait 10-20s or press R"
        } elseif ($script:TunnelEnabled -and -not $tunnelUrl -and -not $script:ActionBanner) {
            $err = Get-LatestTunnelError
            if ($err) { $tunnelError = $err }
        }
        if (-not (Is-ProcessAlive $serverPid) -and -not $serverUp) {
            $cooldown = -not $script:LastServiceRestartAt -or ((Get-Date) - $script:LastServiceRestartAt).TotalSeconds -ge 10
            if ($cooldown) {
                $serverProc = Start-ServerProcess
                $serverPid = if($serverProc){$serverProc.Id}else{0}
                $script:LastServiceRestartAt = Get-Date
            }
        }
        if (-not (Is-ProcessAlive $vitePid) -and -not $uiUp) {
            $cooldown = -not $script:LastServiceRestartAt -or ((Get-Date) - $script:LastServiceRestartAt).TotalSeconds -ge 10
            if ($cooldown) {
                $viteProc = Start-ViteProcess
                $vitePid = if($viteProc){$viteProc.Id}else{0}
                $script:LastServiceRestartAt = Get-Date
            }
        }
        if ($script:TunnelEnabled -and $serverUp -and -not $tunnelProcUp -and -not $script:ActionBanner) {
            $cooldownOk = -not $script:LastTunnelRestartAt -or ((Get-Date) - $script:LastTunnelRestartAt).TotalSeconds -ge 45
            if ($cooldownOk) {
                $newTunnel = Start-TunnelProcess -Force
                $tunnelPid = if($newTunnel){$newTunnel.Id}else{0}
                $script:LastTunnelRestartAt = Get-Date
                $tunnelProcUp = Test-TunnelProcessRunning
                $tunnelEdgeOk = Test-TunnelEdgeHealthy
                if (-not $tunnelError) { $tunnelError = "Tunnel restarted - wait for edge connected + new URL" }
            }
        }
        Show-Dashboard -ServerUp $serverUp -UiUp $uiUp -TunnelProcUp $tunnelProcUp -TunnelUrl $tunnelUrl -TunnelMode $tunnelMode -TunnelError $tunnelError

        $cmd = Read-Host "  Command"
        if ($cmd) {
            try {
                $newPids = Invoke-DashboardCommand $cmd
                if ($newPids) {
                    $serverPid = $newPids.ServerPid
                    $vitePid = $newPids.VitePid
                    $tunnelPid = $newPids.TunnelPid
                }
            } catch {
                Write-Host ""
                Write-Host ("  ERROR: {0}" -f $_.Exception.Message) -ForegroundColor Red
                Write-Host "  Services are still running. Press Enter to return to menu." -ForegroundColor DarkYellow
                Read-Host ""
            }
            if ($script:ShouldQuit) { break }
        }
    }
}
finally {
    if ($script:ShouldQuit) {
        Write-Host ""
        Write-Host "Stopping background services..." -ForegroundColor Yellow
        Stop-AllChildren
        Write-Host "Done. You can close this window." -ForegroundColor Green
        Read-Host "Press Enter to close"
    }
}
