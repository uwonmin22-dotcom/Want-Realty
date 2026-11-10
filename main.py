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

ALL_SUBWAY_STATIONS = [
    '강남역', '교대역', '서초역', '방배역', '양재역', '양재시민의숲역',
    '남부터미널역', '고속터미널역', '잠원역', '반포역', '신반포역', '사평역',
    '내방역', '이수역', '신논현역', '논현역', '신사역', '압구정역', '압구정로데오역',
    '청담역', '강남구청역', '학동역', '언주역', '역삼역', '선릉역',
    '삼성역', '봉은사역', '삼성중앙역', '선정릉역', '한티역', '도곡역',
    '대치역', '학여울역', '대청역', '일원역', '수서역', '매봉역', '개포동역', '구룡역'
]

DONG_CODE_MAP = {
    "1165010800": ("서초구", "서초동"),
    "1165010700": ("서초구", "반포동"),
    "1165010600": ("서초구", "잠원동"),
    "1165010200": ("서초구", "양재동"),
    "1165010100": ("서초구", "방배동"),
    "1168010100": ("강남구", "역삼동"),
    "1168010400": ("강남구", "논현동"),
    "1168010700": ("강남구", "신사동"),
    "1168010500": ("강남구", "삼성동"),
    "1168010600": ("강남구", "대치동"),
    "1168011800": ("강남구", "도곡동"),
    "1168010300": ("강남구", "개포동")
}

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
            timeout=15.0
        )

    def refresh_cookies(self):
        """쿠키 세션 갱신 시도"""
        logger.info("Attempting to refresh session cookies...")
        try:
            r = self.client.get("https://fin.land.naver.com/map", timeout=8.0)
            if r.cookies:
                for k, v in r.cookies.items():
                    if k in ["PROP_TEST_KEY", "PROP_TEST_ID", "NNB", "ASID"]:
                        logger.info(f"Updated cookie {k}={v[:10]}...")
        except Exception as e:
            logger.warning(f"Cookie refresh warning: {e}")

    def fetch_pnu_and_codes(self, article_id: str) -> Dict[str, str]:
        """네이버 내부 API에서 19자리 PNU(필지고유번호) 및 법정동코드 조회"""
        url = "https://fin.land.naver.com/front-api/v1/article/key"
        try:
            r = self.client.get(url, params={"articleNumber": article_id}, timeout=6.0)
            if r.status_code == 200:
                kdata = r.json().get("result", {})
                pnu = kdata.get("key", {}).get("pnu", "") or ""
                legal_div = kdata.get("address", {}).get("legalDivisionNumber", "") or ""
                return {"pnu": pnu, "legalDivisionNumber": legal_div}
        except Exception as e:
            logger.warning(f"PNU lookup error for {article_id}: {e}")
        return {}

    def search_building_and_jibun(self, dong: str, bonbun: str, bubun: str = "") -> Dict[str, str]:
        """지번(동, 본번-부번)으로 네이버 지도/건축물대장 공공DB 검색하여 정확한 건물명 추출"""
        if not bonbun:
            return {}
        query = f"{dong} {bonbun}" + (f"-{bubun}" if bubun else "")
        url = "https://svc-api.map.naver.com/v1/all-search"
        map_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://m.map.naver.com/",
        }
        try:
            r = httpx.get(url, params={"query": query}, headers=map_headers, timeout=5.0)
            if r.status_code == 200:
                data = r.json()
                addr_list = data.get("result", {}).get("address", {}).get("jibunsAddress", {}).get("list", [])
                if addr_list:
                    item = addr_list[0]
                    build_name = item.get("addressElements", {}).get("buildName") or item.get("buildName", "")
                    site_rep = item.get("siteRepName", "")
                    mapped_info = item.get("mappedAddress", {}) or {}
                    mapped_name = mapped_info.get("name", "")

                    resolved_building = ""
                    # 1순위: 공공 건축물대장상 공식 건물명 (buildName)
                    if build_name and build_name not in ["사무실", "중소형사무실", "일반상가", "상가", "단독주택"]:
                        resolved_building = build_name
                    # 2순위: 대표 건물명(siteRepName) 중 상호명/병원 제외한 빌딩명
                    elif site_rep and not any(x in site_rep for x in ["의원", "치과", "약국", "헤어", "스타벅스", "공인중개사", "카페"]):
                        resolved_building = site_rep
                    # 3순위: 맵핑 주소 내 건물명
                    elif mapped_name:
                        m_bld = re.search(r'\((?:[가-힣]+동\s*[\d-]+)?([^\)]+)\)', mapped_name)
                        if m_bld:
                            resolved_building = m_bld.group(1).strip()

                    return {
                        "buildingName": resolved_building,
                        "fullAddress": item.get("fullAddress", ""),
                        "roadAddress": item.get("englishAddress", "")
                    }
        except Exception as e:
            logger.warning(f"Building search error for {query}: {e}")
        return {}

    def fetch_from_naver(self, article_id: str) -> Dict[str, Any]:
        """네이버 부동산에서 실시간 매물 조회 및 건축물대장 건물명/지번 자동 연계"""
        # 1. PNU(필지고유번호) 기반 정밀 지번(본번-부번) 및 법정동 추출
        pnu_info = self.fetch_pnu_and_codes(article_id)
        pnu = pnu_info.get("pnu", "")
        legal_div = pnu_info.get("legalDivisionNumber", "")

        bonbun = ""
        bubun = ""
        gu_name = "서초구"
        dong_name = "서초동"

        if pnu and len(pnu) == 19:
            bcode = pnu[0:10]
            bonbun = str(int(pnu[11:15]))
            bubun_int = int(pnu[15:19])
            bubun = str(bubun_int) if bubun_int > 0 else ""

            if bcode in DONG_CODE_MAP:
                gu_name, dong_name = DONG_CODE_MAP[bcode]
            elif bcode.startswith("11650"):
                gu_name = "서초구"
            elif bcode.startswith("11680"):
                gu_name = "강남구"
        elif legal_div:
            if legal_div in DONG_CODE_MAP:
                gu_name, dong_name = DONG_CODE_MAP[legal_div]

        # 2. 건물명: 건축물대장 DB 및 네이버 지도 주소 체계에서 정밀 추출 ("중소형사무실" 배제)
        building_info = self.search_building_and_jibun(dong_name, bonbun, bubun)
        resolved_building = building_info.get("buildingName", "")

        # 3. 매물 상세 페이지 및 RSC 스트림 조회
        url = f"https://fin.land.naver.com/articles/{article_id}"
        html = ""
        for attempt in range(2):
            try:
                resp = self.client.get(url)
                if resp.status_code == 200 and len(resp.text) > 1000:
                    html = resp.text
                    break
                else:
                    self.refresh_cookies()
            except Exception as e:
                logger.warning(f"Fetch error attempt {attempt+1}: {e}")
                self.refresh_cookies()

        if not html:
            raise HTTPException(status_code=500, detail="네이버 매물 페이지에 연결할 수 없습니다.")

        # RSC 스트림 추출
        chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
        stream = "".join(chunks).replace('\\"', '"').replace('\\\\', '\\').replace('\\n', '\n')
        if not stream:
            stream = html

        # priceInfo 블록 파싱
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

        # 보증금/월세 fallback
        if not deposit_man and not rent_man:
            desc_m = re.search(r'content="(?:월세|전세|매매)?\s*([0-9,]+억)?\s*([0-9,]+만)?/([0-9,]+)"', html)
            if desc_m:
                b_str = desc_m.group(1) or ""
                m_str = desc_m.group(2) or ""
                r_str = desc_m.group(3) or ""
                dep_calc = 0
                if "억" in b_str:
                    dep_calc += int(re.sub(r'[^0-9]', '', b_str) or 1) * 10000
                if m_str:
                    dep_calc += int(re.sub(r'[^0-9]', '', m_str) or 0)
                deposit_man = dep_calc
                if r_str:
                    rent_man = int(re.sub(r'[^0-9]', '', r_str) or 0)

        desc = article_detail.get("articleDescription", "")
        feature = article_detail.get("articleFeatureDescription", "")

        # ★ 관리비: 누락 없이 전체 소스에서 추출
        maintenance_man = 0
        raw_fee = price_info.get("managementFeeAmount") or price_info.get("monthlyManagementCost") or price_info.get("managementCost")
        if raw_fee:
            try:
                fee_val = int(raw_fee)
                maintenance_man = (fee_val // 10000) if fee_val >= 10000 else fee_val
            except:
                pass

        if not maintenance_man:
            fee_patterns = [
                r'(?:월\s*)?관리비\s*[:：]?\s*(?:월\s*)?([0-9,]+(?:\.[0-9]+)?)\s*(?:만|원)?',
                r'공용\s*관리비\s*[:：]?\s*([0-9,]+)\s*만',
                r'월\s*관리비\s*[:：]?\s*([0-9,]+)\s*만',
                r'관\s*[:：]\s*([0-9,]+)\s*만',
                r'([0-9,]+)\s*만\s*원?\s*\/\s*관리비'
            ]
            for pat in fee_patterns:
                f_match = re.search(pat, desc + " " + feature + " " + html)
                if f_match:
                    try:
                        clean_num = f_match.group(1).replace(',', '')
                        val = int(float(clean_num))
                        if val > 0 and val < 5000:
                            maintenance_man = val
                            break
                    except:
                        pass

        # 건물명 결정: "중소형사무실", "사무실" 등 generic 명칭 원천 배제
        final_building = resolved_building
        if not final_building or final_building in ["사무실", "중소형사무실", "일반상가", "상가"]:
            raw_bld = article_detail.get("nonComplexBuildingName") or article_detail.get("articleName", "")
            if raw_bld and raw_bld not in ["사무실", "중소형사무실", "일반상가", "상가"]:
                final_building = raw_bld
            else:
                final_building = f"{dong_name} {bonbun}" + (f"-{bubun}" if bubun else "") + "번지"

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

        # ★ 지하철역: 칩버튼 단독 명칭으로 간략화 (예: '서초역')
        simplified_subway = ""
        for st in ALL_SUBWAY_STATIONS:
            if st in desc or st in feature or st in html:
                simplified_subway = st
                break

        # ★ 비고/비공개 메모는 사용자 요청에 따라 공란 유지 ("")
        memo_text = ""

        result = {
            "success": True,
            "articleId": article_id,
            "gu": gu_name,
            "dong": dong_name,
            "bonbun": bonbun,
            "bubun": bubun,
            "buildingName": final_building,
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
            "subway": simplified_subway,
            "realtorContact": "",
            "memo": memo_text
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
