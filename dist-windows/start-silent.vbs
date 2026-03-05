Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullPath)
WshShell.CurrentDirectory = strPath

If Not fso.FolderExists(strPath & "\node_modules\better-sqlite3") Then
    WshShell.Run "cmd /c cd /d """ & strPath & """ && npm install --production --no-optional", 1, True
End If

WshShell.Run "cmd /c cd /d """ & strPath & """ && set PORT=5000 && set NODE_ENV=production && node server.cjs", 0, False

WScript.Sleep 2000
WshShell.Run "http://localhost:5000", 1, False
