param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-PortOpen {
  param(
    [int]$Port
  )

  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $asyncResult = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $connected = $asyncResult.AsyncWaitHandle.WaitOne(300)

    if ($connected -and $client.Connected) {
      $client.EndConnect($asyncResult) | Out-Null
      $client.Close()
      return $true
    }

    $client.Close()
    return $false
  } catch {
    return $false
  }
}

function Test-HttpHealthy {
  param(
    [string]$Url
  )

  if (-not $Url) {
    return $false
  }

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  } catch {
    return $false
  }
}

function Test-CommandExists {
  param(
    [string]$Name
  )

  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Start-ServiceWindow {
  param(
    [string]$Title,
    [string]$WorkingDir,
    [string]$Command
  )

  $bootstrap = @"
Set-Location -LiteralPath '$WorkingDir'
`$Host.UI.RawUI.WindowTitle = '$Title'
Write-Host "[$Title] starting in $WorkingDir" -ForegroundColor Cyan
try {
  Invoke-Expression '$Command'
} catch {
  Write-Host "[$Title] failed:" -ForegroundColor Red
  Write-Host `$_.Exception.Message -ForegroundColor Red
}
"@

  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($bootstrap))

  Start-Process powershell -WorkingDirectory $WorkingDir -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', $encoded
  ) | Out-Null
}

$chromaDataPath = Join-Path $root 'chroma-data'
if (-not (Test-Path -LiteralPath $chromaDataPath)) {
  New-Item -ItemType Directory -Path $chromaDataPath | Out-Null
}

$services = @(
  @{
    Name = 'Chroma'
    Title = 'Chroma'
    Port = 8000
    WorkingDir = $root
    Command = "chroma run --path `".\chroma-data`""
    CommandName = 'chroma'
    HealthUrl = 'http://localhost:8000'
  },
  @{
    Name = 'Backend'
    Title = 'Backend'
    Port = 3000
    WorkingDir = $root
    Command = 'node src/server.js'
    CommandName = 'node'
    HealthUrl = 'http://localhost:3000/health'
  },
  @{
    Name = 'Frontend'
    Title = 'Frontend'
    Port = 5173
    WorkingDir = (Join-Path $root 'frontend')
    Command = 'npm run dev'
    CommandName = 'npm'
    HealthUrl = 'http://localhost:5173'
  }
)

foreach ($service in $services) {
  if (-not (Test-Path -LiteralPath $service.WorkingDir)) {
    Write-Host "[$($service.Name)] skipped: directory not found: $($service.WorkingDir)" -ForegroundColor Yellow
    continue
  }

  if (-not $Force -and (Test-PortOpen -Port $service.Port)) {
    if ($service.HealthUrl -and (Test-HttpHealthy -Url $service.HealthUrl)) {
      Write-Host "[$($service.Name)] already running on port $($service.Port), skipped." -ForegroundColor Yellow
    } else {
      Write-Host "[$($service.Name)] port $($service.Port) is occupied, but health check failed: $($service.HealthUrl)" -ForegroundColor Red
      Write-Host "[$($service.Name)] close the stale process on this port, then rerun the script." -ForegroundColor Red
    }
    continue
  }

  if (-not (Test-CommandExists -Name $service.CommandName)) {
    Write-Host "[$($service.Name)] skipped: command not found: $($service.CommandName)" -ForegroundColor Yellow
    if ($service.Name -eq 'Chroma') {
      Write-Host "Install the Chroma CLI first, then rerun this script." -ForegroundColor Yellow
    }
    continue
  }

  Start-ServiceWindow -Title $service.Title -WorkingDir $service.WorkingDir -Command $service.Command
  Write-Host "[$($service.Name)] launched." -ForegroundColor Green
  Start-Sleep -Milliseconds 400
}

Write-Host ''
Write-Host 'Service endpoints:' -ForegroundColor Cyan
Write-Host '  Chroma   -> http://localhost:8000'
Write-Host '  Backend  -> http://localhost:3000'
Write-Host '  Frontend -> http://localhost:5173'
Write-Host ''
Write-Host 'Use -Force to reopen all windows without checking ports.'
