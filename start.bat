@echo off
chcp 65001 > nul
cd /d "%~dp0"
title 漢字の勇者ケイト
set PORT=8080

where node > nul 2>&1
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  node tools\serve.mjs %PORT%
  goto :end
)

where python > nul 2>&1
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  python -m http.server %PORT%
  goto :end
)

echo Node.js か Python が見つかりませんでした。
echo README.md の「起動方法」を見てください。
pause
:end
