# Shared by scripts\setup-android.ps1 and scripts\deploy-android.ps1 (dot-sourced): finds adb and
# runs shell commands inside Termux over USB.

$Termux = '/data/data/com.termux/files'

function Find-Adb([string]$Adb) {
    if ($Adb) { return $Adb }
    $cmd = Get-Command adb.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $found = @("$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe", 'E:\AndroidSDK\platform-tools\adb.exe',
        'C:\platform-tools\adb.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $found) { throw 'adb.exe not found: install Android platform-tools or pass -Adb <path>.' }
    $found
}

function Assert-OneDevice {
    $devices = @((& $script:Adb devices) -match "`tdevice$")
    if ($devices.Count -ne 1) {
        throw "Expected exactly one phone in 'adb devices', found $($devices.Count). Enable USB debugging and allow this PC on the phone."
    }
}

function Invoke-Adb { & $script:Adb @args; if ($LASTEXITCODE -ne 0) { throw "adb $args failed ($LASTEXITCODE)" } }

# Runs a shell script as the Termux app user with Termux's environment. Works with the GitHub and
# F-Droid builds of Termux (debuggable, so `run-as com.termux` is allowed). The script travels as
# base64: no quoting trouble and no CRLF line ends from PowerShell.
function Invoke-Termux([string]$Script, [switch]$NoThrow) {
    $envs = "HOME=$Termux/home PREFIX=$Termux/usr TMPDIR=$Termux/usr/tmp PATH=$Termux/usr/bin LANG=en_US.UTF-8 LD_PRELOAD=$Termux/usr/lib/libtermux-exec.so"
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($Script -replace "`r", '')))
    & $script:Adb shell "run-as com.termux env -i $envs $Termux/usr/bin/sh -c 'echo $b64 | base64 -d | sh'"
    if ($LASTEXITCODE -ne 0 -and -not $NoThrow) { throw "command on the phone failed ($LASTEXITCODE)" }
}

function Get-PhoneIp {
    ((& $script:Adb shell ip -4 addr show wlan0) -match 'inet ' | Select-Object -First 1) -replace '.*inet ([0-9.]+).*', '$1'
}
