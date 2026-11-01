# Removes the 'MinerDashboard' scheduled task and stops the running dashboard.
# Asks for administrator rights via UAC (the task was registered as admin).
#   powershell -ExecutionPolicy Bypass -File scripts\uninstall-autostart.ps1
$ErrorActionPreference = 'Stop'

$TaskName = 'MinerDashboard'
$AppDir = Split-Path -Parent $PSScriptRoot
$LogFile = Join-Path $AppDir 'logs\uninstall.log'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    New-Item -ItemType Directory -Force (Split-Path $LogFile) | Out-Null
    Remove-Item $LogFile -ErrorAction SilentlyContinue
    Write-Host 'Requesting administrator rights (UAC)...'
    $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    if (Test-Path $LogFile) { Get-Content $LogFile }
    exit $p.ExitCode
}

$out = @()
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    $out += "Task '$TaskName' removed."
} else {
    $out += "Task '$TaskName' not found."
}

# Stopping the task does not always kill its child processes. Stop the launcher first
# (so it cannot restart the server), then the cmd/node processes it started.
function Stop-Matching([scriptblock]$filter) {
    Get-CimInstance Win32_Process | Where-Object $filter | ForEach-Object {
        "Stopping $($_.Name) (pid $($_.ProcessId))"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
$out += Stop-Matching { $_.Name -eq 'wscript.exe' -and $_.CommandLine -like '*run-hidden.vbs*' }
$out += Stop-Matching { $_.Name -in 'cmd.exe', 'node.exe' -and $_.CommandLine -like '*node_modules\next\dist\bin\next start -p 3100*' }

$out | Set-Content $LogFile
$out | Write-Host
