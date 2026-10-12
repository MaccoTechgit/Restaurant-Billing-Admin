@echo off
rem Builds the restaurant software:
rem   backend\tablebill-backend.exe    (API)
rem   frontend\tablebill-frontend.exe  (screens)
rem The marketing website lives in its own repository (website\) and is built only if that folder exists.
cd /d "%~dp0backend"  && go build -o tablebill-backend.exe .  || exit /b 1
cd /d "%~dp0frontend" && go build -o tablebill-frontend.exe . || exit /b 1
if exist "%~dp0website\main.go" (
  cd /d "%~dp0website" && go build -o macbill-site.exe . || exit /b 1
)
echo Build finished.
