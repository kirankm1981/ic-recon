@echo off
:: Navigate to project root (parent of windows folder)
cd /d "%~dp0.."
if not exist logs mkdir logs
if not exist data mkdir data
set NODE_ENV=production
set PORT=3000
powershell -Command "$p = Start-Process -FilePath 'node' -ArgumentList 'dist\index.cjs' -WindowStyle Hidden -RedirectStandardOutput 'logs\server.log' -RedirectStandardError 'logs\server-error.log' -PassThru; $p.Id | Out-File -FilePath 'windows\server.pid' -Encoding ascii -NoNewline"
