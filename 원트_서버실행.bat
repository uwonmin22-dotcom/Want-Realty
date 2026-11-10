@echo off
cd /d "%~dp0"
title WANT Realty Naver Proxy Server (Port 8888)
echo ==========================================================
echo [WANT Realty] Naver Real Estate Proxy Server Starting...
echo Port: 8888
echo ==========================================================
python server.py
pause
