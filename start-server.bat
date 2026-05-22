@echo off
cd /d "%~dp0"
echo Starting 日程工作台 Sync Server...
echo.
node server.js
if errorlevel 1 (
  echo.
  echo Error: Node.js not found. Install from https://nodejs.org/
  pause
)
