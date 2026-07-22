@echo off
setlocal
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-environment.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%WORKBUDDY_SKIN_NO_PAUSE%"=="1" pause
exit /b %RESULT%

