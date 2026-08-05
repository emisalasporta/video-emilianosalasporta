@echo off
title Subir el proyecto de video a GitHub por primera vez
cd /d "D:\profesional\proyectos\video"
echo.
echo  ============================================================
echo    SUBIR ESTO A GITHUB (SOLO LA PRIMERA VEZ)
echo.
echo    Antes de seguir tenes que haber creado el repositorio en
echo    GitHub. Se hace asi:
echo.
echo      1. Entra a  https://github.com/new
echo      2. Repository name:  video-emilianosalasporta
echo      3. Elegi Private (o Public, da igual)
echo      4. NO marques ninguna de las casillas de abajo
echo         (nada de README, .gitignore ni licencia)
echo      5. Tocá "Create repository"
echo      6. Copia la direccion que te queda, la que termina en .git
echo.
echo    Cuando lo tengas, segui aca abajo.
echo  ============================================================
echo.
pause
echo.

if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock" >nul 2>&1

if exist ".git" goto ya_estaba
echo  Preparando el historial...
git init -b main
if errorlevel 1 goto salio_mal
goto pedir_url

:ya_estaba
echo  El historial ya estaba preparado, sigo.
echo.

:pedir_url
echo.
echo  Pega la direccion del repositorio (la que termina en .git)
echo  y apreta Enter:
echo.
set "URL="
set /p "URL=  > "
if not defined URL goto sin_url

rem Le metemos la cuenta adelante de la direccion, igual que la tiene la web.
rem Hace falta porque Emiliano tiene DOS cuentas de GitHub: sin esto, git le
rem pregunta a Windows cual usar y puede agarrar la equivocada. Y con la cuenta
rem equivocada un repositorio privado no da "no tenes permiso", da "no existe",
rem que es un mensaje que manda a buscar el problema donde no esta.
set "URL=%URL:https://github.com/=https://emisalasporta@github.com/%"
set "URL=%URL:http://github.com/=https://emisalasporta@github.com/%"
set "URL=%URL:https://www.github.com/=https://emisalasporta@github.com/%"

echo.
echo  Voy a usar esta direccion:
echo    %URL%
echo.

rem Antes de tocar nada, preguntamos si el repositorio existe de verdad.
echo  Revisando que el repositorio exista...
git ls-remote "%URL%" >nul 2>&1
if errorlevel 1 goto no_existe
echo  Perfecto, ahi esta.
echo.

echo.
echo  Guardando todo...
echo.
git add -A
if errorlevel 1 goto salio_mal
git status --short
echo.

git diff --cached --quiet
if not errorlevel 1 goto nada_para_guardar
git commit -m "Miniplataforma de video: subida, conversion con ffmpeg y reproductor"
if errorlevel 1 goto salio_mal
goto conectar

:nada_para_guardar
echo  No habia nada nuevo para guardar, sigo con la subida.
echo.

:conectar
git remote remove origin >nul 2>&1
git remote add origin "%URL%"
if errorlevel 1 goto salio_mal

echo.
echo  Subiendo a GitHub...
echo.
git push -u origin main
if errorlevel 1 goto salio_mal

echo.
echo  ------------------------------------------------------------
echo    LISTO, ya esta en GitHub.
echo.
echo    Ahora segui el README para cargarlo en Dokploy. El paso
echo    que NO hay que saltear es el del volumen (paso 5).
echo  ------------------------------------------------------------
echo.
pause
exit /b 0

:sin_url
echo.
echo  No pegaste ninguna direccion, asi que no subi nada.
echo  Volve a abrir este archivo cuando la tengas.
echo.
pause
exit /b 1

:no_existe
echo.
echo  ------------------------------------------------------------
echo    GITHUB DICE QUE ESE REPOSITORIO NO EXISTE.
echo.
echo    No subi nada todavia. Suele ser una de estas dos:
echo.
echo    1) Todavia no lo creaste. Entra a https://github.com/new
echo       y crealo, despues volve a abrir este archivo.
echo.
echo    2) Lo creaste con OTRO nombre, o en TU OTRA CUENTA de
echo       GitHub. Fijate en https://github.com/emisalasporta?tab=repositories
echo       Si esta en la otra cuenta, avisame y lo arreglamos.
echo.
echo    Tu trabajo NO se perdio: sigue guardado en tu compu.
echo  ------------------------------------------------------------
echo.
pause
exit /b 1

:salio_mal
echo.
echo  ------------------------------------------------------------
echo    ALGO FALLO Y NO SE SUBIO NADA.
echo    Sacale una foto al texto de arriba y pasamelo.
echo    Tu trabajo NO se perdio: sigue guardado en tu compu.
echo  ------------------------------------------------------------
echo.
pause
exit /b 1
