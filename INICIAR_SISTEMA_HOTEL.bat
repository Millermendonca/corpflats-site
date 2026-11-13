@echo off
title Guest Flow Manager - Servidor de Governanca e Limpeza
color 0A
cls
echo ================================================================
echo           GUEST FLOW MANAGER - SISTEMA DE HOTEL
echo ================================================================
echo.
echo [1/2] Iniciando sincronizador automatico com a nuvem...
start /b node sync-to-cloud.mjs
echo.
echo [2/2] Iniciando servidor do hotel...
cd /d "%~dp0"
node artifacts\limpeza\run-vite.mjs
pause
