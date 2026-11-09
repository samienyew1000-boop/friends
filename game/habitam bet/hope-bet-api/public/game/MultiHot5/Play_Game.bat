@echo off
title Multi Hot 5 Launcher
cd /d "%~dp0"

echo ===================================================
echo   Launching Multi Hot 5 Standalone Game...
echo ===================================================

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node start.js
    goto :end
)

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start http://localhost:8080/
    python -m http.server 8080
    goto :end
)

start index.html

:end
pause
