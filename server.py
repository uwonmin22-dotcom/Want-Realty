import os
import re
import json
import logging
from typing import Optional, Dict, Any
from fastapi import FastAPI, Query, HTTPException, Request
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

ARTICLE_CACHE: Dict[str, Dict[str, Any]] = {}

# 기본 인증 쿠키 (사용자 제공 규격)
DEFAULT_COOKIE_STR = (
    'NNB=HDK5BZSWX6QGO; ASID=7d81d94000000194cbebe4110000004d; '
    '_fwb=228pvCOYN9iHoulQovnjjbV.1738896297848; _ga=GA1.1.1701245310.1740726299; '
    'NAC=oHMGBsQfGVXzA; map_snb_collapsed=false; never_show_center_popup=true; '
    'article_module_info={"BUILDING_INFO":true}; '
    'PROP_TEST_KEY=1794225750336.f9f70c6db360ff7682d2c5b956892d9bd77e198601e0465ef1813db5672982f5; '
    'PROP_TEST_ID=1cdb6fdfbab2c62f9adf16d2be41f3bdb27725d6987344bf023c481e55f9a0ab; '
    'SRT30=1794240806; SRT5=1794240806;'
)

DEFAULT_ATTEST = "YGYpPCLsTyvgMT99PZpsUEukxFIakb4LLVnN-iWwfTJsoB--AnfHyGrbbTksFodM73zXQ8CNeweXtpyKjun3XgVKqXrmIAoToYOKU6-hdGH6sgstAVbaCw"

class NaverRealEstateFetcher:
    def __init__(self):
        self.cookie_str = DEFAULT_COOKIE_STR
        self.x_attest = DEFAULT_ATTEST
        self.headers = {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "cookie": self.cookie_str,
            "origin": "https://fin.land.naver.com",
            "referer": "https://fin.land.naver.com/map",
            "sec-ch-ua": '"Not-A.Brand";v="99", "Google Chrome";v="157", "Chromium";v="157"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
            "x-attest": self.x_attest
        }
        self.client = httpx.Client(
            headers=self.headers,
            follow_redirects=True,
            timeout=20.0
        )

    def refresh_cookies(self):
        """쿠키 세션 갱신 시도"""
        logger.info("Attempting to refresh session cookies...")
        try:
            r = self.client.get("https://fin.land.naver.com/map", timeout=10.0)
            if r.cookies:
                for k, v in r.cookies.items():
                    if k in ["PROP_TEST_KEY", "PROP_TEST_ID", "NNB", "ASID"]:
                        logger.info(f"Updated cookie {k}={v[:10]}...")
        except Exception as e:
            logger.warning(f"Cookie refresh warning: {e}")

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
        html = ""
        
        # 2회 재시도 (실패 시 쿠키 갱신)
        for attempt in range(2):
            try:
                resp = self.client.get(url)
                if resp.status_code == 200 and len(resp.text) > 1000:
                    html = resp.text
                    break
                else:
                    logger.warning(f"Status {resp.status_code} on attempt {attempt+1}, refreshing...")
                    self.refresh_cookies()
            except Exception as e:
                logger.warning(f"Fetch error on attempt {attempt+1}: {e}")
                self.refresh_cookies()

        if not html:
            raise HTTPException(status_code=500, detail="네이버 매물 페이지에 연결할 수 없습니다 (차단 또는 타임아웃).")

        # RSC 스트림 추출 (self.__next_f.push)
        chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
        stream = "".join(chunks).replace('\\"', '"').replace('\\\\', '\\').replace('\\n', '\n')
        if not stream:
            stream = html

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

        # 만약 priceInfo가 비어있다면 meta description에서 파싱 (예: "월세 1억/700")
        if not deposit_man and not rent_man:
            desc_m = re.search(r'content="(?:월세|전세|매매)?\s*([0-9,]+억)?\s*([0-9,]+만)?/([0-9,]+)"', html)
            if not desc_m:
                desc_m = re.search(r'content="월세\s*([0-9,]+억)?\s*([0-9,]+)?/([0-9,]+)"', html)
            if desc_m:
                billion_str = desc_m.group(1) or ""
                million_str = desc_m.group(2) or ""
                rent_str = desc_m.group(3) or ""
                dep_calc = 0
                if "억" in billion_str:
                    b_num = int(re.sub(r'[^0-9]', '', billion_str) or 1)
                    dep_calc += b_num * 10000
                if million_str:
                    m_num = int(re.sub(r'[^0-9]', '', million_str) or 0)
                    dep_calc += m_num
                deposit_man = dep_calc
                if rent_str:
                    rent_man = int(re.sub(r'[^0-9]', '', rent_str) or 0)

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
        elif raw_bld:
            parts = [p.strip() for p in raw_bld.split("I") if p.strip()]
            building_name = parts[0] if parts else raw_bld
        else:
            og_t = re.search(r'property="og:title" content="(.*?)"', html)
            building_name = og_t.group(1).strip() if og_t else "사무실"

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
        else:
            for d in ["서초동", "반포동", "잠원동", "양재동", "방배동"]:
                if d in html:
                    gu_name = "서초구"
                    dong_name = d
                    break
            for d in ["논현동", "역삼동", "신사동", "삼성동", "대치동", "도곡동", "개포동"]:
                if d in html:
                    gu_name = "강남구"
                    dong_name = d
                    break

        # 지번 자동 검색
        bonbun = ""
        bubun = ""
        if building_name and building_name not in ["사무실", "중소형사무실"]:
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
            "roomAndFloor": f"{target_floor}층/{total_floor}층" if (target_floor and total_floor and total_floor != "-") else (f"{target_floor}층" if target_floor else ""),
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

        ARTICLE_CACHE[article_id] = result
        return result

fetcher = NaverRealEstateFetcher()

@app.get("/")
@app.get("/api")
@app.get("/api/index")
@app.get("/api/index.py")
@app.get("/api/naver-article")
@app.get("/naver-article")
@app.get("/{full_path:path}")
def handle_all_requests(request: Request, full_path: str = "", articleId: Optional[str] = None):
    target_id = articleId or request.query_params.get("articleId")
    if target_id:
        return fetcher.fetch_from_naver(target_id.strip())
    if "health" in full_path or request.url.path.endswith("health"):
        return {"status": "ok"}
    return {"message": "Naver Real Estate Proxy API is running", "path": full_path, "status": "online"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
