@echo off
REM Plata Tech Solutions - Sync productos desde Google Sheets
REM Programar via Task Scheduler para correr diario a las 8:00 AM
REM
REM Crear tarea programada (ejecutar UNA VEZ desde cmd como Admin):
REM   schtasks /create /tn "PlataTech Sync Productos" /tr "B:\Pts\scripts\sync_products.bat" /sc daily /st 08:00 /f
REM
REM Ver tarea:    schtasks /query /tn "PlataTech Sync Productos"
REM Borrar tarea: schtasks /delete /tn "PlataTech Sync Productos" /f

cd /d "B:\Pts"
echo [%date% %time%] Iniciando sync...  >> scripts\sync.log
python scripts\sync_products.py >> scripts\sync.log 2>&1
echo [%date% %time%] Sync completado.   >> scripts\sync.log
echo. >> scripts\sync.log
