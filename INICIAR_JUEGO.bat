@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DETECTIVES DIGITALES - SERVIDOR WIFI
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: No se encuentra Node.js en esta computadora.
  echo Instala Node.js 18 o superior UNA SOLA VEZ antes de jugar.
  echo Una vez instalado, el juego funciona sin Internet.
  echo.
  pause
  exit /b 1
)
echo.
echo Iniciando Detectives Digitales... No cierres esta ventana.
node server.js
echo.
echo El servidor se ha detenido.
pause
