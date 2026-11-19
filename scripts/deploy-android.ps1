# Builds the dashboard as a standalone Node server and installs it on an Android phone in Termux
# over USB (adb): ~/miner-dashboard/{app,data,logs,start.sh,stop.sh} + Termux:Boot autostart.
# Prepare the phone once with scripts\setup-android.ps1 (Termux, Termux:Boot, Node.js).
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-android.ps1             # update the app
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-android.ps1 -CopyData   # also copy data\
# -CopyData overwrites the phone's data with the PC's: only use it while the PC dashboard is stopped
# and the phone's data is not newer (first install, or moving back and forth on purpose).
param([switch]$CopyData, [switch]$NoBuild, [string]$Adb)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\android\common.ps1"

$AppDir = Split-Path -Parent $PSScriptRoot
$Out = Join-Path $AppDir '.next-standalone'
$Remote = "$Termux/home/miner-dashboard"
$Adb = Find-Adb $Adb

Assert-OneDevice
Invoke-Termux 'command -v node >/dev/null || { echo "node not found: run scripts\setup-android.ps1 first"; exit 1; }; node -v'

Push-Location $AppDir
try {
    if (-not $NoBuild) {
        if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
        $env:NEXT_STANDALONE = '1'
        try {
            # Retry once: next build sometimes stops at the very end with a notice and exit code 1.
            for ($try = 1; $try -le 2; $try++) {
                Write-Host "next build, standalone (attempt $try)..."
                & npx.cmd next build
                if ($LASTEXITCODE -eq 0) { break }
            }
            if ($LASTEXITCODE -ne 0) { throw "next build failed (exit $LASTEXITCODE)." }
        } finally { Remove-Item Env:NEXT_STANDALONE }
    }
    $stand = Join-Path $Out 'standalone'
    if (-not (Test-Path "$stand\server.js")) { throw "No standalone build in $stand." }

    # Stage: app\ (the standalone server), start.sh, stop.sh and with -CopyData data\.
    $pkg = Join-Path $Out 'android.tgz'
    $stage = Join-Path $Out 'android'
    if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    New-Item -ItemType Directory $stage | Out-Null
    Copy-Item -Recurse $stand (Join-Path $stage 'app')
    # server.js serves the client files only if they sit next to it; sharp (image optimisation,
    # unused here) ships Windows binaries only.
    Copy-Item -Recurse (Join-Path $Out 'static') (Join-Path $stage 'app\.next-standalone\static')
    Get-ChildItem "$stage\app\node_modules\@img" -Directory -Filter 'sharp-*' -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force
    Copy-Item "$PSScriptRoot\android\*.sh" $stage
    if ($CopyData) {
        Copy-Item -Recurse (Join-Path $AppDir 'data') (Join-Path $stage 'data')
        Get-ChildItem "$stage\data" -Filter '*.tmp' | Remove-Item
    }
    & tar.exe -czf $pkg -C $stage .
    if ($LASTEXITCODE -ne 0) { throw 'tar failed.' }
    Write-Host ('Package: {0:N1} MB' -f ((Get-Item $pkg).Length / 1MB))
} finally {
    Pop-Location
}

Invoke-Adb push $pkg /data/local/tmp/miner-dashboard.tgz
$copyDataCmd = if ($CopyData) { 'rm -rf data && mv new/data data' } else { 'true' }
Invoke-Termux @"
set -e
cd ~
mkdir -p miner-dashboard/logs miner-dashboard/data .termux/boot
cd miner-dashboard
rm -rf new && mkdir new
tar -xzf /data/local/tmp/miner-dashboard.tgz -C new
sh new/stop.sh
rm -rf app.old && { [ -d app ] && mv app app.old || true; } && mv new/app app
$copyDataCmd
mv -f new/*.sh . && chmod 700 *.sh && rm -rf new app.old
printf '#!/data/data/com.termux/files/usr/bin/sh\nexec sh ~/miner-dashboard/start.sh\n' > ~/.termux/boot/miner-dashboard
chmod 700 ~/.termux/boot/miner-dashboard
setsid nohup sh start.sh > /dev/null 2>&1 < /dev/null &
echo installed
"@
& $Adb shell rm -f /data/local/tmp/miner-dashboard.tgz

$ip = Get-PhoneIp
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest "http://${ip}:3100/api/miners" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { Write-Host "Dashboard is up: http://${ip}:3100"; exit 0 }
    } catch {}
    Start-Sleep -Seconds 2
}
throw "No answer from http://${ip}:3100 within 2 min. Log: adb shell run-as com.termux cat $Remote/logs/server.log"
