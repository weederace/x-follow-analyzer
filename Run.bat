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
echo   4  Build the Android APK   (first time takes a while)
echo.
set /p choice="Choose 1, 2, 3 or 4 [1]: "
if "%choice%"=="" set choice=1

rem  py is the Windows launcher and is what a python.org install provides; plain
rem  python is what the Microsoft Store install provides. Try the launcher first so
rem  we do not land on the Store stub that only opens a download page.
where py >nul 2>nul && (set PY=py) || (set PY=python)

rem  The APK build leaves first because it is the one option that does not need Python
rem  (Node and a JDK do that work). Everything after this line does, so it is checked
rem  once, here: on a computer that has never run Python this is the first thing that
rem  goes wrong, and it is worth one sentence instead of "'python' is not recognized"
rem  four lines further down, or the Store stub quietly opening a download page.
if "%choice%"=="4" goto apk
%PY% -c "import sys" >nul 2>nul || goto nopython
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
goto done

:apk
rem  -ExecutionPolicy Bypass applies to this one process only and changes nothing on the
rem  machine: the default policy blocks unsigned local scripts, and this is one.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1"
goto done

:nopython
echo.
echo   Python is not installed, or is not on your PATH.
echo.
echo   Get it from  https://www.python.org/downloads/
echo   In the installer, tick "Add python.exe to PATH". That one checkbox is what is
echo   missing when Python is installed and you still see this message.
echo.
echo   Option 4 above (build the Android APK) does not need Python.

:done
echo.
echo Stopped. If something went wrong, the message above says what.
pause
