@echo off
title IC Recon - Uninstall
echo ============================================
echo   IC Recon - Uninstall
echo ============================================
echo.

:: Stop server
echo Stopping server...
wscript "%~dp0stop-server.vbs"
timeout /t 2 /nobreak >nul

:: Remove startup shortcut
set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ICRecon.lnk"
if exist "%SHORTCUT%" (
    del "%SHORTCUT%"
    echo [OK] Auto-start removed
) else (
    echo [OK] No auto-start entry found
)

echo.
echo Uninstall complete.
echo The application files remain in this folder.
echo You can delete this folder to fully remove the app.
echo.
pause
