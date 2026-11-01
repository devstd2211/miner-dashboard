' Starts the dashboard (next start -p 3100) without a console window and restarts it
' whenever it exits. Used by the "MinerDashboard" scheduled task.
' Usage: wscript.exe run-hidden.vbs "C:\path\to\node.exe"
Option Explicit
Dim sh, fso, appDir, logDir, logFile, nodeExe, q, cmd

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
logDir = appDir & "\logs"
logFile = logDir & "\server.log"
nodeExe = WScript.Arguments(0)
q = Chr(34)

sh.CurrentDirectory = appDir
If Not fso.FolderExists(logDir) Then fso.CreateFolder logDir

cmd = "cmd.exe /c " & q & q & nodeExe & q & " node_modules\next\dist\bin\next start -p 3100 >> " & _
      q & logFile & q & " 2>&1" & q

Do
  ' Keep one previous log, start a new one when it grows past 10 MB.
  If fso.FileExists(logFile) Then
    If fso.GetFile(logFile).Size > 10485760 Then fso.CopyFile logFile, logDir & "\server.old.log", True : fso.DeleteFile logFile
  End If
  sh.Run cmd, 0, True   ' 0 = hidden window, True = wait for exit
  WScript.Sleep 10000   ' crashed or exited: restart in 10 s
Loop
