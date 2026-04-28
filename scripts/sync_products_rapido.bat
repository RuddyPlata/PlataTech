@echo off
REM Plata Tech Solutions - Sync RAPIDO (usa xlsx en cache, no descarga)
REM Util cuando solo cambiaste el script o quieres regenerar sin esperar la descarga.
REM Para sync completo (baja xlsx fresco de Google Sheets), usa sync_products.bat

cd /d "B:\Pts"
echo [%date% %time%] Iniciando sync rapido (cache)...  >> scripts\sync.log
python scripts\sync_products.py --no-download >> scripts\sync.log 2>&1
echo [%date% %time%] Sync rapido completado.   >> scripts\sync.log
echo. >> scripts\sync.log
echo.
echo Sync rapido completado. Revisa scripts\sync.log si necesitas detalles.
pause
