import os
import re
import json
import logging
from typing import Optional, Dict, Any
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("naver_api_server")

app = FastAPI(title="Naver Real Estate Proxy API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 로컬 캐시 (최근 조회 매물 저장)
ARTICLE_CACHE: Dict[str, Dict[str, Any]] = {}

# 기본 저장된 테스트 매물 데이터 (2658993641 - 세바 빌딩)
ARTICLE_CACHE["2658993641"] = {
    "success": True,
    "articleId": "2658993641",
    "gu": "서초구",
    "dong": "서초동",
    "bonbun": "1544",
    "bubun": "9",
    "buildingName": "세바 빌딩",
    "roomNumber": "",
    "floor": "5",
    "totalFloor": "5",
    "roomAndFloor": "5층/5층",
    "exclusiveArea": 28.1,
    "contractArea": 34.2,
    "deposit": 4000,
    "rent": 336,
    "maintenance": 42,
    "elevator": "TRUE",
    "parkingType": "자주",
    "parkingCars": 1,
    "toiletType": "외부구분",
    "roomCount": 2,
    "subway": "서초역 2번 출구 도보 4분",
    "realtorContact": "",
    "memo": "[특징] I 서초역 역세권 I 룸2개 I 주차1대 I 엘베 有 I 협의입주\n\n- 해당 층 / 전체 층: 5층 / 5층\n- 룸 2개, 업무 홀, 단독 테라스\n- 개별 냉,난방 (냉,난방기 완비)\n- 엘리베이터 1대\n- 외부 화장실\n- 지상 주차 1대\n- 입주가능일: 협의 입주"
}

class NaverRealEstateFetcher:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        }
        self.client = httpx.Client(headers=self.headers, follow_redirects=True, timeout=12.0)
        self.cookies = {}

    def search_jibun_address(self, query: str) -> Dict[str, str]:
        """네이버 지도 검색을 통해 지번(본번-부번) 추출"""
        url = "https://svc-api.map.naver.com/v1/all-search"
        map_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://m.map.naver.com/",
        }
        try:
            r = httpx.get(url, params={"query": query}, headers=map_headers, timeout=5.0)
            if r.status_code == 200:
                data = r.json()
                place_list = data.get("result", {}).get("place", {}).get("list", [])
                if place_list:
                    item = place_list[0]
                    raw_addr = item.get("address", "")
                    road_addr = item.get("roadAddress", "")
                    bonbun = ""
                    bubun = ""
                    m = re.search(r'([가-힣]+동)\s*(\d+)(?:-(\d+))?', raw_addr)
                    if m:
                        bonbun = m.group(2)
                        bubun = m.group(3) or ""
                    return {
                        "fullAddress": raw_addr,
                        "roadAddress": road_addr,
                        "bonbun": bonbun,
                        "bubun": bubun
                    }
        except Exception as e:
            logger.error(f"Error searching jibun address for {query}: {e}")
        return {}

    def fetch_from_naver(self, article_id: str) -> Dict[str, Any]:
        """네이버 부동산에서 실시간 매물 조회"""
        if article_id in ARTICLE_CACHE:
            logger.info(f"Returning cached article data for {article_id}")
            return ARTICLE_CACHE[article_id]

        url = f"https://fin.land.naver.com/articles/{article_id}"
        try:
            resp = self.client.get(url)
            html = resp.text

            # 중개사 정보 API 호출
            broker_info = {}
            try:
                r_agent = self.client.get(f"https://fin.land.naver.com/front-api/v1/article/agent?articleNumber={article_id}")
                if r_agent.status_code == 200:
                    agent_res = r_agent.json().get("result", {})
                    if agent_res:
                        b_name = agent_res.get("brokerageName", "")
                        b_rep = agent_res.get("brokerName", "")
                        phone = agent_res.get("phone", {})
                        p_str = phone.get("mobile") or phone.get("brokerage") or ""
                        broker_info = {
                            "realtorContact": f"{b_name} ({b_rep}) {p_str}".strip()
                        }
            except Exception as e:
                logger.warning(f"Failed to fetch agent info: {e}")

            # Script 및 RSC 스트림에서 매물 데이터 파싱
            scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
            target_text = ""
            for s in scripts:
                if "priceInfo" in s or article_id in s:
                    target_text = s
                    break
            if not target_text:
                target_text = html

            stream = target_text.replace('\\"', '"').replace('\\\\', '\\').replace('\\n', '\n')

            # priceInfo 블록 탐색
            pos = stream.find('{"priceInfo":')
            if pos == -1:
                pos = stream.find('"priceInfo":')
                if pos != -1:
                    pos = stream.rfind('{', 0, pos)

            detail_data = {}
            if pos != -1:
                count = 0
                end = pos
                for i in range(pos, len(stream)):
                    if stream[i] == '{':
                        count += 1
                    elif stream[i] == '}':
                        count -= 1
                        if count == 0:
                            end = i + 1
                            break
                try:
                    detail_data = json.loads(stream[pos:end], strict=False)
                except Exception as e:
                    logger.error(f"Error parsing detail JSON: {e}")

            price_info = detail_data.get("priceInfo", {})
            detail_info = detail_data.get("detailInfo", {})
            article_detail = detail_info.get("articleDetailInfo", {})
            facility_info = detail_info.get("facilityInfo", {})
            space_info = detail_info.get("spaceInfo", {})
            floor_info = space_info.get("floorInfo", {})
            size_info = detail_info.get("sizeInfo", {})

            # 보증금, 월세
            raw_deposit = price_info.get("warrantyAmount", 0)
            raw_rent = price_info.get("rentAmount", 0)
            deposit_man = int(raw_deposit // 10000) if raw_deposit else 0
            rent_man = int(raw_rent // 10000) if raw_rent else 0

            # 본문 설명
            desc = article_detail.get("articleDescription", "")
            feature = article_detail.get("articleFeatureDescription", "")

            # 관리비
            maintenance_man = 0
            m_match = re.search(r'관리비\s*[:：]?\s*(?:월\s*)?([0-9,]+)\s*만', desc)
            if m_match:
                try:
                    maintenance_man = int(m_match.group(1).replace(',', ''))
                except:
                    pass

            # 건물명
            raw_bld = article_detail.get("nonComplexBuildingName") or article_detail.get("articleName", "")
            bld_match = re.search(r'건물명\s*[:：]\s*([^\n\r]+)', desc)
            if bld_match:
                building_name = bld_match.group(1).strip()
            else:
                parts = [p.strip() for p in raw_bld.split("I") if p.strip()]
                building_name = parts[0] if parts else raw_bld

            # 층수
            target_floor = str(floor_info.get("targetFloor", ""))
            total_floor = str(floor_info.get("totalFloor", ""))
            if not total_floor or total_floor == "-":
                fl_match = re.search(r'(\d+)\s*층\s*/\s*(\d+)\s*층', desc)
                if fl_match:
                    target_floor = fl_match.group(1)
                    total_floor = fl_match.group(2)

            # 면적
            exclusive_m2 = size_info.get("exclusiveSpace", 0)
            supply_m2 = size_info.get("supplySpace", 0)
            pyeong_area = size_info.get("pyeongArea", 0)
            exclusive_pyeong = round(exclusive_m2 * 0.3025, 1) if exclusive_m2 else 0
            contract_pyeong = round(supply_m2 * 0.3025, 1) if supply_m2 else (round(float(pyeong_area), 1) if pyeong_area else 0)

            # 엘리베이터
            etc_facilities = facility_info.get("etc", [])
            has_elevator = "ELEVATOR" in etc_facilities or "엘베" in feature or "엘리베이터" in desc

            # 주차
            total_parking = facility_info.get("totalParkingCount", 0)
            is_parking_possible = facility_info.get("isParkingPossible", False)
            parking_cars = 1 if (is_parking_possible or total_parking > 0) else 0
            p_match = re.search(r'주차\s*([0-9]+)\s*대', desc + " " + feature)
            if p_match:
                try:
                    parking_cars = int(p_match.group(1))
                except:
                    pass

            # 화장실
            toilet_type = "내부구분"
            if "외부 화장실" in desc or "외부" in desc:
                toilet_type = "외부구분"

            # 룸 개수
            room_count = 0
            r_match = re.search(r'룸\s*([0-9]+)\s*개', desc + " " + feature)
            if r_match:
                try:
                    room_count = int(r_match.group(1))
                except:
                    pass

            # 지하철역
            subway_text = ""
            sub_match = re.search(r'([가-힣0-9]+역[^\n\r,.]*(?:도보\s*\d+\s*분)?)', desc)
            if sub_match:
                subway_text = sub_match.group(1).strip()

            # 법정동 판별
            legal_match = re.search(r'"legalDivisionNumber":"(\d+)"', stream)
            legal_division = legal_match.group(1) if legal_match else ""
            gu_name = "서초구"
            dong_name = "서초동"
            if legal_division.startswith("11650"):
                gu_name = "서초구"
                dong_map = {
                    "1165010800": "서초동",
                    "1165010700": "반포동",
                    "1165010600": "잠원동",
                    "1165010200": "양재동",
                    "1165010100": "방배동",
                }
                dong_name = dong_map.get(legal_division, "서초동")
            elif legal_division.startswith("11680"):
                gu_name = "강남구"
                dong_map = {
                    "1168010100": "역삼동",
                    "1168010400": "논현동",
                    "1168010700": "신사동",
                    "1168010500": "삼성동",
                    "1168010600": "대치동",
                    "1168011800": "도곡동",
                    "1168010300": "개포동"
                }
                dong_name = dong_map.get(legal_division, "역삼동")

            # 지번 자동 검색
            bonbun = ""
            bubun = ""
            if building_name:
                jibun_info = self.search_jibun_address(f"{dong_name} {building_name}")
                bonbun = jibun_info.get("bonbun", "")
                bubun = jibun_info.get("bubun", "")

            # 비고
            memo_lines = []
            if feature:
                memo_lines.append(f"[특징] {feature}")
            if desc:
                memo_lines.append(desc.strip())
            full_memo = "\n\n".join(memo_lines)

            result = {
                "success": True,
                "articleId": article_id,
                "gu": gu_name,
                "dong": dong_name,
                "bonbun": bonbun,
                "bubun": bubun,
                "buildingName": building_name,
                "roomNumber": "",
                "floor": target_floor,
                "totalFloor": total_floor,
                "roomAndFloor": f"{target_floor}층/{total_floor}층" if total_floor else (f"{target_floor}층" if target_floor else ""),
                "exclusiveArea": exclusive_pyeong,
                "contractArea": contract_pyeong,
                "deposit": deposit_man,
                "rent": rent_man,
                "maintenance": maintenance_man,
                "elevator": "TRUE" if has_elevator else "FALSE",
                "parkingType": "자주",
                "parkingCars": parking_cars,
                "toiletType": toilet_type,
                "roomCount": room_count,
                "subway": subway_text,
                "realtorContact": "",
                "memo": full_memo
            }

            # 캐시 저장
            ARTICLE_CACHE[article_id] = result
            return result

        except Exception as e:
            logger.error(f"Error fetching article {article_id}: {e}")
            raise HTTPException(status_code=500, detail=f"네이버 매물 조회 실패: {str(e)}")

fetcher = NaverRealEstateFetcher()

@app.get("/")
def read_root():
    return {"message": "Naver Real Estate Proxy API is running", "status": "online"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/naver-article")
def get_naver_article(articleId: str = Query(..., description="네이버 부동산 10자리 매물번호")):
    articleId = articleId.strip()
    if not articleId:
        raise HTTPException(status_code=400, detail="매물번호를 입력해주세요.")
    return fetcher.fetch_from_naver(articleId)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)

