@echo off
setlocal
title X Follow Analyzer
cd /d "%~dp0"

echo =========================================================
echo    X Follow Analyzer
echo =========================================================
echo.
echo   1  Web dashboard   (opens in your browser)
echo   2  Desktop app     (its own window, no browser)
echo   3  Run the tests
echo.
set /p choice="Choose 1, 2 or 3 [1]: "
if "%choice%"=="" set choice=1

rem  py is the Windows launcher and is what a python.org install provides; plain
rem  python is what the Microsoft Store install provides. Try the launcher first so
rem  we do not land on the Store stub that only opens a download page.
where py >nul 2>nul && (set PY=py) || (set PY=python)

if "%choice%"=="3" goto tests

echo.
echo Installing what is missing (nothing happens if it is already there)...
rem  Only the web dashboard needs third-party packages. The desktop app runs on a
rem  stock Python; openpyxl is optional and only used if you export to Excel.
if "%choice%"=="2" (%PY% -m pip install --quiet openpyxl) else (%PY% -m pip install --quiet -r requirements.txt)
echo.

if "%choice%"=="2" (
  echo Starting the desktop app...
  %PY% x_follow_analyzer.py
) else (
  echo Starting the local server. Close this window to stop it.
  %PY% x_analyzer_server.py
)
goto done

:tests
echo.
%PY% tests\run_all.py

:done
echo.
echo Stopped. If something went wrong, the message above says what.
pause
