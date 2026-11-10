@echo off
chcp 65001 > nul
echo ========================================================
echo  ⚡ 네이버부동산 매물 우회 자동입력 API 서버 실행
echo  주소: http://localhost:8000
echo  종료하려면 창을 닫거나 Ctrl+C를 누르세요.
echo ========================================================
echo.
python server.py
pause

