@echo off
title GridSense FDIR Supervisory Dashboard
cd /d "%~dp0"
python gridsense_dashboard.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Dashboard exited with an error. Press any key to close.
    pause >nul
)
