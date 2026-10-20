@echo off
REM Sobe o app Tem Agua? (API + mapa + painel + shell) e abre o link HTTPS publico.
REM Feche esta janela ou aperte Ctrl+C para parar tudo.
cd /d "%~dp0tem-agua"
call npm run dev:ngrok
pause
