@echo off
chcp 65001 >nul
title DETECTIVES DIGITALES - PERMITIR CELULARES
rem Abre el puerto del juego (3000) en el Firewall de Windows solo para redes privadas,
rem para que los celulares conectados al mismo Wi-Fi puedan entrar a la sala.
rem Para quitar el permiso: netsh advfirewall firewall delete rule name="Detectives Digitales"
net session >nul 2>&1
if errorlevel 1 (
  echo Windows va a pedir permiso de administrador para cambiar el firewall.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
netsh advfirewall firewall delete rule name="Detectives Digitales" >nul 2>&1
netsh advfirewall firewall add rule name="Detectives Digitales" dir=in action=allow protocol=TCP localport=3000 profile=private
if errorlevel 1 goto fallo
echo.
echo Listo: los celulares del mismo Wi-Fi ya pueden entrar al juego.
echo Revisa que la red Wi-Fi este marcada como Privada:
echo Configuracion - Red e Internet - Wi-Fi - tu red - Tipo de perfil de red - Privada.
echo.
pause
exit /b 0
:fallo
echo.
echo No se pudo crear el permiso. Pedile ayuda a quien administra esta computadora.
echo.
pause
exit /b 1
