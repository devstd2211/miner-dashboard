# Rebuilds the dashboard and restarts the 'MinerDashboard' autostart task after a code update
# (git pull, npm install, ...): stop the task -> stop the server -> npm run build -> start the task.
# Stopping the task leaves the node server running in session 0, where a normal user may not
# kill it: then the script asks for one UAC confirmation to stop that single process.
#   powershell -ExecutionPolicy Bypass -File scripts\update.ps1
$ErrorActionPreference = 'Stop'

$TaskName = 'MinerDashboard'
$Port = 3100
$AppDir = Split-Path -Parent $PSScriptRoot

function Get-ServerPid {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { $c.OwningProcess }
}

if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
    throw "Task '$TaskName' not found. Install it with scripts\install-autostart.ps1 (after npm run build)."
}

Write-Host "Stopping task '$TaskName'..."
Stop-ScheduledTask -TaskName $TaskName

$serverPid = Get-ServerPid
if ($serverPid) {
    Write-Host "Stopping the server (PID $serverPid)..."
    try {
        Stop-Process -Id $serverPid -Force -ErrorAction Stop
    } catch {
        Write-Host 'Access denied, requesting administrator rights (UAC)...'
        Start-Process taskkill.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '/PID', $serverPid, '/F'
    }
    for ($i = 0; $i -lt 20 -and (Get-ServerPid); $i++) { Start-Sleep -Milliseconds 500 }
    if (Get-ServerPid) { throw "Port $Port is still in use, the server did not stop." }
}

Push-Location $AppDir
try {
    # Retry once: next build sometimes stops at the very end with a notice and exit code 1.
    for ($try = 1; $try -le 2; $try++) {
        Write-Host "npm run build (attempt $try)..."
        & npm.cmd run build
        if ($LASTEXITCODE -eq 0) { break }
    }
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed (exit $LASTEXITCODE). The task is stopped." }
} finally {
    Pop-Location
}

Write-Host "Starting task '$TaskName'..."
Start-ScheduledTask -TaskName $TaskName
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest "http://localhost:$Port/api/miners" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { Write-Host "Dashboard is up: http://localhost:$Port"; exit 0 }
    } catch {}
    Start-Sleep -Seconds 1
}
throw "The dashboard did not answer on port $Port within 60 s. See $AppDir\logs\server.log"
