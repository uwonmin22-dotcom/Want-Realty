# 📱 스마트 매물장 (Mobile Real Estate Listing App)

현장에서 스마트폰으로 손쉽게 매물장을 작성하고, **구글 스프레드시트 및 구글 드라이브(사진)에 실시간으로 동기화**되는 모바일 웹앱(PWA)입니다.

---

## 🌟 핵심 기능 및 최근 업데이트

### 1. ⚡ 구글 시트 실시간 매물번호 자동 동기화 (doGet)
- **실시간 번호 자동 반영**: 구글 시트의 서초구 / 강남구 시트 탭의 최고 매물번호를 `doGet`으로 실시간 읽어와 동별 다음 번호를 자동으로 추천합니다.
- 매물번호 옆 **`[↺]`** 버튼을 누르면 언제든지 구글 스프레드시트의 최신 번호로 즉시 동기화됩니다.
- **기본 번호 규칙**:
  - **서초구**: 서초동(`A`), 반포동(`B`), 잠원동(`C`), 양재동(`D`), 방배동(`E`)
  - **강남구**: 논현동(`A`), 역삼동(`B`), 신사동(`C`), 삼성동(`D`), 대치동(`E`), 도곡동(`F`)

### 2. 🏠 지번 본번-부번 분리 입력 (주소검색 불필요)
- 복잡한 도로명/지번 검색창 대신, 현장에서 가장 빠르고 정확한 **본번 (예: 1321) - 부번 (예: 5)** 분리 입력 방식 지원.
- 입력 즉시 하단에 `시트 반영 지번: 서초동 1321-5` 형태로 실시간 미리보기가 표시됩니다.

### 3. 🚇 서초구 / 강남구 맞춤 인근 지하철역 원터치 선택
- **서초구 선택 시**: `강남역, 교대역, 서초역, 방배역, 양재역, 양재시민의숲역, 남부터미널역, 고속터미널역, 잠원역, 반포역, 신반포역, 사평역, 내방역, 이수역`
- **강남구 선택 시**: `강남역, 신논현역, 논현역, 신사역, 압구정역, 압구정로데오역, 청담역, 강남구청역, 학동역, 언주역, 역삼역, 선릉역, 삼성역, 봉은사역, 삼성중앙역, 선정릉역, 한티역, 도곡역, 대치역, 학여울역, 대청역, 일원역, 수서역, 매봉역`
- 칩을 터치하면 선택되며, "도보 5분" 등 상세 이동시간을 자유롭게 덧붙여 입력할 수 있습니다.

### 4. 🏢 동일지번 매물추가 (한 건물 내 다중 호실 연속 등록: A108 ➔ A108-1)
- 같은 건물/지번에 여러 호실(예: 201호, 302호 등)을 연달아 등록할 때 **`[🏢 동일지번 매물추가]`** 스위치를 켭니다.
- **전송 후 자동 유지 항목**: 지번주소(본번/부번), 건물명, 지번동, 인근지하철역, 화장실, 엘리베이터, 주차, 연락처(임대인/소장님)
- **전송 후 초기화되는 항목**: **호실/층수**, **평수**, **금액(보/월/관)**, **사진/비고**
- **매물번호 규칙**: `A108` 전송 완료 시 ➔ 자동으로 **`A108-1`**이 부여되고 호실 입력창으로 포커스가 이동하여 즉시 다음 호실을 입력할 수 있습니다. (`A108-1` ➔ `A108-2` ...)

### 5. 📸 데이터를 한눈에 보는 캡처 카드 (화면 캡처 & 1클릭 이미지 복사)
- 텍스트 대신 **한 화면에 모든 매물 정보(기본정보, 금액, 면적, 시설, 비고, 담당자)가 깔끔하게 들어오는 전용 브리핑 카드**를 제공합니다.
- 하단 바 및 미리보기 창의 **`[📸 캡처보기]`** 버튼을 누르면 스마트폰 화면에 최적화된 캡처 카드가 나타납니다.
  - **`[📋 이미지 복사]`**: 별도로 화면 캡처할 필요 없이 터치 한 번으로 카드가 이미지(PNG)로 복사되어 카톡 대화방에 바로 **붙여넣기(Ctrl+V)** 할 수 있습니다.
  - **`[💾 저장]`**: 스마트폰 갤러리/다운로드 폴더에 고화질 PNG 이미지 파일로 즉시 저장됩니다.
  - **직접 화면 캡처**: 모바일 화면 비율에 맞춰 여백 없이 디자인되어 스마트폰 전원+볼륨키 화면 캡처로도 완벽합니다.

