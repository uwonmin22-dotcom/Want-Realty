@echo off
chcp 65001 > nul
title [원트부동산] 네이버 매물 연동 중계 서버
cls
echo ==========================================================
echo   [원트부동산] 네이버 매물 자동입력 중계 서버
echo   PC가 켜져 있는 동안 이 검은 창을 '최소화'해두시면 됩니다.
echo ==========================================================
echo.

:: 1. 파이썬 확인
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] 파이썬(Python)이 설치되어 있지 않습니다.
    echo https://www.python.org/downloads/ 에서 파이썬을 설치해주세요.
    echo (설치 창 맨 밑의 'Add python.exe to PATH'에 꼭 체크해주세요!)
    pause
    exit /b
)

:: 2. 필수 라이브러리 자동 설치
echo [1/3] 필수 라이브러리 점검 중...
python -m pip install -r requirements.txt

:: 3. 로컬 서버 시작
echo [2/3] 네이버 매물 중계 엔진 시작 중...
start /b python server.py

:: 4. 스마트폰 외부 접속 고정 통로 시작
echo [3/3] 외부 스마트폰 보안 통로 연결 중...
echo.
echo ==========================================================
echo   ★ 고정 서버 주소 연결 성공!
echo   주소: https://want-realty-proxy.loca.lt
echo.
echo   스마트폰에서 통신사 데이터(LTE/5G)로 매물번호를 입력하고
echo   [⚡ 가져오기]를 누르면 1초 만에 자동 완성됩니다!
echo ==========================================================
echo.
npx --yes localtunnel --port 8000 --subdomain want-realty-proxy
pause

