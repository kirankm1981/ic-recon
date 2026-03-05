@echo off
title IC Recon - Installation
echo ============================================
echo   IC Recon - Intercompany Reconciliation
echo   Windows Installation Script
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Please download and install Node.js from:
    echo   https://nodejs.org/
    echo.
    echo After installing Node.js, run this script again.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Node.js %NODE_VER% detected

:: Get script directory
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

:: Create required directories
if not exist "data" mkdir data
if not exist "logs" mkdir logs

:: Install dependencies
echo.
echo [STEP 1/4] Installing dependencies...
call npm install 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [OK] Dependencies installed

:: Build production bundle
echo.
echo [STEP 2/4] Building production bundle...
call npm run build 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo [OK] Production build complete

:: Push database schema
echo.
echo [STEP 3/4] Setting up SQLite database...
call npm run db:push 2>nul
echo [OK] Database ready

:: Setup auto-start
echo.
echo [STEP 4/4] Setting up auto-start...

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP_DIR%\ICRecon.lnk"
set "VBS_PATH=%APP_DIR%start-hidden.vbs"

:: Create shortcut using PowerShell
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_PATH%\"'; $s.WorkingDirectory = '%APP_DIR%'; $s.Description = 'IC Recon Server'; $s.Save()"

if exist "%SHORTCUT%" (
    echo [OK] Auto-start shortcut created in Startup folder
) else (
    echo [WARN] Could not create auto-start shortcut
    echo        You can manually copy start-hidden.vbs to your Startup folder:
    echo        %STARTUP_DIR%
)

echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo The application will:
echo   - Start automatically when Windows boots
echo   - Run silently in the background (no popup)
echo   - Be accessible at http://localhost:5000
echo.
echo To start now:  Double-click start-hidden.vbs
echo To stop:       Double-click stop-server.vbs
echo To uninstall:  Run uninstall.bat
echo.
echo Server logs saved to: logs\server.log
echo Database stored at:   data\reconciliation.db
echo.
pause
