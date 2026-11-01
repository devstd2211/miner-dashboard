# Registers the 'MinerDashboard' Task Scheduler task: starts the dashboard (port 3100) hidden
# at Windows startup (no logon needed) and at logon, restarts it if it crashes.
# Needs admin rights to register a "run whether user is logged on or not" (S4U) task:
# the script asks for elevation via UAC by itself.
#   powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
param([string]$User, [string]$Node)
$ErrorActionPreference = 'Stop'

$TaskName = 'MinerDashboard'
$AppDir = Split-Path -Parent $PSScriptRoot
$LogFile = Join-Path $AppDir 'logs\install.log'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    # Resolve user and node.exe here (non-elevated) and pass them to the elevated copy.
    if (-not (Test-Path (Join-Path $AppDir '.next\BUILD_ID'))) {
        throw "No production build found. Run 'npm run build' in $AppDir first."
    }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    New-Item -ItemType Directory -Force (Split-Path $LogFile) | Out-Null
    Remove-Item $LogFile -ErrorAction SilentlyContinue
    Write-Host 'Requesting administrator rights (UAC)...'
    $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"",
        '-User', "`"$env:USERDOMAIN\$env:USERNAME`"", '-Node', "`"$node`"")
    if (Test-Path $LogFile) { Get-Content $LogFile }
    exit $p.ExitCode
}

try {
    if (-not $User) { $User = "$env:USERDOMAIN\$env:USERNAME" }
    if (-not $Node) { $Node = (Get-Command node.exe -ErrorAction Stop).Source }

    $launcher = Join-Path $AppDir 'scripts\run-hidden.vbs'
    $action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wscript.exe" `
        -Argument "`"$launcher`" `"$Node`"" -WorkingDirectory $AppDir

    $atStartup = New-ScheduledTaskTrigger -AtStartup
    $atStartup.Delay = 'PT30S' # give the network time to come up
    $atLogon = New-ScheduledTaskTrigger -AtLogOn -User $User

    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    # S4U = run whether the user is logged on or not, without storing a password.
    # Limited = no admin rights for the server itself.
    $principal = New-ScheduledTaskPrincipal -UserId $User -LogonType S4U -RunLevel Limited

    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $atStartup, $atLogon `
        -Settings $settings -Principal $principal -Force `
        -Description 'Bitcoin miner dashboard (Next.js, http://localhost:3100)' | Out-Null
    Start-ScheduledTask -TaskName $TaskName

    $msg = "Task '$TaskName' installed for $User (starts at Windows startup) and started.`n" +
           "Dashboard: http://localhost:3100`nLogs: $AppDir\logs\server.log"
    $msg | Set-Content $LogFile
    Write-Host $msg
} catch {
    "ERROR: $_" | Set-Content $LogFile
    throw
}
