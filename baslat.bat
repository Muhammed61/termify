@echo off
rem Termify'i başlatır (çift tıklayın)
cd /d "%~dp0"
if not exist node_modules (
  echo Bagimliliklar yukleniyor, lutfen bekleyin...
  call npm install
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
