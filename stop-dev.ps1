param(
  [int[]]$Ports = @(3000, 5173, 8000)
)

$ErrorActionPreference = 'Stop'

function Get-ListeningPids {
  param(
    [int]$Port
  )

  $lines = netstat -ano | Select-String ":$Port"
  $pids = @()

  foreach ($line in $lines) {
    $text = ($line.ToString() -replace '\s+', ' ').Trim()
    if ($text -match 'LISTENING (\d+)$') {
      $pids += [int]$matches[1]
    }
  }

  return $pids | Select-Object -Unique
}

foreach ($port in $Ports) {
  $pids = Get-ListeningPids -Port $port

  if (-not $pids.Count) {
    Write-Host "[Port $port] no listening process found." -ForegroundColor Yellow
    continue
  }

  foreach ($pid in $pids) {
    try {
      Stop-Process -Id $pid -Force
      Write-Host "[Port $port] stopped PID $pid." -ForegroundColor Green
    } catch {
      Write-Host "[Port $port] failed to stop PID ${pid}: $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}
