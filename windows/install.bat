@echo off
title IC Recon - Installation
echo ============================================
echo   IC Recon - Intercompany Reconciliation
echo   Windows Installation Script
echo ============================================
echo.

:: Navigate to project root (parent of windows folder)
cd /d "%~dp0.."
set "APP_DIR=%cd%"

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
echo [OK] App directory: %APP_DIR%

:: Create required directories
if not exist "%APP_DIR%\data" mkdir "%APP_DIR%\data"
if not exist "%APP_DIR%\logs" mkdir "%APP_DIR%\logs"

:: Install dependencies
echo.
echo [STEP 1/3] Installing dependencies...
call npm install 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [OK] Dependencies installed

:: Rebuild native modules for Windows
echo.
echo [STEP 2/3] Rebuilding native modules...
call npm rebuild better-sqlite3 2>nul
if %errorlevel% neq 0 (
    echo [NOTE] Rebuild attempt failed, reinstalling better-sqlite3...
    call npm install better-sqlite3
)
echo [OK] Native modules ready

:: Build production bundle
echo.
echo [STEP 3/3] Building production bundle...
call npm run build 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo [OK] Production build complete

:: Setup auto-start
echo.
echo Setting up auto-start...

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP_DIR%\ICRecon.lnk"
set "VBS_PATH=%APP_DIR%\windows\start-hidden.vbs"

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_PATH%\"'; $s.WorkingDirectory = '%APP_DIR%'; $s.Description = 'IC Recon Server'; $s.Save()" 2>nul

if exist "%SHORTCUT%" (
    echo [OK] Auto-start shortcut created in Startup folder
) else (
    echo [WARN] Could not create auto-start shortcut
    echo        You can manually run windows\start-hidden.vbs to start the server
)

echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo The application will:
echo   - Start automatically when Windows boots
echo   - Run silently in the background
echo   - Be accessible at http://localhost:3000
echo.
echo Quick commands:
echo   Start now:   Double-click windows\start-hidden.vbs
echo   Stop:        Double-click windows\stop-server.vbs
echo   Dev mode:    Double-click windows\dev.bat
echo   Uninstall:   Run windows\uninstall.bat
echo.
echo Server logs: logs\server.log
echo Database:    data\reconciliation.db
echo.
pause
