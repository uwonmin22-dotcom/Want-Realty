import httpx
import re
import json
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("naver_service")
logging.basicConfig(level=logging.INFO)

class NaverRealEstateService:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        }
        self.client = httpx.Client(
            headers=self.headers,
            follow_redirects=True,
            timeout=15.0
        )

    def fetch_article(self, article_id: str) -> Dict[str, Any]:
        """네이버 부동산 매물 페이지 요청 및 파싱"""
        url = f"https://fin.land.naver.com/articles/{article_id}"
        resp = self.client.get(url)
        if resp.status_code != 200:
            raise RuntimeError(f"네이버 부동산 응답 오류 (HTTP {resp.status_code})")
        
        html = resp.text
        return self.parse_html(article_id, html)

    def search_jibun_address(self, query: str) -> Dict[str, str]:
        """네이버 지도 검색을 통해 지번주소(동, 본번, 부번) 및 도로명주소 추출"""
        map_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://m.map.naver.com/",
        }
        url = "https://svc-api.map.naver.com/v1/all-search"
        try:
            r = httpx.get(url, params={"query": query}, headers=map_headers, timeout=5.0)
            if r.status_code != 200:
                return {}
            data = r.json()
            place_list = data.get("result", {}).get("place", {}).get("list", [])
            if not place_list:
                return {}
            
            item = place_list[0]
            raw_addr = item.get("address", "") # 예: "서울특별시 서초구 서초동 1544-9"
            road_addr = item.get("roadAddress", "") # 예: "서울특별시 서초구 반포대로24길 8"
            
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
            logger.error(f"Failed to search jibun address for query '{query}': {e}")
            return {}

    def parse_html(self, article_id: str, html: str) -> Dict[str, Any]:
        """HTML 및 RSC 스트림에서 매물 데이터 및 중개업소 정보 파싱"""
        # 1. script 태그 중 매물번호 또는 priceInfo가 포함된 스트림 찾기
        scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
        target_script = ""
        for s in scripts:
            if "priceInfo" in s or article_id in s:
                target_script = s
                break

        if not target_script:
            # 전체 html에서 탐색
            target_script = html

        # 이스케이프 해제
        stream_text = target_script.replace('\\"', '"').replace('\\\\', '\\').replace('\\n', '\n')

        # 2. priceInfo 및 detailInfo 블록 찾기
        detail_data = {}
        pos = stream_text.find('{"priceInfo":')
        if pos == -1:
            pos = stream_text.find('"priceInfo":')
            if pos != -1:
                pos = stream_text.rfind('{', 0, pos)
        
        if pos != -1:
            count = 0
            end = pos
            for i in range(pos, len(stream_text)):
                if stream_text[i] == '{':
                    count += 1
                elif stream_text[i] == '}':
                    count -= 1
                    if count == 0:
                        end = i + 1
                        break
            try:
                detail_data = json.loads(stream_text[pos:end], strict=False)
            except Exception as e:
                logger.error(f"Error parsing detail block JSON: {e}")

        # 3. 중개사(부동산) 정보 찾기
        broker_data = {}
        broker_pos = stream_text.find('"brokerageName":')
        if broker_pos != -1:
            b_start = stream_text.rfind('{', 0, broker_pos)
            count = 0
            b_end = b_start
            for i in range(b_start, len(stream_text)):
                if stream_text[i] == '{':
                    count += 1
                elif stream_text[i] == '}':
                    count -= 1
                    if count == 0:
                        b_end = i + 1
                        break
            try:
                broker_data = json.loads(stream_text[b_start:b_end], strict=False)
            except Exception as e:
                logger.error(f"Error parsing broker JSON: {e}")

        # 4. legalDivisionNumber (법정동코드) 찾기
        legal_division = ""
        legal_match = re.search(r'"legalDivisionNumber":"(\d+)"', stream_text)
        if legal_match:
            legal_division = legal_match.group(1)

        # 5. 각 항목 정제 및 매핑
        price_info = detail_data.get("priceInfo", {})
        detail_info = detail_data.get("detailInfo", {})
        article_detail = detail_info.get("articleDetailInfo", {})
        facility_info = detail_info.get("facilityInfo", {})
        space_info = detail_info.get("spaceInfo", {})
        floor_info = space_info.get("floorInfo", {})
        size_info = detail_info.get("sizeInfo", {})

        # 보증금, 월세 (만원 단위 변환)
        raw_deposit = price_info.get("warrantyAmount", 0)
        raw_rent = price_info.get("rentAmount", 0)
        deposit_man = int(raw_deposit // 10000) if raw_deposit else 0
        rent_man = int(raw_rent // 10000) if raw_rent else 0

        # 설명글 본문
        desc = article_detail.get("articleDescription", "")
        feature = article_detail.get("articleFeatureDescription", "")

        # 관리비 추출 (본문에서 "관리비: 월 42만원", "관리비 42만" 등 파싱)
        maintenance_man = 0
        m_match = re.search(r'관리비\s*[:：]?\s*(?:월\s*)?([0-9,]+)\s*만', desc)
        if m_match:
            try:
                maintenance_man = int(m_match.group(1).replace(',', ''))
            except:
                pass

        # 건물명 정제
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

        # 면적 (평수 계산)
        exclusive_m2 = size_info.get("exclusiveSpace", 0)
        supply_m2 = size_info.get("supplySpace", 0)
        pyeong_area = size_info.get("pyeongArea", 0)
        
        exclusive_pyeong = round(exclusive_m2 * 0.3025, 1) if exclusive_m2 else 0
        contract_pyeong = round(supply_m2 * 0.3025, 1) if supply_m2 else (round(float(pyeong_area), 1) if pyeong_area else 0)

        # 엘리베이터 (TRUE / FALSE)
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

        # 화장실 (외부구분 / 내부구분 / 내부공용 / 외부공용)
        toilet_type = "내부구분"
        if "외부 화장실" in desc or "외부" in desc:
            toilet_type = "외부구분"
        elif "내부" in desc:
            toilet_type = "내부구분"

        # 룸 개수
        room_count = 0
        r_match = re.search(r'룸\s*([0-9]+)\s*개', desc + " " + feature)
        if r_match:
            try:
                room_count = int(r_match.group(1))
            except:
                pass

        # 지하철역 및 도보시간
        subway_text = ""
        sub_match = re.search(r'([가-힣0-9]+역[^\n\r,.]*(?:도보\s*\d+\s*분)?)', desc)
        if sub_match:
            subway_text = sub_match.group(1).strip()

        # 법정동 및 구 판별
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

        # 6. 지번(본번-부번) 자동 검색 (동 + 건물명)
        bonbun = ""
        bubun = ""
        if building_name:
            query = f"{dong_name} {building_name}".strip()
            jibun_info = self.search_jibun_address(query)
            bonbun = jibun_info.get("bonbun", "")
            bubun = jibun_info.get("bubun", "")

        # 부동산(중개사) 연락처 문자열
        realtor_contact = ""
        if broker_data:
            b_name = broker_data.get("brokerageName", "")
            b_rep = broker_data.get("brokerName", "")
            b_phone = broker_data.get("phone", {})
            phone_str = ""
            if isinstance(b_phone, dict):
                phone_str = b_phone.get("mobile") or b_phone.get("brokerage") or ""
            elif isinstance(b_phone, str):
                phone_str = b_phone
            
            contact_parts = [b_name]
            if b_rep:
                contact_parts.append(f"({b_rep})")
            if phone_str:
                contact_parts.append(phone_str)
            realtor_contact = " ".join(contact_parts).strip()

        # 비고 (특징 및 본문)
        memo_lines = []
        if feature:
            memo_lines.append(f"[특징] {feature}")
        if desc:
            memo_lines.append(desc.strip())
        full_memo = "\n\n".join(memo_lines)

        return {
            "success": True,
            "articleId": article_id,
            "gu": gu_name,
            "dong": dong_name,
            "bonbun": bonbun,
            "bubun": bubun,
            "buildingName": building_name,
            "roomNumber": target_floor if not target_floor.endswith("층") else "",
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
            "realtorContact": realtor_contact,
            "memo": full_memo,
            "coordinates": article_detail.get("coordinates", {})
        }

naver_service = NaverRealEstateService()

def get_naver_article(article_id: str) -> Dict[str, Any]:
    return naver_service.fetch_article(article_id)

if __name__ == "__main__":
    res = get_naver_article("2658993641")
    print(json.dumps(res, indent=2, ensure_ascii=False))
