@echo off
call "%~dp0restore-native.cmd" %*
exit /b %ERRORLEVEL%
