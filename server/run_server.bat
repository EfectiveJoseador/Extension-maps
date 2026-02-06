@echo off
echo Starting Map Collaborator Local Server...
echo.
echo Please keep this window open while using the "Sync" button in the extension.
echo.
cd /d "%~dp0"
if not exist "db.json" (
    echo [] > db.json
    echo Created empty database file.
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b
)

node server.js
pause
