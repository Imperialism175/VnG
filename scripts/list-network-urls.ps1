# Печатает все сетевые URL для приглашения игроков
$ErrorActionPreference = 'SilentlyContinue'
$port = 5173

$ips = @(
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -ne '127.0.0.1' -and
      $_.PrefixOrigin -ne 'WellKnown' -and
      $_.IPAddress -notmatch '^169\.254\.'
    } |
    Select-Object -ExpandProperty IPAddress -Unique
)

Write-Host "    Local:     http://localhost:${port}/"

foreach ($ip in ($ips | Sort-Object)) {
  $tag = switch -Wildcard ($ip) {
    '26.*'        { 'VPN' }
    '192.168.*'   { 'LAN' }
    '10.*'        { 'LAN' }
    default       { 'NET' }
  }
  Write-Host ("    {0,-4}      http://{1}:{2}/" -f $tag, $ip, $port)
}

if (-not $ips -or $ips.Count -eq 0) {
  Write-Host "    (no other IPs found)"
}
