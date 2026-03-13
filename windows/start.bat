@echo off
title IC Reconciliation Platform
echo ============================================
echo   IC Reconciliation Platform
echo ============================================
echo.

:: Navigate to project root (parent of windows folder)
cd /d "%~dp0.."

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Please install Node.js v20 LTS from https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('node -v') do set NODE_VERSION=%%a
echo Node.js version: %NODE_VERSION%
echo.

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies.
        pause
        exit /b 1
    )
    echo.
)

if not exist "dist\public\index.html" (
    echo Building application...
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Build failed.
        pause
        exit /b 1
    )
    echo.
)

if not exist "data" mkdir data
if not exist "logs" mkdir logs

echo ============================================
echo   Open http://localhost:3000 in your browser
echo   Press Ctrl+C to stop the server
echo ============================================
echo.

set NODE_ENV=production
set PORT=3000
node dist/index.cjs

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Server exited with an error. Check the output above.
    echo.
)
pause
