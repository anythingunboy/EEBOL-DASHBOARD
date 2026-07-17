@echo off
REM ==============================================
REM Anodization Machine Status Server
REM Deploy on LAN at Port 3000
REM ==============================================

echo.
echo ====================================================================
echo   Anodization Machine Status - Web Server
echo ====================================================================
echo.

REM Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Start the server
echo Starting server...
echo.
node server.js

pause
