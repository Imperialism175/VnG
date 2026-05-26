# Выбирает лучший URL для открытия браузера (хост)
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

if (-not $ips) {
  $ips = @(
    Get-WmiObject Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" |
      ForEach-Object { $_.IPAddress } |
      Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -ne '127.0.0.1' }
  )
}

$radmin = $ips | Where-Object { $_ -like '26.*' } | Select-Object -First 1
$lan    = $ips | Where-Object { $_ -like '192.168.*' -or $_ -like '10.*' } | Select-Object -First 1
$any    = $ips | Select-Object -First 1

$hostIp = if ($radmin) { $radmin } elseif ($lan) { $lan } elseif ($any) { $any } else { 'localhost' }

Write-Output "http://${hostIp}:${port}/"
