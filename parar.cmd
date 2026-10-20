@echo off
REM Derruba tudo que o iniciar.cmd subiu.
cd /d "%~dp0tem-agua"
call npm run stop
pause
