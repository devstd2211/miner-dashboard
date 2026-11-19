# One-time preparation of an Android phone for the dashboard, over USB (adb):
#   1. downloads Termux and Termux:Boot from their GitHub releases (APK for the phone's CPU),
#      checks the published SHA-256 and installs both;
#   2. opens Termux once (it unpacks its base system) and Termux:Boot once (enables boot scripts);
#   3. upgrades Termux packages and installs Node.js (nodejs-lts);
#   4. excludes Termux from battery optimisation so Android does not stop the server.
# Then install the dashboard with scripts\deploy-android.ps1.
#   powershell -ExecutionPolicy Bypass -File scripts\setup-android.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\setup-android.ps1 -AllowUnverifiedInstall
# Play Protect may refuse the APKs over USB (INSTALL_FAILED_VERIFICATION_FAILURE). Either confirm
# "Install anyway" on the phone's screen while the script runs, or pass -AllowUnverifiedInstall:
# it turns off verification of USB installs just for these two APKs and turns it back on after.
param([switch]$AllowUnverifiedInstall, [string]$Adb)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\android\common.ps1"
$Adb = Find-Adb $Adb
Assert-OneDevice

$abis = ((& $Adb shell getprop ro.product.cpu.abilist) -split ',') | ForEach-Object { $_.Trim() }
$abi = @('arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86') | Where-Object { $abis -contains $_ } | Select-Object -First 1
if (-not $abi) { throw "Unknown CPU ABIs: $abis" }
Write-Host "Phone: $(& $Adb shell getprop ro.product.model), Android $(& $Adb shell getprop ro.build.version.release), $abi"

# --- 1. Download and install the APKs ----------------------------------------------------------
$dir = Join-Path $env:TEMP 'miner-dashboard-android'
New-Item -ItemType Directory -Force $dir | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-ReleaseApk([string]$Repo, [string]$ApkPattern, [string]$SumsPattern) {
    $rel = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing
    $apk = $rel.assets | Where-Object { $_.name -match $ApkPattern } | Select-Object -First 1
    $sums = $rel.assets | Where-Object { $_.name -match $SumsPattern } | Select-Object -First 1
    if (-not $apk -or -not $sums) { throw "No APK or checksum file in the latest $Repo release ($($rel.tag_name))." }
    $file = Join-Path $dir $apk.name
    Write-Host "Downloading $($apk.name)..."
    Invoke-WebRequest $apk.browser_download_url -OutFile $file -UseBasicParsing
    # Saved to a file: PowerShell 5.1 returns binary-typed downloads as bytes, not text.
    $sumsFile = Join-Path $dir $sums.name
    Invoke-WebRequest $sums.browser_download_url -OutFile $sumsFile -UseBasicParsing
    $line = Get-Content $sumsFile | Where-Object { $_ -match [regex]::Escape($apk.name) } | Select-Object -First 1
    $expected = ($line -split '\s+')[0]
    $actual = (Get-FileHash $file -Algorithm SHA256).Hash
    if (-not $expected -or $actual -ne $expected.ToUpper()) { throw "SHA-256 mismatch for $($apk.name)." }
    $file
}

function Install-Apk([string]$File) {
    $out = (& $Adb install -r $File 2>&1) -join "`n"
    if ($out -match 'Success') { Write-Host "Installed $(Split-Path $File -Leaf)"; return $true }
    if ($out -match 'VERIFICATION_FAILURE') { return $false }
    throw "adb install failed: $out"
}

$installed = (& $Adb shell pm list packages) | ForEach-Object { $_.Trim() }
$apks = @()
if ($installed -notcontains 'package:com.termux') {
    $apks += Get-ReleaseApk 'termux/termux-app' "github-debug_$abi\.apk$" 'sha256sums$'
}
if ($installed -notcontains 'package:com.termux.boot') {
    $apks += Get-ReleaseApk 'termux/termux-boot' '\.apk$' 'checksums-sha256\.txt$'
}
foreach ($apk in $apks) {
    if (Install-Apk $apk) { continue }
    if (-not $AllowUnverifiedInstall) {
        throw ("Play Protect refused $(Split-Path $apk -Leaf). Run again and tap 'Install anyway' on the phone, " +
            'or add -AllowUnverifiedInstall.')
    }
    Write-Host 'Play Protect refused the APK: turning off USB install verification for a moment...'
    $old = (& $Adb shell settings get global verifier_verify_adb_installs).Trim()
    try {
        Invoke-Adb shell settings put global verifier_verify_adb_installs 0
        if (-not (Install-Apk $apk)) { throw "Install of $apk still refused." }
    } finally {
        if ($old -eq 'null' -or -not $old) { $old = '1' }
        & $Adb shell settings put global verifier_verify_adb_installs $old
        Write-Host "USB install verification restored ($old)."
    }
}

# --- 2. First start of Termux and Termux:Boot --------------------------------------------------
Write-Host 'Opening Termux (first start unpacks its base system)...'
Invoke-Adb shell am start -n com.termux/.app.TermuxActivity | Out-Null
$ready = $false
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
    & $Adb shell "run-as com.termux ls $Termux/usr/bin/pkg" 2>$null | Out-Null
    $ready = $LASTEXITCODE -eq 0
    if (-not $ready) { Start-Sleep -Seconds 5 }
}
if (-not $ready) { throw 'Termux did not finish its first start in 5 minutes: open it on the phone and check.' }
Invoke-Adb shell am start -n com.termux.boot/.BootActivity | Out-Null
Start-Sleep -Seconds 2
Invoke-Adb shell am start -n com.termux/.app.TermuxActivity | Out-Null

# --- 3. Node.js --------------------------------------------------------------------------------
# A full upgrade first: a fresh Termux has old libraries and the new node fails to link without it.
Write-Host 'Upgrading Termux packages and installing Node.js (a few minutes)...'
Invoke-Termux @'
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y -o Dpkg::Options::=--force-confnew full-upgrade
apt-get -y install nodejs-lts
echo "node $(node -v)"
'@

# --- 4. Battery optimisation -------------------------------------------------------------------
Invoke-Adb shell dumpsys deviceidle whitelist +com.termux | Out-Null
Invoke-Adb shell dumpsys deviceidle whitelist +com.termux.boot | Out-Null
& $Adb shell cmd appops set com.termux RUN_IN_BACKGROUND allow 2>$null

Write-Host "Phone ready ($(Get-PhoneIp)). Now: powershell -ExecutionPolicy Bypass -File scripts\deploy-android.ps1 -CopyData"
