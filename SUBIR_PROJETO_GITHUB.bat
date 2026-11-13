@echo off
title Enviando Guest Flow Manager para o GitHub
color 0B
cls
echo ================================================================
echo         ENVIANDO GUEST FLOW MANAGER PARA O GITHUB
echo ================================================================
echo.
echo Conectando ao seu repositorio no GitHub...
cd /d "%~dp0"
"%LOCALAPPDATA%\GitHubDesktop\app-3.3.6\resources\app\git\cmd\git.exe" push -u origin main
echo.
echo ================================================================
echo Se apareceu 'branch main set up to track origin/main', foi concluido com sucesso!
echo ================================================================
pause
