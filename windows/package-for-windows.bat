@echo off
title IC Recon - Package for Windows
echo ============================================
echo   Creating Windows Distribution Package
echo ============================================
echo.

set "APP_DIR=%~dp0.."
set "DIST_DIR=%APP_DIR%\ic-recon-windows"

:: Clean previous package
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%"
mkdir "%DIST_DIR%"
mkdir "%DIST_DIR%\data"
mkdir "%DIST_DIR%\logs"
mkdir "%DIST_DIR%\dist"
mkdir "%DIST_DIR%\shared"

:: Copy production files
echo Copying production files...
xcopy "%APP_DIR%\dist\*" "%DIST_DIR%\dist\" /E /Q /Y >nul 2>&1
if exist "%APP_DIR%\migrations" (
    mkdir "%DIST_DIR%\migrations"
    xcopy "%APP_DIR%\migrations\*" "%DIST_DIR%\migrations\" /E /Q /Y >nul 2>&1
)
copy "%APP_DIR%\package.json" "%DIST_DIR%\" >nul
if exist "%APP_DIR%\package-lock.json" copy "%APP_DIR%\package-lock.json" "%DIST_DIR%\" >nul
copy "%APP_DIR%\drizzle.config.ts" "%DIST_DIR%\" >nul
copy "%APP_DIR%\tsconfig.json" "%DIST_DIR%\" >nul 2>&1
xcopy "%APP_DIR%\shared\*" "%DIST_DIR%\shared\" /E /Q /Y >nul 2>&1

:: Copy Windows scripts
copy "%APP_DIR%\windows\start-hidden.vbs" "%DIST_DIR%\" >nul
copy "%APP_DIR%\windows\start-server.bat" "%DIST_DIR%\" >nul
copy "%APP_DIR%\windows\stop-server.vbs" "%DIST_DIR%\" >nul
copy "%APP_DIR%\windows\install.bat" "%DIST_DIR%\" >nul
copy "%APP_DIR%\windows\uninstall.bat" "%DIST_DIR%\" >nul

echo.
echo [OK] Package created at: ic-recon-windows\
echo.
echo Contents:
echo   install.bat       - Run first to set up the app
echo   start-hidden.vbs  - Start server silently
echo   start-server.bat  - Server launcher (called by VBS)
echo   stop-server.vbs   - Stop the server
echo   uninstall.bat     - Remove auto-start
echo.
echo To distribute:
echo   1. Zip the "ic-recon-windows" folder
echo   2. On target Windows PC, extract and run install.bat
echo   3. Node.js must be pre-installed on the target PC
echo.
pause
