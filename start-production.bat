@echo off
rem REAL restaurant. Edit the two secrets below first!
cd /d "%~dp0"
if not exist backend\tablebill-backend.exe call build.bat
if not exist frontend\tablebill-frontend.exe call build.bat
start "TableBill backend (API)" /D "%~dp0backend" cmd /k "set DEMO=0&& set TRUST_PROXY=1&& set ADDR=127.0.0.1:8080&& set ADMIN_PASSWORD=ChangeMe-Now-123&& set JWT_SECRET=put-a-long-random-text-here-at-least-32-characters&& tablebill-backend.exe"
timeout /t 3 >nul
start "TableBill frontend (screens)" /D "%~dp0frontend" cmd /k "set BACKEND_URL=http://127.0.0.1:8080&& set ADDR=:3000&& tablebill-frontend.exe"