### 6. 🚗 주차 방식 4열 최적화 (줄바꿈 방지)
- `자주식`, `기계식`, `기계식(SUV)`, `혼합(자주+기계)` 4개 버튼을 한 줄에 정렬하고 `white-space: nowrap`을 적용하여 좁은 화면에서도 텍스트 줄바꿈 현상이 발생하지 않습니다.

### 7. 🔒 유저 간 데이터 격리 & 일반 전송 후 깨끗한 초기화 (Clean Slate)
- 동일지번 모드가 꺼져 있는 일반 매물 전송 완료 시에는 모든 개인정보와 폼이 깨끗이 초기화되어 다른 팀원과 데이터가 섞이지 않습니다.

---

## 📊 구글 스프레드시트 21개 열 매핑 구조

| 열 번호 | 컬럼명 | 설명 / 매핑 방식 |
|:---:|:---|:---|
| **A (1)** | 매물번호 | 동별 자동 채번 (예: `A472`, `B140` 등) |
| **B (2)** | 지번동 | 서초동, 역삼동, 논현동 등 |
| **C (3)** | 지번주소 | 본번-부번 지번 (예: `1321-5`) |
| **D (4)** | (현장주소) | 괄호 항목 (공란 유지) |
| **E (5)** | 건물명 | 건물명 입력 (예: `대성빌딩`) |
| **F (6)** | 호실/총층수 | 예: `302호 / 5층` |
| **G (7)** | 평수 | 예: `전용 35평 (계약 50평)` |
| **H (8)** | 보/월/관 | 예: `5000 / 350 / 50` |
| **I (9)** | (보증금) | 보증금 숫자 (예: `5000만`) |
| **J (10)** | (월세) | 월세 숫자 (예: `350만`) |
| **K (11)** | (관리비) | 관리비 숫자 (예: `50만`) |
| **L (12)** | (월세+관리비) | 합계 자동계산 (예: `400만`) |
| **M (13)** | 화장실 | 내부구분, 내부공용, 외부구분, 외부공용, 층별분리 |
| **N (14)** | 주차/추가여부 | 예: `무료 1대 / 추가 1대(월 15만원)` 또는 `불가` |
| **O (15)** | 엘베 | 유 / 무 |
| **P (16)** | 자주/기계/혼합 | 자주식, 기계식, 기계식(SUV), 혼합 |
| **Q (17)** | 소유주 / 임차인 / 소장님 / 담당자 | 임대인 / 임차인 / 소장님 / 담당자 통합 정리 |
| **R (18)** | 공실/협의/만기 | 공실(즉시입주), 만기전(협의), 만기퇴실 |
| **S (19)** | 비고 (특이사항) 비공개메모 | 특이사항, 도어락 비번, **현장 사진 구글 드라이브 링크** |
| **T (20)** | 내부구조 | 홀 + 룸 N개 + 서비스면적 |
| **U (21)** | 인근지하철역 | 양재역, 강남역 등 칩 및 도보시간 메모 |

---

## 🚀 구글 스프레드시트 연동 스크립트 (Apps Script)

스프레드시트 상단 메뉴 **[확장 프로그램] ➔ [Apps Script]** 에서 새 파일(예: `WebApp.gs`)을 추가하고 아래 코드를 붙여넣습니다:

