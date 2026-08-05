@echo off
title Guardar y subir los cambios del proyecto de video
cd /d "D:\profesional\proyectos\video"
echo.
echo  ============================================================
echo    GUARDAR LOS CAMBIOS Y SUBIRLOS
echo.
echo    Esto manda a GitHub lo que se haya cambiado del codigo.
echo    Ojo: esto NO hace falta para los videos que subis desde
echo    el panel. Eso es aparte y no pasa por aca.
echo  ============================================================
echo.

if not exist ".git" goto sin_repo

echo  Limpiando archivos sueltos de git, por las dudas...
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock" >nul 2>&1
if exist ".git\_restos-borrar" rmdir /s /q ".git\_restos-borrar" >nul 2>&1
echo.
echo  Esto es lo que cambio:
echo.
git add -A
if errorlevel 1 goto salio_mal
git status --short
echo.

git diff --cached --quiet
if not errorlevel 1 goto nada_para_guardar

echo  Contame en una linea que cambiaste (y apreta Enter):
set "MSG="
set /p "MSG=  > "
if not defined MSG goto sin_mensaje
git commit -m "%MSG%"
if errorlevel 1 goto salio_mal
goto subir

:nada_para_guardar
echo  No hay nada nuevo para guardar.
echo  Reviso igual si quedo algo sin subir.
echo.

:subir
echo.
echo  Subiendo...
echo.
git push
if errorlevel 1 goto salio_mal
echo.
echo  ------------------------------------------------------------
echo    LISTO, ya se subio.
echo.
echo    Si tenes el autodeploy prendido en Dokploy, en un par de
echo    minutos ya esta andando la version nueva. Si no, entra a
echo    Dokploy y toca Deploy.
echo  ------------------------------------------------------------
echo.
pause
exit /b 0

:sin_repo
echo  Todavia no subiste este proyecto a GitHub ni una vez.
echo  Para eso esta el otro archivo: PRIMERA-VEZ-SUBIR-A-GITHUB.bat
echo.
pause
exit /b 1

:sin_mensaje
echo.
echo  No escribiste nada, asi que no guarde nada. Tus cambios siguen
echo  intactos: volve a abrir este archivo cuando quieras.
echo.
pause
exit /b 1

:salio_mal
echo.
echo  ------------------------------------------------------------
echo    ALGO FALLO Y NO SE SUBIO NADA.
echo    Sacale una foto o copiame el texto de arriba y lo vemos.
echo    Tu trabajo NO se perdio: sigue guardado en tu compu.
echo  ------------------------------------------------------------
echo.
pause
exit /b 1
