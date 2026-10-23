@echo off
cd /d "%~dp0"
echo.
echo  ==========================================
echo        PUBLICAR CONTROL STOCK SUCURSALES
echo  ==========================================
echo.

:: Sube la version en js/config.js y sw.js para que los celulares tomen el cambio.
:: Este archivo tiene que quedar en ASCII y con saltos CRLF.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0version.ps1"
if errorlevel 1 (
  echo  ERROR: no se pudo actualizar la version. No se publico nada.
  pause
  exit /b 1
)

git add -A
set /p msg="Descripcion del cambio (Enter para usar fecha): "
if "%msg%"=="" set msg=Actualizacion %date% %time:~0,5%
git commit -m "%msg%"
git push
echo.
echo  Publicado. Los celulares se actualizan solos en unos minutos.
pause
