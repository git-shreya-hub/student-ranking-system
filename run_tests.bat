@echo off
setlocal
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
    echo Run run.bat once first to create the virtual environment.
    pause
    exit /b 1
)
"venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q pytest
"venv\Scripts\python.exe" -m pytest tests -v
pause