```javascript
// 대상 시트 탭 자동 탐색 ("매물장(서초구)", "매물장(강남구)" 완벽 매칭)
function getTargetSheet(ss, guName) {
  var pureGu = guName.replace("구", ""); // "서초" 또는 "강남"
  var candidates = [
    "매물장(" + guName + ")",
    "매물장 (" + guName + ")",
    "매물장(" + pureGu + ")",
    "매물장 (" + pureGu + ")",
    "매물장" + guName,
    "매물장 " + guName,
    guName,
    pureGu
  ];
  for (var i = 0; i < candidates.length; i++) {
    var s = ss.getSheetByName(candidates[i]);
    if (s) return s;
  }
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var sName = sheets[j].getName();
    if (sName.indexOf(pureGu) !== -1 && sName.indexOf("브리핑") === -1) {
      return sheets[j];
    }
  }
  return null;
}

// 1. [실시간 매물번호 조회] 구글 시트 1행 최신 번호 및 시트 내 모든 지번의 최근 매물번호를 읽어옵니다.
function doGet(e) {
  try {
    var ss = SpreadsheetApp.openById("1j9rUMvePjk85SvDeqt9mHjgQZHB3ihFVLXrcwGsBBbE");
    
    var PREFIX_MAP = {
      "서초구": { "A": "서초동", "B": "반포동", "C": "잠원동", "D": "양재동", "E": "방배동" },
      "강남구": { "A": "논현동", "B": "역삼동", "C": "신사동", "D": "삼성동", "E": "대치동", "F": "도곡동" }
    };
    
    var result = {
      status: "success",
      source: "sheet_first_row",
      counters: {
        "서초구": {
          "서초동": { prefix: "A", lastNum: 0 },
          "반포동": { prefix: "B", lastNum: 0 },
          "잠원동": { prefix: "C", lastNum: 0 },
          "양재동": { prefix: "D", lastNum: 0 },
          "방배동": { prefix: "E", lastNum: 0 }
        },
        "강남구": {
          "논현동": { prefix: "A", lastNum: 0 },
          "역삼동": { prefix: "B", lastNum: 0 },
          "신사동": { prefix: "C", lastNum: 0 },
          "삼성동": { prefix: "D", lastNum: 0 },
          "대치동": { prefix: "E", lastNum: 0 },
          "도곡동": { prefix: "F", lastNum: 0 }
        }
      },
      jibunMap: {} // 지번별 최근 매물번호 디렉터리
    };
    
    ["서초구", "강남구"].forEach(function(guName) {
      var sheet = getTargetSheet(ss, guName);
      if (!sheet) return;
      
      var lastCol = Math.max(1, sheet.getLastColumn());
      var lastRow = Math.max(1, sheet.getLastRow());
      
      // 🌟 [핵심 1] 1행 최신 번호 파싱
      var checkRows = Math.min(5, lastRow);
      var topValues = sheet.getRange(1, 1, checkRows, lastCol).getDisplayValues();
      for (var r = 0; r < topValues.length; r++) {
        for (var c = 0; c < topValues[r].length; c++) {
          var val = String(topValues[r][c]).trim();
          if (!val) continue;
          var matchCode = val.match(/^([A-Za-z]+)(\d+)/);
          if (matchCode) {
            var p = matchCode[1].toUpperCase();
            var n = parseInt(matchCode[2], 10);
            var mappedDong = PREFIX_MAP[guName][p];
            if (mappedDong && result.counters[guName][mappedDong] && n > result.counters[guName][mappedDong].lastNum) {
              result.counters[guName][mappedDong].prefix = p;
              result.counters[guName][mappedDong].lastNum = n;
            }
          }
        }
      }
      
      // 🌟 [핵심 2] 시트 전체 행을 스캔하여 지번별 마지막 매물번호(A100-20, B104-2 등) 맵 생성
      if (lastRow >= 3) {
        var scanRows = Math.min(lastRow - 2, 3000);
        var bodyData = sheet.getRange(3, 4, scanRows, 3).getDisplayValues(); // D(매물번호), E(지번동), F(지번주소)
        for (var i = 0; i < bodyData.length; i++) {
          var rowCode = String(bodyData[i][0]).trim();
          var rowDong = String(bodyData[i][1]).trim();
          var rowAddr = String(bodyData[i][2]).trim().replace(/\s+/g, '');
          if (rowCode && rowDong && rowAddr) {
            var jKey = guName + "_" + rowDong + "_" + rowAddr;
            var nextCode = "";
            if (rowCode.indexOf("-") !== -1) {
              var parts = rowCode.split("-");
              var subNum = parseInt(parts[1], 10) || 1;
              nextCode = parts[0] + "-" + (subNum + 1);
            } else {
              nextCode = rowCode + "-1";
            }
            
            var existing = result.jibunMap[jKey];
            if (!existing) {
              result.jibunMap[jKey] = { lastCode: rowCode, nextCode: nextCode };
            } else {
              var exSub = existing.lastCode.indexOf("-") !== -1 ? parseInt(existing.lastCode.split("-")[1], 10) : 0;
              var curSub = rowCode.indexOf("-") !== -1 ? parseInt(rowCode.split("-")[1], 10) : 0;
              if (curSub >= exSub) {
                result.jibunMap[jKey] = { lastCode: rowCode, nextCode: nextCode };
              }
            }
          }
        }
      }
    });
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. [매물 등록] 현장주소 수식, SPLIT/SUM 수식 및 엘베 체크박스 자동 적용
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(20000);
  try {
    var ss = SpreadsheetApp.openById("1j9rUMvePjk85SvDeqt9mHjgQZHB3ihFVLXrcwGsBBbE");
    var payload = JSON.parse(e.postData.contents);
    
    var SECRET_KEY = "wt9040"; 
    if (SECRET_KEY && payload.apiKey && payload.apiKey !== SECRET_KEY) {
      return ContentService.createTextOutput(JSON.stringify({ 
        "status": "error", 
        "message": "보안 인증 실패: 비밀 암호키가 일치하지 않습니다." 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var rowData = payload.row;
    var targetGu = payload.gu || "서초구";
    
    var sheet = getTargetSheet(ss, targetGu);
    if (!sheet) {
      sheet = ss.getActiveSheet();
    }
    
    // D열(매물번호) 정렬: A, B, C열(광고, 촬영, 상황) 자동 채움
    var headers = sheet.getRange(2, 1, 1, Math.min(10, sheet.getLastColumn())).getValues()[0];
    var isColD = false;
    // 🌟 A열(광고=''), B열(담당자=웅/봄/유), C열(상황='-') 무조건 연결하여 D열부터 매물번호 배치!
    var manager = payload.manager || payload.photographer || '웅';
    var finalRow = ['', manager, '-'].concat(rowData);
    
    // 🌟 [핵심] D열(매물번호)과 E열(지번동)이 모두 비어있는 첫 행(예: 731행) 탐색
    var targetRow = -1;
    var maxRows = sheet.getMaxRows();
    var checkCount = Math.min(maxRows - 2, 3000);
    if (checkCount > 0) {
      var checkCols = sheet.getRange(3, 4, checkCount, 2).getValues();
      for (var r = 0; r < checkCols.length; r++) {
        var dVal = String(checkCols[r][0]).trim();
        var eVal = String(checkCols[r][1]).trim();
        if (!dVal && !eVal) {
          targetRow = r + 3;
          break;
        }
      }
    }
    
    if (targetRow <= 0) {
      targetRow = sheet.getLastRow() + 1;
    }
    
    // 🌟 1. 현장주소 열(G열, 인덱스 6) 카카오맵 하이퍼링크 수식 자동 삽입
    finalRow[6] = '=HYPERLINK("https://map.kakao.com/link/search/" & ENCODEURL(E' + targetRow + ' & " " & F' + targetRow + '), E' + targetRow + ' & " " & F' + targetRow + ')';
    
    // 🌟 2. L열(보증금, 인덱스 11) =SPLIT(K731,"/") 수식 삽입
    finalRow[11] = '=SPLIT(K' + targetRow + ',"/")';
    finalRow[12] = ''; // 월세 (SPLIT 자동 분할)
    finalRow[13] = ''; // 관리비 (SPLIT 자동 분할)
    
    // 🌟 3. O열(월세+관리비 합계, 인덱스 14) =SUM(M731:N731) 수식 삽입
    finalRow[14] = '=SUM(M' + targetRow + ':N' + targetRow + ')';
    
    // 🌟 4. 엘베 열(R열, 인덱스 17, 18번째 열): TRUE/FALSE 판별
    var isEl = (String(finalRow[17]).toUpperCase() === 'TRUE' || finalRow[17] === true || finalRow[17] === '유' || finalRow[17] === '있음');
    finalRow[17] = isEl;
    
    // 시트에 전체 행 데이터 삽입
    sheet.getRange(targetRow, 1, 1, finalRow.length).setValues([finalRow]);
    
    // 🌟 B열(2번째 열, 담당자: 웅/봄/유) 데이터 기록 100% 보장!
    sheet.getRange(targetRow, 2).setValue(manager);
    
    // 🌟 엘베 열(18번째 열, R열) 네이티브 체크박스 컨트롤 생성 및 체크/해제 반영
    var elCell = sheet.getRange(targetRow, 18);
    elCell.clearDataValidations();
    elCell.insertCheckboxes();
    if (isEl) {
      elCell.check();
    } else {
      elCell.uncheck();
    }
    
    // 25열에 등록일시 기록
    sheet.getRange(targetRow, 25).setValue(new Date());
    
    return ContentService.createTextOutput(JSON.stringify({ 
      "status": "success", 
      "targetSheet": sheet.getName(),
      "insertedRow": targetRow,
      "message": sheet.getName() + " 시트 " + targetRow + "행에 등록 완료"
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
```

### ⚠️ [필독] Apps Script 코드 수정 후 배포 업데이트 방법
구글 Apps Script는 코드를 수정한 후 **단순 저장(Ctrl+S)만 하면 외부 웹앱 URL에 반영되지 않습니다.**
반드시 아래 순서대로 **"새 버전"**으로 배포해야 앱에서 첫행 실시간 번호가 조회됩니다:

1. Apps Script 상단 우측 파란색 **[배포]** ➔ **[배포 관리]** 클릭
2. 왼쪽 목록에서 현재 배포 항목 선택 ➔ 상단 우측 **연필 모양(편집)** 아이콘 클릭
3. **버전(Version)** 드롭다운을 누르고 **`[새 버전(New Version)]`** 선택
4. 하단 **[배포(Deploy)]** 버튼 클릭
5. 이제 앱에서 **`[⚡ 시트 동기화]`** 버튼을 누르면 구글 시트 첫행의 최신 매물번호가 실시간으로 완벽하게 연동됩니다!
