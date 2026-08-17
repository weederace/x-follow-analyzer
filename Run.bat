@echo off
title X Follow Analyzer - Pro Max
color 0B

echo =======================================================
echo    X Follow Analyzer Pro Max - Auto Launcher
echo =======================================================
echo.

echo [1/2] Checking and installing required packages...
pip install -r requirements.txt
echo.

echo [2/2] Starting the local server and opening dashboard...
python x_analyzer_server.py

echo.
echo [!] Server stopped or an error occurred.
pause