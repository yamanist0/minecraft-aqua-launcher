@echo off
REM Build script for Aqua Launcher installer
setlocal

REM Install dependencies if needed
if not exist package-lock.json (
  echo Installing npm dependencies...
  npm install
)

if not exist node_modules (
  echo Installing dependencies...
  npm install
)

echo Ensuring electron-builder is available...
if not exist node_modules\.bin\electron-builder (
  npm install --save-dev electron-builder
)

echo Building Aqua Launcher installer...
npx electron-builder --win nsis --x64

echo Build complete. The installer output is in the dist folder.
endlocal
