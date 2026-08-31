@echo off
title Guest Flow Manager - Sincronizador Automatico de Planilha
echo ========================================================
echo   GUEST FLOW MANAGER - SINCRONIZADOR EM TEMPO REAL
echo ========================================================
echo.
echo Monitorando seu Excel: Calendario de Reservas 23-11-2025.xlsx
echo Sempre que voce salvar (Ctrl + S), a nuvem atualiza na mesma hora!
echo.
node sync-daemon.mjs
pause
