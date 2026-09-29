@echo off
setlocal EnableExtensions
title Student Marks Sorting ^& Ranking System (Merge Sort)
cd /d "%~dp0"

echo ============================================================
echo   Student Marks Sorting ^& Ranking System - Merge Sort (DAA)
echo ============================================================
echo.

rem ---- 1. Find Python 3 (py launcher first, then python) ----
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
    python --version >nul 2>nul && set "PY=python"
)
if not defined PY (
    echo [!] Python 3 was not found.
    echo     Install Python 3.10 or newer from https://www.python.org/downloads/
    echo     and tick "Add python.exe to PATH" during installation.
    goto :fail
)

rem ---- 2. Create the virtual environment (first run only) ----
if not exist "venv\Scripts\python.exe" (
    echo [1/4] Creating virtual environment in .\venv ...
    %PY% -m venv venv
    if errorlevel 1 (
        echo [!] Could not create the virtual environment.
        goto :fail
    )
) else (
    echo [1/4] Virtual environment found.
)
set "VPY=venv\Scripts\python.exe"

rem ---- 3. Install packages (only when requirements.txt changed) ----
fc /b "backend\requirements.txt" "venv\requirements.installed" >nul 2>nul
if errorlevel 1 (
    echo [2/4] Installing Python packages, this takes a minute the first time ...
    "%VPY%" -m pip install --disable-pip-version-check -q -r "backend\requirements.txt"
    if errorlevel 1 (
        echo [!] Package installation failed. Check your internet connection and run again.
        goto :fail
    )
    copy /y "backend\requirements.txt" "venv\requirements.installed" >nul
) else (
    echo [2/4] Python packages already installed.
)

rem ---- 4. Connect to PostgreSQL, create database and table ----
:setup_db
echo [3/4] Preparing the PostgreSQL database ...
"%VPY%" "backend\setup_db.py" --sample-if-empty
if errorlevel 1 (
    echo.
    choice /c YN /m "Re-enter the PostgreSQL connection details"
    if errorlevel 2 goto :fail
    del "backend\.env" >nul 2>nul
    goto :setup_db
)

rem ---- 5. Start the server and open the browser ----
echo [4/4] Starting the application at http://127.0.0.1:5000
echo       Keep this window open during the demo. Press Ctrl+C to stop.
echo.
set "OPEN_BROWSER=1"
"%VPY%" "backend\app.py"
echo.
echo Server stopped.
pause
exit /b 0

:fail
echo.
echo Setup did not finish. See the message above and docs\SETUP_WINDOWS.md
pause
exit /b 1
