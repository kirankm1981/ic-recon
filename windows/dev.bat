@echo off
title IC Reconciliation Platform (Dev Mode)
echo ============================================
echo   IC Reconciliation Platform - Dev Mode
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

if not exist "data" mkdir data

echo Starting development server...
echo.
echo ============================================
echo   Open http://localhost:3000 in your browser
echo   Press Ctrl+C to stop
echo ============================================
echo.

set NODE_ENV=development
set PORT=3000
npx tsx server/index.ts
pause
