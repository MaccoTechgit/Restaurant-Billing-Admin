@echo off
rem DEMO: one-click role logins (no passwords). Only for testing on your own PC.
rem Starts the backend (API, port 8080) and the frontend (screens, port 3000), then open http://localhost:3000
cd /d "%~dp0"
if not exist backend\tablebill-backend.exe call build.bat
if not exist frontend\tablebill-frontend.exe call build.bat
start "TableBill backend (API)" /D "%~dp0backend" cmd /k "set DEMO=1&& set TRUST_PROXY=1&& set ADDR=127.0.0.1:8080&& tablebill-backend.exe"
timeout /t 3 >nul
start "TableBill frontend (screens)" /D "%~dp0frontend" cmd /k "set BACKEND_URL=http://127.0.0.1:8080&& set ADDR=:3000&& tablebill-frontend.exe"
timeout /t 3 >nul
start http://localhost:3000
