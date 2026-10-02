@echo off
rem aqua launcher hızlı test scripti
setlocal

if not exist node_modules (
  echo bagimliliklar yukleniyor...
  call npm install
)

echo tauri dev modunda baslatiliyor...
call npx @tauri-apps/cli dev

endlocal
