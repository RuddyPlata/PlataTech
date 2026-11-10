@echo off
cd /d B:\Pts

echo ========================================
echo   Plata Tech - Sincronizando inventario
echo ========================================
echo.

set ERRORS=0

echo [1/1] Sincronizando GT Tech (YDC, ydctechnology.com/precios)...
python scripts\sync_products.py
if %ERRORLEVEL% NEQ 0 (
    echo   ERROR: sync_products.py fallo con codigo %ERRORLEVEL%
    set ERRORS=1
) else (
    echo   OK - GT Tech sincronizado
)

echo.
echo Sincronizando JM Security (seguridad)...
python scripts\sync_jm.py
if %ERRORLEVEL% NEQ 0 set ERRORS=1

if %ERRORS% EQU 0 (
    echo Haciendo push a GitHub...
    git add -A shop\assets\products.js shop\assets\costs.js shop\assets\img\ydc\ shop\assets\products-static.js shop\assets\costs-static.js shop\assets\img\jm\
    git diff --cached --quiet
    if %ERRORLEVEL% EQU 0 (
        echo   Sin cambios nuevos - catalogo ya estaba al dia.
    ) else (
        git commit -m "Auto-sync inventario [%date% %time%]"
        git push
        if %ERRORLEVEL% NEQ 0 (
            echo   ERROR: git push fallo.
            set ERRORS=1
        ) else (
            echo   OK - Push exitoso.
        )
    )
)

echo.
if %ERRORS% EQU 0 (
    echo ========================================
    echo   EXITO - Inventario actualizado
    echo ========================================
) else (
    echo ========================================
    echo   HUBO ERRORES - Revisa los mensajes
    echo ========================================
)

echo.
pause
