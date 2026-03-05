@echo off
cd /d "%~dp0"
if not exist logs mkdir logs
if not exist data mkdir data
set NODE_ENV=production
powershell -Command "$p = Start-Process -FilePath 'node' -ArgumentList 'dist\index.cjs' -WindowStyle Hidden -RedirectStandardOutput 'logs\server.log' -RedirectStandardError 'logs\server-error.log' -PassThru; $p.Id | Out-File -FilePath 'server.pid' -Encoding ascii -NoNewline"
