/**
 * 스마트 매물장 - 모바일 웹앱 코어 로직
 * - 서초구 / 강남구 동별 접두사 및 최신 카운터 관리
 * - 구글 스프레드시트 21개 열 매핑
 * - 현장 카메라 / 갤러리 이미지 자동 압축 및 구글 드라이브 업로드 지원
 * - 마지막 설정값(구, 동, 담당자, 카운터) 영구 보존
 */

document.addEventListener('DOMContentLoaded', () => {
  // PWA Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.log('SW registration skipped:', err);
      });
    });
  }

  // 기본 동별 최신 번호 데이터 (사용자 시트 1행 실시간 기준값)
  const DEFAULT_COUNTERS = {
    '서초구': {
      '서초동': { prefix: 'A', lastNum: 470 },
      '반포동': { prefix: 'B', lastNum: 104 },
      '잠원동': { prefix: 'C', lastNum: 103 },
      '양재동': { prefix: 'D', lastNum: 181 },
      '방배동': { prefix: 'E', lastNum: 107 }
    },
    '강남구': {
      '논현동': { prefix: 'A', lastNum: 116 },
      '역삼동': { prefix: 'B', lastNum: 138 },
      '신사동': { prefix: 'C', lastNum: 100 },
      '삼성동': { prefix: 'D', lastNum: 108 },
      '대치동': { prefix: 'E', lastNum: 101 },
      '도곡동': { prefix: 'F', lastNum: 104 }
    }
  };

  // 구별 인근 지하철역 목록
  const SUBWAY_STATIONS = {
    '서초구': [
      '강남역', '교대역', '서초역', '방배역', '양재역', '양재시민의숲역',
      '남부터미널역', '고속터미널역', '잠원역', '반포역', '신반포역', '사평역',
      '내방역', '이수역'
    ],
    '강남구': [
      '강남역', '신논현역', '논현역', '신사역', '압구정역', '압구정로데오역',
      '청담역', '강남구청역', '학동역', '언주역', '역삼역', '선릉역',
      '삼성역', '봉은사역', '삼성중앙역', '선정릉역', '한티역', '도곡역',
      '대치역', '학여울역', '대청역', '일원역', '수서역', '매봉역'
    ]
  };

  // Storage Keys
  const STORAGE_KEY_GAS_URL = 'smart_listing_gas_url';
  const STORAGE_KEY_DRAFT = 'smart_listing_draft_v2';
  const STORAGE_KEY_COUNTERS = 'smart_listing_counters_v2';
  const STORAGE_KEY_LAST_GU = 'smart_listing_last_gu';
  const STORAGE_KEY_LAST_DONG = 'smart_listing_last_dong';
  const STORAGE_KEY_LAST_MANAGER = 'smart_listing_last_manager';
  const STORAGE_KEY_LAST_PHOTOGRAPHER = 'smart_listing_last_photographer';
  const STORAGE_KEY_REMEMBER_COMMON = 'smart_listing_remember_common';

  // State Variables
  let currentCounters = loadCounters();
  let sheetJibunMap = loadJibunMap(); // key: "서초구_서초동_1638-2" -> { lastCode: "A100-20", nextCode: "A100-21" }
  let selectedGu = localStorage.getItem(STORAGE_KEY_LAST_GU) || '서초구';
  let selectedDong = localStorage.getItem(STORAGE_KEY_LAST_DONG) || (selectedGu === '서초구' ? '서초동' : '논현동');
  let selectedPhotographer = localStorage.getItem(STORAGE_KEY_LAST_PHOTOGRAPHER) || '장';
  let currentUploadedPhotos = []; // { id, name, dataUrl }

  // 동일지번 매물추가 모드 상태 변수
  let isSameAddressMode = false;

  // DOM Elements - Photographer (장, 웅, 봄, 유)
  const photographerInputs = document.querySelectorAll('input[name="photographer"]');

  // DOM Elements - Gu & Dong & Listing Number
  const guSegmentInputs = document.querySelectorAll('input[name="selectedGu"]');
  const dongChipsContainer = document.getElementById('dongChips');
  const dongInput = document.getElementById('dongInput');
  const listingNumberInput = document.getElementById('listingNumber');
  const listingNumberHint = document.getElementById('listingNumberHint');
  const btnNumPrev = document.getElementById('btnNumPrev');
  const btnNumNext = document.getElementById('btnNumNext');
  const btnNumReset = document.getElementById('btnNumReset');

  // 실시간 시트 동기화 바 Elements
  const btnSyncLiveSheet = document.getElementById('btnSyncLiveSheet');
  const syncSpinIcon = document.getElementById('syncSpinIcon');
  const syncBtnText = document.getElementById('syncBtnText');
  const syncStatusDesc = document.getElementById('syncStatusDesc');

  // 동일지번 매물추가 DOM Elements
  const sameAddressBox = document.getElementById('sameAddressBox');
  const toggleSameAddressMode = document.getElementById('toggleSameAddressMode');
  const sameAddressActiveBanner = document.getElementById('sameAddressActiveBanner');
  const sameJibunMatchBox = document.getElementById('sameJibunMatchBox');
  const sameJibunMatchText = document.getElementById('sameJibunMatchText');
  const btnApplySameJibunNum = document.getElementById('btnApplySameJibunNum');

  // Jibun (본번 / 부번) & Address Elements
  const bonbunInput = document.getElementById('bonbunInput');
  const bubunInput = document.getElementById('bubunInput');
  const addressInput = document.getElementById('addressInput');
  const addressPreviewVal = document.getElementById('addressPreviewVal');

  // Subway Elements
  const subwayChips = document.getElementById('subwayChips');
  const subwayGuHint = document.getElementById('subwayGuHint');
  const subwayStationInput = document.getElementById('subwayStation');

  // Capture Card Modal Elements
  const btnOpenCaptureModal = document.getElementById('btnOpenCaptureModal');
  const btnModalCapture = document.getElementById('btnModalCapture');
  const captureModal = document.getElementById('captureModal');
  const btnCloseCapture = document.getElementById('btnCloseCapture');
  const btnCaptureModalClose = document.getElementById('btnCaptureModalClose');
  const btnCopyCaptureImage = document.getElementById('btnCopyCaptureImage');
  const btnDownloadCaptureImage = document.getElementById('btnDownloadCaptureImage');

  // Area & Price
  const exclusiveArea = document.getElementById('exclusiveArea');
  const contractArea = document.getElementById('contractArea');
  const pyeongText = document.getElementById('pyeongText');
  const depositInput = document.getElementById('deposit');
  const rentInput = document.getElementById('rent');
  const maintenanceInput = document.getElementById('maintenance');
  const priceFormatted = document.getElementById('priceFormatted');
  const totalMonthlyRent = document.getElementById('totalMonthlyRent');
  const boWolGwanHidden = document.getElementById('boWolGwan');

  // Facilities & Parking
  const parkingFeeInputs = document.querySelectorAll('input[name="parkingFeeType"]');
  const parkingNotAllowed = document.getElementById('parkingNotAllowed');
  const parkingDetailsBox = document.getElementById('parkingDetailsBox');
  const parkingCustomBox = document.getElementById('parkingCustomBox');
  const parkingCustomInput = document.getElementById('parkingCustomInput');
  const parkingCarsLabel = document.getElementById('parkingCarsLabel');
  const parkingCarsCount = document.getElementById('parkingCarsCount');
  const paidParkingCost = document.getElementById('paidParkingCost');
  const parkingSummaryHidden = document.getElementById('parkingSummary');

  // Structure (홀, 룸, 테라스, 루프탑, 베란다, 파티션 칩버튼)
  const structHall = document.getElementById('structHall');
  const structRoom = document.getElementById('structRoom');
  const roomCount = document.getElementById('roomCount');
  const structTerrace = document.getElementById('structTerrace');
  const structRooftop = document.getElementById('structRooftop');
  const structVeranda = document.getElementById('structVeranda');
  const structPartition = document.getElementById('structPartition');
  const structureCustom = document.getElementById('structureCustom');
  const structureSummaryHidden = document.getElementById('structureSummary');

  // Move-in
  const moveInRadios = document.querySelectorAll('input[name="moveInType"]');
  const moveInDetailWrapper = document.getElementById('moveInDetailWrapper');
  const moveInDetailText = document.getElementById('moveInDetailText');
  const moveInSummaryHidden = document.getElementById('moveInSummary');

  // Contacts
  const contactLandlord = document.getElementById('contactLandlord');
  const contactTenant = document.getElementById('contactTenant');
  const contactDirector = document.getElementById('contactDirector');
  const contactManager = document.getElementById('contactManager');
  const contactOwner = document.getElementById('contactOwner');
  const contactsSummaryHidden = document.getElementById('contactsSummary');

  // Preview & Modals
  const listingForm = document.getElementById('listingForm');
  const btnPreview = document.getElementById('btnPreview');
  const previewModal = document.getElementById('previewModal');
  const btnClosePreview = document.getElementById('btnClosePreview');
  const btnModalCancel = document.getElementById('btnModalCancel');
  const btnModalConfirmSend = document.getElementById('btnModalConfirmSend');
  const previewTableBody = document.getElementById('previewTableBody');

  // Settings
  const btnSettings = document.getElementById('btnSettings');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const gasScriptUrlInput = document.getElementById('gasScriptUrl');
  const gasApiKeyInput = document.getElementById('gasApiKey');
  const syncBanner = document.getElementById('syncBanner');
  const syncStatusText = document.getElementById('syncStatusText');
  const btnOpenSettingsFromBanner = document.getElementById('btnOpenSettingsFromBanner');
  const gasCodeSnippet = document.getElementById('gasCodeSnippet');
  const btnCopyGasCode = document.getElementById('btnCopyGasCode');
  const seochoCountersGrid = document.getElementById('seochoCountersGrid');
  const gangnamCountersGrid = document.getElementById('gangnamCountersGrid');
  const btnResetDefaultCounters = document.getElementById('btnResetDefaultCounters');
  const prefRememberCommon = document.getElementById('prefRememberCommon');

  // Reset & Toast
  const btnNewListing = document.getElementById('btnNewListing');
  const btnResetForm = document.getElementById('btnResetForm');
  const toast = document.getElementById('toast');

  // Google Spreadsheet Column Definition (21 Columns)
  const SHEET_COLUMNS = [
    { index: 1, key: 'listingNumber', name: '매물번호', isExcluded: false },
    { index: 2, key: 'dong', name: '지번동', isExcluded: false },
    { index: 3, key: 'address', name: '지번주소', isExcluded: false },
    { index: 4, key: 'siteAddress', name: '(현장주소)', isExcluded: true, defaultVal: '' },
    { index: 5, key: 'buildingName', name: '건물명', isExcluded: false },
    { index: 6, key: 'roomAndFloor', name: '호실/총층수', isExcluded: false },
    { index: 7, key: 'pyeong', name: '평수', isExcluded: false },
    { index: 8, key: 'boWolGwan', name: '보/월/관', isExcluded: false },
    { index: 9, key: 'deposit', name: '(보증금)', isExcluded: true, calc: (d) => d.deposit ? `${d.deposit}만` : '' },
    { index: 10, key: 'rent', name: '(월세)', isExcluded: true, calc: (d) => d.rent ? `${d.rent}만` : '' },
    { index: 11, key: 'maintenance', name: '(관리비)', isExcluded: true, calc: (d) => d.maintenance ? `${d.maintenance}만` : '' },
    { index: 12, key: 'rentPlusMaint', name: '(월세+관리비)', isExcluded: true, calc: (d) => d.totalMonthly ? `${d.totalMonthly}만` : '' },
    { index: 13, key: 'toilet', name: '화장실', isExcluded: false },
    { index: 14, key: 'parkingSummary', name: '주차/추가여부', isExcluded: false },
    { index: 15, key: 'elevator', name: '엘베', isExcluded: false },
    { index: 16, key: 'parkingType', name: '자주/기계/혼합', isExcluded: false },
    { index: 17, key: 'contactsSummary', name: '소유주 / 임차인 / 소장님 / 담당자', isExcluded: false },
    { index: 18, key: 'moveInSummary', name: '공실/협의/만기', isExcluded: false },
    { index: 19, key: 'memo', name: '비고 (특이사항) 비공개메모', isExcluded: false },
    { index: 20, key: 'structureSummary', name: '내부구조', isExcluded: false },
    { index: 21, key: 'subwayStation', name: '인근지하철역', isExcluded: false }
  ];

  // Apps Script Code Template (매물장(서초구) / 매물장(강남구) 시트 탭 완벽 매칭 & D열 매물번호 자동정렬)
  const GAS_CODE_SAMPLE = `// 대상 시트 탭 자동 탐색 ("매물장(서초구)", "매물장(강남구)" 등)
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
    
    var SECRET_KEY = "team1234!"; 
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
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).indexOf("매물번호") !== -1 && h === 3) {
        isColD = true;
        break;
      }
    }
    
    var photographer = payload.photographer || '장';
    var finalRow = rowData;
    if (isColD) {
      finalRow = ['', photographer, '-'].concat(rowData);
    }
    
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
    
    // 시트에 데이터 삽입
    sheet.getRange(targetRow, 1, 1, finalRow.length).setValues([finalRow]);
    
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
}`;

  gasCodeSnippet.textContent = GAS_CODE_SAMPLE;

  // Init App
  initApp();

  async function initApp() {
    loadSettings();
    renderGuAndDongUI();
    restoreDraft();
    setupEventListeners();
    updateCalculations();
    renderCounterSettingsUI();
    
    // 시트 실시간 매물번호 비동기 동기화 시도
    await fetchLiveCountersFromSheet();
  }

  // Load Counters from LocalStorage or Default (구 기준값보다 낮아지지 않도록 자동 보정)
  function loadCounters() {
    const saved = localStorage.getItem(STORAGE_KEY_COUNTERS);
    let parsed = null;
    if (saved) {
      try {
        parsed = JSON.parse(saved);
      } catch (e) {
        console.warn('Counters parse error', e);
      }
    }
    const result = JSON.parse(JSON.stringify(DEFAULT_COUNTERS));
    if (parsed) {
      ['서초구', '강남구'].forEach(gu => {
        if (parsed[gu]) {
          Object.keys(parsed[gu]).forEach(dong => {
            if (result[gu] && result[gu][dong] && parsed[gu][dong]) {
              const savedNum = parsed[gu][dong].lastNum || 0;
              const defNum = result[gu][dong].lastNum || 0;
              result[gu][dong].lastNum = (savedNum > 0) ? Math.max(defNum, savedNum) : defNum;
              if (parsed[gu][dong].prefix) {
                result[gu][dong].prefix = parsed[gu][dong].prefix;
              }
            }
          });
        }
      });
    }
    return result;
  }

  function saveCounters(counters) {
    currentCounters = counters;
    localStorage.setItem(STORAGE_KEY_COUNTERS, JSON.stringify(counters));
  }

  // Fetch Live Counters from Google Sheets Web App (첫행 최신 번호 실시간 반영)
  async function fetchLiveCountersFromSheet(isUserClick = false) {
    const gasUrl = localStorage.getItem(STORAGE_KEY_GAS_URL);

    if (syncSpinIcon) syncSpinIcon.classList.add('spinning');
    if (syncBtnText) syncBtnText.textContent = '동기화중';

    if (!gasUrl || !gasUrl.startsWith('http')) {
      if (syncStatusDesc) {
        syncStatusDesc.textContent = '웹앱 URL 미설정 (우측 상단 ⚙️ 설정에서 입력)';
        syncStatusDesc.style.color = '#e11d48';
      }
      if (isUserClick) {
        alert('구글 웹 앱 URL이 설정되지 않았습니다.\n우측 상단 ⚙️(설정) 아이콘을 눌러 구글 Apps Script 배포 URL을 입력해주세요.');
      }
      if (syncSpinIcon) syncSpinIcon.classList.remove('spinning');
      if (syncBtnText) syncBtnText.textContent = '시트 동기화';
      return false;
    }

    if (syncStatusDesc) {
      syncStatusDesc.textContent = '구글 시트 첫행 최신 번호 조회 중...';
      syncStatusDesc.style.color = '#2563eb';
    }

    try {
      // 캐시 방지 파라미터 _t 추가
      const fetchUrl = gasUrl + (gasUrl.includes('?') ? '&' : '?') + 'action=getCounters&_t=' + Date.now();
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      if (data && data.status === 'success' && data.counters) {
        let updatedCount = 0;
        ['서초구', '강남구'].forEach(gu => {
          if (data.counters[gu]) {
            if (!currentCounters[gu]) currentCounters[gu] = {};
            Object.keys(data.counters[gu]).forEach(dong => {
              const liveItem = data.counters[gu][dong];
              if (liveItem && liveItem.lastNum > 0) {
                currentCounters[gu][dong] = {
                  prefix: liveItem.prefix || currentCounters[gu][dong]?.prefix || 'A',
                  lastNum: liveItem.lastNum
                };
                updatedCount++;
              }
            });
          }
        });

        if (data.jibunMap) {
          sheetJibunMap = data.jibunMap;
          localStorage.setItem('smart_listing_jibun_map', JSON.stringify(data.jibunMap));
          checkSameJibunHistory();
        }

        saveCounters(currentCounters);
        renderGuAndDongUI();
        renderCounterSettingsUI();

        const timeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (syncStatusDesc) {
          syncStatusDesc.textContent = `동기화 완료 (${timeStr}) - 첫행 실시간 반영됨`;
          syncStatusDesc.style.color = '#15803d';
        }
        showToast('⚡ 구글 시트 첫행 최신 매물번호 실시간 동기화 완료!');
        return true;
      } else {
        throw new Error((data && data.message) || '응답 데이터 형식 불일치');
      }
    } catch (e) {
      console.warn('Live counter sync failed:', e);
      if (syncStatusDesc) {
        syncStatusDesc.textContent = '동기화 실패 (Apps Script 새 버전 배포 확인 필요)';
        syncStatusDesc.style.color = '#dc2626';
      }
      if (isUserClick) {
        alert('구글 시트 동기화에 실패했습니다.\n\n[확인 사항]\n1. 구글 스프레드시트의 확장 프로그램 ➔ Apps Script에 최신 코드를 붙여넣으셨나요?\n2. Apps Script에서 [배포 관리] ➔ [편집(연필)] ➔ [버전: 새 버전]으로 업데이트 배포하셨나요?\n3. 액세스 권한이 "모든 사용자(Anyone)"인지 확인해주세요.');
      }
    } finally {
      if (syncSpinIcon) syncSpinIcon.classList.remove('spinning');
      if (syncBtnText) syncBtnText.textContent = '시트 동기화';
    }
    return false;
  }

  // Toast
  function showToast(message, duration = 2500) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // Load Cached Jibun Map
  function loadJibunMap() {
    const saved = localStorage.getItem('smart_listing_jibun_map');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  }

  // 동일 지번 과거 매물 탐색 및 자동 매물번호 매칭
  function checkSameJibunHistory() {
    const bonbun = bonbunInput ? bonbunInput.value.trim() : '';
    const bubun = bubunInput ? bubunInput.value.trim() : '';
    const fullAddr = bonbun ? (bubun ? `${bonbun}-${bubun}` : bonbun) : '';
    if (!fullAddr || !selectedDong) {
      if (sameJibunMatchBox) sameJibunMatchBox.style.display = 'none';
      return;
    }

    const cleanAddr = fullAddr.replace(/\s+/g, '');
    const key = `${selectedGu}_${selectedDong}_${cleanAddr}`;
    const match = sheetJibunMap[key];

    if (match && match.lastCode) {
      if (sameJibunMatchBox) {
        sameJibunMatchBox.style.display = 'flex';
        sameJibunMatchText.innerHTML = `이 지번 마지막: <strong>${match.lastCode}</strong> ➔ 동일지번 다음: <strong>${match.nextCode}</strong>`;
      }
      if (isSameAddressMode) {
        listingNumberInput.value = match.nextCode;
        listingNumberHint.textContent = `🏢 기존 지번 매칭: [${match.lastCode}]의 다음 호실 [${match.nextCode}] 자동 적용`;
      }
    } else {
      if (sameJibunMatchBox) sameJibunMatchBox.style.display = 'none';
      if (isSameAddressMode) {
        const cur = listingNumberInput.value.trim();
        if (!cur.includes('-')) {
          listingNumberInput.value = `${cur}-1`;
          listingNumberHint.textContent = `🏢 동일지번 모드: 새 건물 첫 추가호실 [${cur}-1] 부여`;
        }
      }
    }
  }

  // Update Jibun Address (본번 - 부번)
  function updateJibunAddress() {
    const bonbun = bonbunInput ? bonbunInput.value.trim() : '';
    const bubun = bubunInput ? bubunInput.value.trim() : '';
    let fullAddr = '';
    if (bonbun) {
      fullAddr = bubun ? `${bonbun}-${bubun}` : bonbun;
    }
    if (addressInput) addressInput.value = fullAddr;
    if (addressPreviewVal) {
      addressPreviewVal.textContent = fullAddr 
        ? `${selectedDong ? selectedDong + ' ' : ''}${fullAddr}` 
        : '본번을 입력해주세요';
    }
    checkSameJibunHistory();
  }

  // Render Subway Chips based on selected Gu
  function renderSubwayChips() {
    if (!subwayChips) return;
    subwayChips.innerHTML = '';
    const stations = SUBWAY_STATIONS[selectedGu] || [];
    if (subwayGuHint) {
      subwayGuHint.textContent = `${selectedGu} 주요 지하철역`;
    }

    const currentVal = subwayStationInput ? subwayStationInput.value : '';

    stations.forEach(stName => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip-mini ${currentVal.includes(stName) ? 'active' : ''}`;
      chip.dataset.subway = stName;
      chip.textContent = stName;
      subwayChips.appendChild(chip);
    });
  }

  // Render Gu and Dong UI
  function renderGuAndDongUI() {
    // Set active radio for Gu
    guSegmentInputs.forEach(input => {
      input.checked = (input.value === selectedGu);
    });

    // Populate Dong Chips
    dongChipsContainer.innerHTML = '';
    const dongMap = currentCounters[selectedGu] || {};
    const dongs = Object.keys(dongMap);

    // If current selectedDong is not in this Gu, default to first dong
    if (!dongMap[selectedDong] && dongs.length > 0) {
      selectedDong = dongs[0];
      localStorage.setItem(STORAGE_KEY_LAST_DONG, selectedDong);
    }

    dongs.forEach(dongName => {
      const item = dongMap[dongName];
      const nextNum = (item.lastNum || 0) + 1;
      const chipBtn = document.createElement('button');
      chipBtn.type = 'button';
      chipBtn.className = `chip ${dongName === selectedDong ? 'active' : ''}`;
      chipBtn.dataset.dong = dongName;
      chipBtn.innerHTML = `
        <span>${dongName}</span>
        <span class="chip-prefix-badge">${item.prefix}${nextNum}</span>
      `;
      dongChipsContainer.appendChild(chipBtn);
    });

    // Add Direct Input chip
    const directChip = document.createElement('button');
    directChip.type = 'button';
    directChip.className = 'chip';
    directChip.dataset.dong = '기타';
    directChip.innerHTML = '<span>직접입력</span>';
    dongChipsContainer.appendChild(directChip);

    dongInput.value = selectedDong;
    updateListingNumberForCurrentDong();
    renderSubwayChips();
    updateJibunAddress();
  }

  // Update Listing Number based on current selected Gu and Dong
  function updateListingNumberForCurrentDong() {
    const dongMap = currentCounters[selectedGu] || {};
    const item = dongMap[selectedDong];
    if (item) {
      const nextNum = (item.lastNum || 0) + 1;
      const code = `${item.prefix}${nextNum}`;
      listingNumberInput.value = code;
      listingNumberHint.textContent = `현재 시트 마지막: ${item.prefix}${item.lastNum} ➔ 다음 추천: ${code}`;
    } else {
      listingNumberHint.textContent = '동을 선택하면 번호가 자동 계산됩니다';
    }
  }

  // Increment or Decrement Current Number (A108, A108-1, A108-2 완벽 지원)
  function stepListingNumber(delta) {
    const currentVal = listingNumberInput.value.trim();

    // 1. 이미 - 가 붙어있는 서브번호 형태인 경우 (예: A108-1)
    if (currentVal.includes('-')) {
      const parts = currentVal.split('-');
      const base = parts[0];
      const sub = parseInt(parts[1], 10) || 1;
      const newSub = sub + delta;
      if (newSub <= 0) {
        listingNumberInput.value = base;
        showToast(`매물번호 변경: ${base}`);
      } else {
        listingNumberInput.value = `${base}-${newSub}`;
        showToast(`매물번호 변경: ${base}-${newSub}`);
      }
      return;
    }

    // 2. 동일지번 모드에서 +1을 눌렀을 때 A108 -> A108-1 로 분기
    if (isSameAddressMode && delta > 0) {
      listingNumberInput.value = `${currentVal}-1`;
      showToast(`매물번호 변경: ${currentVal}-1`);
      return;
    }

    // 3. 일반 메인 번호 증가/감소 (A471 -> A472)
    const match = currentVal.match(/^([A-Za-z]+)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const num = parseInt(match[2], 10);
      const newNum = Math.max(1, num + delta);
      listingNumberInput.value = `${prefix}${newNum}`;
      showToast(`매물번호 변경: ${prefix}${newNum}`);
    } else {
      showToast('매물번호 형식을 확인해주세요 (예: A108, A108-1)');
    }
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // 동일지번 매물추가 토글 이벤트
    if (toggleSameAddressMode) {
      toggleSameAddressMode.addEventListener('change', (e) => {
        isSameAddressMode = e.target.checked;
        if (isSameAddressMode) {
          sameAddressBox.classList.add('active');
          sameAddressActiveBanner.style.display = 'block';

          const currentNum = listingNumberInput.value.trim();
          listingNumberHint.textContent = `🏢 동일지번 모드 ON: 같은 건물 추가 호실(-1, -2) 등록`;
          showToast('🏢 동일지번 연속 등록 모드가 켜졌습니다');
        } else {
          sameAddressBox.classList.remove('active');
          sameAddressActiveBanner.style.display = 'none';
          updateListingNumberForCurrentDong();
          showToast('동일지번 모드가 꺼졌습니다 (일반 등록)');
        }
      });
    }

    // Gu Selection Change
    guSegmentInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        selectedGu = e.target.value;
        localStorage.setItem(STORAGE_KEY_LAST_GU, selectedGu);
        renderGuAndDongUI();
        showToast(`${selectedGu} 선택됨`);
      });
    });

    // Dong Chip Click
    dongChipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      document.querySelectorAll('#dongChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const dongVal = chip.dataset.dong;
      if (dongVal === '기타') {
        dongInput.value = '';
        dongInput.focus();
        listingNumberHint.textContent = '매물번호를 직접 입력해주세요';
      } else {
        selectedDong = dongVal;
        dongInput.value = selectedDong;
        localStorage.setItem(STORAGE_KEY_LAST_DONG, selectedDong);
        updateListingNumberForCurrentDong();
      }
    });

    // Listing Number Step Buttons
    btnNumPrev.addEventListener('click', () => stepListingNumber(-1));
    btnNumNext.addEventListener('click', () => stepListingNumber(1));
    btnNumReset.addEventListener('click', async () => {
      const liveSynced = await fetchLiveCountersFromSheet(true);
      if (!liveSynced) {
        updateListingNumberForCurrentDong();
        showToast('시트 기준 다음 번호로 초기화되었습니다');
      }
    });

    // 실시간 시트 번호 동기화 버튼 클릭
    if (btnSyncLiveSheet) {
      btnSyncLiveSheet.addEventListener('click', () => {
        fetchLiveCountersFromSheet(true);
      });
    }

    // Jibun (본번 / 부번) Input Listeners
    if (bonbunInput) {
      bonbunInput.addEventListener('input', updateJibunAddress);
    }
    if (bubunInput) {
      bubunInput.addEventListener('input', updateJibunAddress);
    }

    // Subway Chips Click Listener
    if (subwayChips) {
      subwayChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip-mini');
        if (!chip) return;
        chip.classList.toggle('active');

        const activeChips = Array.from(subwayChips.querySelectorAll('.chip-mini.active'))
          .map(c => c.dataset.subway);

        // 사용자가 직접 입력한 "도보 5분" 등 메모 유지
        const currentCustom = (subwayStationInput.value || '')
          .split(',')
          .map(s => s.trim())
          .filter(s => {
            const allSt = (SUBWAY_STATIONS['서초구'] || []).concat(SUBWAY_STATIONS['강남구'] || []);
            return s.length > 0 && !allSt.some(st => s === st);
          });

        const combined = [...activeChips, ...currentCustom].filter(Boolean).join(', ');
        subwayStationInput.value = combined;
      });
    }

    // Capture Modal Listeners
    if (btnOpenCaptureModal) {
      btnOpenCaptureModal.addEventListener('click', openCaptureModal);
    }
    if (btnModalCapture) {
      btnModalCapture.addEventListener('click', () => {
        if (previewModal) previewModal.style.display = 'none';
        openCaptureModal();
      });
    }
    if (btnCloseCapture) {
      btnCloseCapture.addEventListener('click', () => {
        captureModal.style.display = 'none';
      });
    }
    if (btnCaptureModalClose) {
      btnCaptureModalClose.addEventListener('click', () => {
        captureModal.style.display = 'none';
      });
    }
    if (btnCopyCaptureImage) {
      btnCopyCaptureImage.addEventListener('click', copyCaptureCardAsImage);
    }
    if (btnDownloadCaptureImage) {
      btnDownloadCaptureImage.addEventListener('click', downloadCaptureCardAsImage);
    }

    // 동일지번 적용 버튼 클릭
    if (btnApplySameJibunNum) {
      btnApplySameJibunNum.addEventListener('click', () => {
        const bonbun = bonbunInput ? bonbunInput.value.trim() : '';
        const bubun = bubunInput ? bubunInput.value.trim() : '';
        const fullAddr = bonbun ? (bubun ? `${bonbun}-${bubun}` : bonbun) : '';
        const cleanAddr = fullAddr.replace(/\s+/g, '');
        const key = `${selectedGu}_${selectedDong}_${cleanAddr}`;
        const match = sheetJibunMap[key];
        if (match && match.nextCode) {
          listingNumberInput.value = match.nextCode;
          showToast(`매물번호가 동일지번 다음 번호 [${match.nextCode}]로 설정되었습니다!`);
        }
      });
    }

    // Area inputs
    exclusiveArea.addEventListener('input', updateCalculations);
    contractArea.addEventListener('input', updateCalculations);

    // Price inputs
    depositInput.addEventListener('input', updateCalculations);
    rentInput.addEventListener('input', updateCalculations);
    maintenanceInput.addEventListener('input', updateCalculations);

    // Photographer inputs (장, 웅, 봄, 유 -> 구글시트 B열 매핑)
    const savedPhotographer = localStorage.getItem(STORAGE_KEY_LAST_PHOTOGRAPHER) || '장';
    photographerInputs.forEach(input => {
      if (input.value === savedPhotographer) {
        input.checked = true;
      }
      input.addEventListener('change', (e) => {
        selectedPhotographer = e.target.value;
        localStorage.setItem(STORAGE_KEY_LAST_PHOTOGRAPHER, selectedPhotographer);
      });
    });

    // Parking Fee Type (무료 / 유료 / 직접입력 칩버튼)
    parkingFeeInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '직접입력') {
          if (parkingCustomBox) parkingCustomBox.style.display = 'block';
          if (parkingDetailsBox) parkingDetailsBox.style.display = 'none';
          if (parkingCustomInput) {
            parkingCustomInput.focus();
          }
        } else if (val === '유료') {
          if (parkingCustomBox) parkingCustomBox.style.display = 'none';
          if (parkingDetailsBox) parkingDetailsBox.style.display = 'block';
          if (parkingCarsLabel) parkingCarsLabel.textContent = '유료 주차 대수';
          if (paidParkingCost) {
            paidParkingCost.disabled = false;
            paidParkingCost.placeholder = '예: 15';
            paidParkingCost.focus();
          }
        } else {
          if (parkingCustomBox) parkingCustomBox.style.display = 'none';
          if (parkingDetailsBox) parkingDetailsBox.style.display = 'block';
          if (parkingCarsLabel) parkingCarsLabel.textContent = '무료 주차 대수';
          if (paidParkingCost) {
            paidParkingCost.disabled = true;
            paidParkingCost.placeholder = '무료';
            paidParkingCost.value = '';
          }
        }
        updateCalculations();
      });
    });

    // Parking Not Allowed toggle
    parkingNotAllowed.addEventListener('change', (e) => {
      if (e.target.checked) {
        if (parkingDetailsBox) {
          parkingDetailsBox.style.opacity = '0.4';
          parkingDetailsBox.style.pointerEvents = 'none';
        }
        if (parkingCustomBox) {
          parkingCustomBox.style.opacity = '0.4';
          parkingCustomBox.style.pointerEvents = 'none';
        }
      } else {
        if (parkingDetailsBox) {
          parkingDetailsBox.style.opacity = '1';
          parkingDetailsBox.style.pointerEvents = 'auto';
        }
        if (parkingCustomBox) {
          parkingCustomBox.style.opacity = '1';
          parkingCustomBox.style.pointerEvents = 'auto';
        }
      }
      updateCalculations();
    });

    if (parkingCarsCount) parkingCarsCount.addEventListener('input', updateCalculations);
    if (paidParkingCost) paidParkingCost.addEventListener('input', updateCalculations);
    if (parkingCustomInput) parkingCustomInput.addEventListener('input', updateCalculations);

    // Structure inputs (홀, 룸, 테라스, 루프탑, 베란다, 파티션)
    structRoom.addEventListener('change', (e) => {
      roomCount.disabled = !e.target.checked;
      if (e.target.checked && !roomCount.value) {
        roomCount.value = '1';
      }
      updateCalculations();
    });

    structHall.addEventListener('change', updateCalculations);
    if (structTerrace) structTerrace.addEventListener('change', updateCalculations);
    if (structRooftop) structRooftop.addEventListener('change', updateCalculations);
    if (structVeranda) structVeranda.addEventListener('change', updateCalculations);
    if (structPartition) structPartition.addEventListener('change', updateCalculations);
    roomCount.addEventListener('input', updateCalculations);
    structureCustom.addEventListener('input', updateCalculations);

    // Move in inputs
    moveInRadios.forEach(r => {
      r.addEventListener('change', (e) => {
        if (e.target.value === '만기전(협의)' || e.target.value === '만기퇴실') {
          moveInDetailWrapper.style.display = 'block';
          moveInDetailText.placeholder = e.target.value === '만기퇴실'
            ? '만기퇴실 날짜 (예: 2025년 3월 15일)'
            : '협의 상세내용 (예: 2024년 12월 말 협의가능)';
          moveInDetailText.focus();
        } else {
          moveInDetailWrapper.style.display = 'none';
        }
        updateCalculations();
      });
    });
    moveInDetailText.addEventListener('input', updateCalculations);

    // Contacts (Persist Manager if checked)
    [contactLandlord, contactTenant, contactDirector, contactManager, contactOwner].forEach(el => {
      el.addEventListener('input', () => {
        updateCalculations();
        if (contactManager.value.trim()) {
          localStorage.setItem(STORAGE_KEY_LAST_MANAGER, contactManager.value.trim());
        }
      });
    });

    // Settings Modal
    btnSettings.addEventListener('click', () => {
      renderCounterSettingsUI();
      settingsModal.style.display = 'flex';
    });
    btnOpenSettingsFromBanner.addEventListener('click', () => {
      renderCounterSettingsUI();
      settingsModal.style.display = 'flex';
    });
    btnCloseSettings.addEventListener('click', () => settingsModal.style.display = 'none');
    btnSaveSettings.addEventListener('click', saveSettingsModal);
    btnCopyGasCode.addEventListener('click', copyGasCode);
    btnResetDefaultCounters.addEventListener('click', resetDefaultCounters);

    // Preview Modal
    btnPreview.addEventListener('click', showPreviewModal);
    btnClosePreview.addEventListener('click', () => previewModal.style.display = 'none');
    btnModalCancel.addEventListener('click', () => previewModal.style.display = 'none');
    btnModalConfirmSend.addEventListener('click', () => {
      previewModal.style.display = 'none';
      submitForm();
    });

    // Form Submit
    listingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      showPreviewModal();
    });

    // Form reset (Header 🔄 & Bottom 초기화)
    btnNewListing.addEventListener('click', resetFormWithConfirm);
    btnResetForm.addEventListener('click', resetFormWithConfirm);
  }

  // ==========================================================================
  // Capture Card Single View & Image Copy / Download
  // ==========================================================================
  function openCaptureModal() {
    const { dataObj } = getPreparedSheetData();
    const gu = selectedGu || '';
    const dong = dataObj.dong || '';
    const num = dataObj.listingNumber || '';
    const bldg = dataObj.buildingName ? `${dataObj.buildingName} ` : '';
    const room = dataObj.roomAndFloor ? `(${dataObj.roomAndFloor})` : '';

    const elListingNum = document.getElementById('ccListingNumber');
    const elGuDong = document.getElementById('ccGuDong');
    const elAddress = document.getElementById('ccAddress');
    const elPrice = document.getElementById('ccPrice');
    const elTotalMonthly = document.getElementById('ccTotalMonthly');
    const elPyeong = document.getElementById('ccPyeong');
    const elContractPyeong = document.getElementById('ccContractPyeong');
    const elSubway = document.getElementById('ccSubway');
    const elStructure = document.getElementById('ccStructure');
    const elToilet = document.getElementById('ccToilet');
    const elElevator = document.getElementById('ccElevator');
    const elParking = document.getElementById('ccParking');
    const elMoveIn = document.getElementById('ccMoveIn');
    const elMemo = document.getElementById('ccMemo');
    const elContacts = document.getElementById('ccContacts');
    const elDateStamp = document.getElementById('ccDateStamp');

    if (elListingNum) elListingNum.textContent = num || '매물번호';
    if (elGuDong) elGuDong.textContent = `${gu} ${dong}`.trim() || '지역 미선택';
    if (elAddress) elAddress.textContent = `${dong} ${dataObj.address} ${bldg}${room}`.trim() || '지번 및 건물명 미입력';
    if (elPrice) elPrice.textContent = dataObj.boWolGwan || '0 / 0 / 0';
    if (elTotalMonthly) elTotalMonthly.textContent = `월 총 ${dataObj.totalMonthly ? dataObj.totalMonthly.toLocaleString() : 0}만원`;
    
    if (elPyeong) elPyeong.textContent = dataObj.pyeong ? dataObj.pyeong.split(' (')[0] : '면적 협의';
    const contractMatch = dataObj.pyeong && dataObj.pyeong.match(/\(계약\s*([^)]+)\)/);
    if (elContractPyeong) {
      elContractPyeong.textContent = contractMatch ? `계약 ${contractMatch[1]}` : (contractArea.value ? `계약 ${contractArea.value}평` : '');
    }

    if (elSubway) elSubway.textContent = dataObj.subwayStation || '인근 지하철역 협의';
    if (elStructure) elStructure.textContent = dataObj.structureSummary || '일반구조';
    if (elToilet) elToilet.textContent = dataObj.toilet || '협의';
    if (elElevator) elElevator.textContent = dataObj.elevator || '유';
    if (elParking) elParking.textContent = `${dataObj.parkingSummary || '협의'} (${dataObj.parkingType || '자주식'})`;
    if (elMoveIn) elMoveIn.textContent = dataObj.moveInSummary || '공실 (즉시입주)';
    if (elMemo) elMemo.textContent = dataObj.memo || '특이사항 없음';
    if (elContacts) elContacts.textContent = dataObj.contactsSummary || '담당자 확인 요망';

    const now = new Date();
    if (elDateStamp) {
      elDateStamp.textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
    }

    if (captureModal) captureModal.style.display = 'flex';
  }

  async function copyCaptureCardAsImage() {
    const cardEl = document.getElementById('captureCardView');
    if (!cardEl) return;
    if (typeof html2canvas === 'undefined') {
      alert('화면을 직접 캡처(스크린샷)해주세요.');
      return;
    }

    showToast('이미지 변환 중... ⏳');
    try {
      const canvas = await html2canvas(cardEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          showToast('이미지 변환에 실패했습니다');
          return;
        }

        try {
          if (navigator.clipboard && navigator.clipboard.write) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            showToast('📸 캡처 이미지가 복사되었습니다! 카톡 대화창에 바로 붙여넣기(Ctrl+V)하세요.');
          } else {
            downloadCanvasBlob(blob);
          }
        } catch (err) {
          console.warn('Clipboard write error, downloading image instead:', err);
          downloadCanvasBlob(blob);
          showToast('이미지로 저장되었습니다. 갤러리/다운로드에서 카톡으로 전송하세요.');
        }
      }, 'image/png');
    } catch (err) {
      console.error(err);
      showToast('화면 캡처(스크린샷)를 이용해주세요.');
    }
  }

  async function downloadCaptureCardAsImage() {
    const cardEl = document.getElementById('captureCardView');
    if (!cardEl) return;
    if (typeof html2canvas === 'undefined') {
      alert('화면을 직접 캡처(스크린샷)해주세요.');
      return;
    }
    showToast('이미지 다운로드 준비 중... ⏳');
    try {
      const canvas = await html2canvas(cardEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      canvas.toBlob((blob) => {
        if (blob) downloadCanvasBlob(blob);
      }, 'image/png');
    } catch (err) {
      console.error(err);
    }
  }

  function downloadCanvasBlob(blob) {
    const num = listingNumberInput ? listingNumberInput.value.trim() : '매물';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${num}_매물브리핑.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('📸 이미지가 다운로드되었습니다');
  }

  // Update Combined Fields & Calculations
  function updateCalculations() {
    // 1. 평수 계산 (시트 반영 평수는 숫자만 전송!)
    const ex = parseFloat(exclusiveArea.value) || '';
    if (ex) {
      pyeongText.value = String(ex);
    } else {
      pyeongText.value = '';
    }

    // 2. 보/월/관 계산 (3000/300/30 띄어쓰기 없이 숫자만!)
    const dep = parseInt(depositInput.value) || 0;
    const rnt = parseInt(rentInput.value) || 0;
    const mnt = parseInt(maintenanceInput.value) || 0;

    const formatted = `${dep}/${rnt}/${mnt}`;
    priceFormatted.textContent = formatted;
    boWolGwanHidden.value = formatted;

    const sum = rnt + mnt;
    totalMonthlyRent.textContent = `${sum.toLocaleString()} 만원`;

    // 3. 주차 요약 (무료 / 유료 / 직접입력 / 불가)
    if (parkingNotAllowed && parkingNotAllowed.checked) {
      parkingSummaryHidden.value = '불가';
    } else {
      const feeType = document.querySelector('input[name="parkingFeeType"]:checked')?.value || '무료';
      if (feeType === '직접입력') {
        parkingSummaryHidden.value = parkingCustomInput?.value?.trim() || '협의';
      } else if (feeType === '유료') {
        const count = parseInt(parkingCarsCount?.value) || 1;
        const cost = paidParkingCost?.value?.trim();

        if (feeType === '유료') {
          if (cost) {
            parkingSummaryHidden.value = `유료 ${count}대 (월 ${cost}만)`;
          } else {
            parkingSummaryHidden.value = `유료 ${count}대`;
          }
        }
      } else {
        const count = parseInt(parkingCarsCount?.value) || 1;
        parkingSummaryHidden.value = count > 0 ? `무료 ${count}대` : '무료 협의';
      }
    }

    // 4. 구조 요약 (홀, 룸, 테라스, 루프탑, 베란다, 파티션)
    const structParts = [];
    if (structHall.checked) structParts.push('홀');
    if (structRoom.checked) {
      const cnt = roomCount.value || '1';
      structParts.push(`룸 ${cnt}개`);
    }
    if (structTerrace && structTerrace.checked) structParts.push('테라스');
    if (structRooftop && structRooftop.checked) structParts.push('루프탑');
    if (structVeranda && structVeranda.checked) structParts.push('베란다');
    if (structPartition && structPartition.checked) structParts.push('파티션');
    const customSt = structureCustom.value.trim();
    if (customSt) structParts.push(customSt);
    structureSummaryHidden.value = structParts.join(' + ');

    // 5. 입주 가능일 요약 (공실)
    const selectedMoveIn = document.querySelector('input[name="moveInType"]:checked')?.value || '공실';
    const detail = moveInDetailText.value.trim();
    if (selectedMoveIn === '공실') {
      moveInSummaryHidden.value = '공실';
    } else {
      moveInSummaryHidden.value = detail ? `${selectedMoveIn} (${detail})` : selectedMoveIn;
    }

    // 6. 연락처 요약
    const cParts = [];
    if (contactLandlord.value.trim()) cParts.push(`임대인: ${contactLandlord.value.trim()}`);
    if (contactTenant.value.trim()) cParts.push(`임차인: ${contactTenant.value.trim()}`);
    if (contactDirector.value.trim()) cParts.push(`소장님: ${contactDirector.value.trim()}`);
    if (contactManager.value.trim()) cParts.push(`담당자: ${contactManager.value.trim()}`);
    if (contactOwner.value.trim()) cParts.push(`등기소유: ${contactOwner.value.trim()}`);
    contactsSummaryHidden.value = cParts.join(' | ');
  }

  // Get Form Data mapped to Sheet
  function getPreparedSheetData() {
    updateCalculations();

    const selectedPhotographer = document.querySelector('input[name="photographer"]:checked')?.value || selectedPhotographer || '장';
    const selectedToilet = document.querySelector('input[name="toilet"]:checked')?.value || '';
    const selectedElevator = document.querySelector('input[name="elevator"]:checked')?.value || '유';
    const selectedParkingType = document.querySelector('input[name="parkingType"]:checked')?.value || '';

    const dataObj = {
      photographer: selectedPhotographer, // 🌟 B열(촬영) 매핑
      listingNumber: listingNumberInput.value.trim(),
      dong: dongInput.value.trim(),
      address: addressInput.value.trim(),
      siteAddress: '', // (현장주소) 제외/공란
      buildingName: document.getElementById('buildingName').value.trim(),
      roomAndFloor: document.getElementById('roomAndFloor').value.trim(),
      pyeong: pyeongText.value.trim(),
      boWolGwan: boWolGwanHidden.value.trim(),
      deposit: depositInput.value.trim(),
      rent: rentInput.value.trim(),
      maintenance: maintenanceInput.value.trim(),
      totalMonthly: (parseInt(rentInput.value) || 0) + (parseInt(maintenanceInput.value) || 0),
      toilet: selectedToilet,
      parkingSummary: parkingSummaryHidden.value.trim(),
      elevator: selectedElevator,
      parkingType: selectedParkingType,
      contactsSummary: contactsSummaryHidden.value.trim(),
      moveInSummary: moveInSummaryHidden.value.trim(),
      memo: document.getElementById('memo').value.trim(),
      structureSummary: structureSummaryHidden.value.trim(),
      subwayStation: subwayStationInput.value.trim()
    };

    const rowArray = SHEET_COLUMNS.map(col => {
      if (col.calc) {
        return col.calc(dataObj);
      }
      return dataObj[col.key] !== undefined ? dataObj[col.key] : (col.defaultVal || '');
    });

    return { dataObj, rowArray };
  }

  // Show Preview Modal
  function showPreviewModal() {
    const { dataObj, rowArray } = getPreparedSheetData();

    if (!dataObj.listingNumber) {
      showToast('매물번호를 입력해주세요');
      listingNumberInput.focus();
      return;
    }
    if (!dataObj.dong) {
      showToast('지번동을 선택해주세요');
      dongInput.focus();
      return;
    }
    if (!dataObj.address) {
      showToast('지번주소를 입력해주세요');
      addressInput.focus();
      return;
    }

    // Populate Table
    previewTableBody.innerHTML = '';
    SHEET_COLUMNS.forEach((col, idx) => {
      const tr = document.createElement('tr');
      const val = rowArray[idx];
      const isExcludedMark = col.isExcluded ? '<span style="color:#94a3b8; font-size:0.75rem;">(자동매핑)</span>' : '';

      tr.innerHTML = `
        <td style="color:#64748b; font-weight:600;">${col.index}</td>
        <td>${col.name} ${isExcludedMark}</td>
        <td>${val ? escapeHtml(val) : '<span class="cell-empty">공란</span>'}</td>
      `;
      previewTableBody.appendChild(tr);
    });

    // Update modal info text to explicitly show target sheet tab, photographer & mode
    const modalInfoText = document.querySelector('.modal-info-text');
    if (modalInfoText) {
      const modeNotice = isSameAddressMode
        ? `<div style="margin-top:6px; color:#15803d; font-weight:700; background:#dcfce7; padding:4px 8px; border-radius:4px;">🏢 동일지번 연속 모드 적용: 전송 후 주소/건물명/연락처는 유지되고, 다음 호실(-1) 입력으로 이어집니다.</div>`
        : '';
      modalInfoText.innerHTML = `구글 스프레드시트 <strong>[${selectedGu}]</strong> 탭 (B열 촬영자: <strong>${dataObj.photographer}</strong>)에 아래 데이터가 등록됩니다.${modeNotice}`;
    }

    previewModal.style.display = 'flex';
  }

  // Submit Form
  async function submitForm() {
    const { dataObj, rowArray } = getPreparedSheetData();
    const gasUrl = localStorage.getItem(STORAGE_KEY_GAS_URL);

    const btnSubmit = document.getElementById('btnSubmit');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>전송 중... ⏳</span>';

    try {
      if (!gasUrl || !gasUrl.startsWith('http')) {
        // Test mode simulation
        await new Promise(res => setTimeout(res, 800));
        alert('🎉 [테스트 모드: 전송 시뮬레이션 성공]\n\n' +
          '• 대상 시트 탭: [' + selectedGu + '] 시트 탭 맨 아래행\n' +
          '• 촬영자 (B열): ' + dataObj.photographer + '\n' +
          '• 매물번호: ' + dataObj.listingNumber + '\n' +
          '• 지번동/주소: ' + dataObj.dong + ' / ' + dataObj.address + '\n\n' +
          '상단 ⚙️ 설정에서 구글 웹 앱 URL을 넣으시면 실제 구글 스프레드시트의 [' + selectedGu + '] 탭에 실시간 기록됩니다!');
      } else {
        // Real Google Apps Script Webhook POST with target Gu & Secret Key
        const savedApiKey = localStorage.getItem('smart_listing_gas_api_key') || 'team1234!';
        const payload = {
          timestamp: new Date().toISOString(),
          apiKey: savedApiKey, // 비밀 암호키
          gu: selectedGu, // '서초구' 또는 '강남구' 탭으로 자동 분기
          dong: dataObj.dong,
          photographer: dataObj.photographer, // 🌟 스프레드시트 B열 자동 입력
          row: rowArray
        };

        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload)
        });

        const resData = await response.json();
        if (!resData || resData.status !== 'success') {
          throw new Error((resData && resData.message) || '구글 시트 전송에 실패했습니다.');
        }

        const rowMsg = resData.insertedRow ? `${resData.insertedRow}행에 ` : '맨 아래에 ';
        showToast(`✅ [${resData.targetSheet || selectedGu}] ${rowMsg}성공적으로 등록되었습니다!`);
      }

      if (isSameAddressMode) {
        // 동일지번 매물추가 모드: 다음 서브번호 계산 (A108 -> A108-1, A108-1 -> A108-2)
        const currentNum = dataObj.listingNumber;
        let nextNum = '';
        if (currentNum.includes('-')) {
          const parts = currentNum.split('-');
          const sub = (parseInt(parts[1], 10) || 1) + 1;
          nextNum = `${parts[0]}-${sub}`;
        } else {
          nextNum = `${currentNum}-1`;
        }

        // 평수, 층수, 금액, 사진만 초기화하고 주소/건물명/연락처/시설 유지!
        clearFormForSameAddressNextUnit(nextNum, dataObj.listingNumber);
      } else {
        // 일반 등록: 메인 카운터 증가 (+1) & 전체 폼 초기화
        advanceCounterForSubmittedListing(dataObj.dong, dataObj.listingNumber);
        clearFormCleanState();
      }

    } catch (err) {
      console.error(err);
      alert('전송 중 오류가 발생했습니다: ' + err.message + '\n스프레드시트 배포 권한이 "모든 사용자(Anyone)"로 되어 있는지 확인해주세요.');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
    }
  }

  // Advance counter by 1 after successful submit
  function advanceCounterForSubmittedListing(dongName, submittedCode) {
    if (currentCounters[selectedGu] && currentCounters[selectedGu][dongName]) {
      const match = submittedCode.match(/(\d+)$/);
      if (match) {
        const submittedNum = parseInt(match[1], 10);
        currentCounters[selectedGu][dongName].lastNum = Math.max(
          currentCounters[selectedGu][dongName].lastNum,
          submittedNum
        );
      } else {
        currentCounters[selectedGu][dongName].lastNum += 1;
      }
      saveCounters(currentCounters);
      renderGuAndDongUI();
    }
  }

  // Render Counter Settings UI
  function renderCounterSettingsUI() {
    seochoCountersGrid.innerHTML = '';
    gangnamCountersGrid.innerHTML = '';

    const seocho = currentCounters['서초구'] || {};
    Object.keys(seocho).forEach(dong => {
      const item = seocho[dong];
      const div = document.createElement('div');
      div.className = 'counter-item-input';
      div.innerHTML = `
        <span>${dong}</span>
        <input type="text" data-gu="서초구" data-dong="${dong}" value="${item.prefix}${item.lastNum}" maxlength="6">
      `;
      seochoCountersGrid.appendChild(div);
    });

    const gangnam = currentCounters['강남구'] || {};
    Object.keys(gangnam).forEach(dong => {
      const item = gangnam[dong];
      const div = document.createElement('div');
      div.className = 'counter-item-input';
      div.innerHTML = `
        <span>${dong}</span>
        <input type="text" data-gu="강남구" data-dong="${dong}" value="${item.prefix}${item.lastNum}" maxlength="6">
      `;
      gangnamCountersGrid.appendChild(div);
    });
  }

  // Save Settings Modal
  function saveSettingsModal() {
    const url = gasScriptUrlInput.value.trim();
    localStorage.setItem(STORAGE_KEY_GAS_URL, url);

    const apiKey = gasApiKeyInput ? gasApiKeyInput.value.trim() : '';
    localStorage.setItem('smart_listing_gas_api_key', apiKey);

    updateSyncStatus(url);

    // Save edited counters from modal inputs
    const inputs = document.querySelectorAll('.counter-item-input input');
    inputs.forEach(inp => {
      const gu = inp.dataset.gu;
      const dong = inp.dataset.dong;
      const val = inp.value.trim();
      const match = val.match(/^([A-Za-z]+)(\d+)$/);
      if (match && currentCounters[gu] && currentCounters[gu][dong]) {
        currentCounters[gu][dong].prefix = match[1].toUpperCase();
        currentCounters[gu][dong].lastNum = parseInt(match[2], 10);
      }
    });
    saveCounters(currentCounters);

    renderGuAndDongUI();
    settingsModal.style.display = 'none';
    showToast('설정 및 보안키가 저장되었습니다');
  }

  // Reset to default counters
  function resetDefaultCounters() {
    if (confirm('모든 동별 매물번호를 초기 제공 기준값으로 되돌리시겠습니까?')) {
      saveCounters(JSON.parse(JSON.stringify(DEFAULT_COUNTERS)));
      renderCounterSettingsUI();
      renderGuAndDongUI();
      showToast('초기 기준값으로 복원되었습니다');
    }
  }

  // Copy Gas Code
  function copyGasCode() {
    navigator.clipboard.writeText(GAS_CODE_SAMPLE).then(() => {
      showToast('Apps Script 코드가 복사되었습니다! 📋');
    }).catch(() => {
      showToast('복사에 실패했습니다. 직접 복사해주세요.');
    });
  }

  // Load Settings
  function loadSettings() {
    const savedUrl = localStorage.getItem(STORAGE_KEY_GAS_URL) || '';
    gasScriptUrlInput.value = savedUrl;
    if (gasApiKeyInput) {
      gasApiKeyInput.value = localStorage.getItem('smart_listing_gas_api_key') || '';
    }
    updateSyncStatus(savedUrl);
  }

  function updateSyncStatus(url) {
    if (url && url.startsWith('http')) {
      syncBanner.className = 'sync-banner connected';
      syncStatusText.textContent = '스프레드시트 연동 활성화 (전송 가능)';
    } else {
      syncBanner.className = 'sync-banner disconnected';
      syncStatusText.textContent = '스프레드시트 미연동 (입력 테스트 모드)';
    }
  }

  // Draft Save & Restore
  function autoSaveDraft() {
    const formData = collectRawFormData();
    localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(formData));
  }

  function saveDraftManually() {
    autoSaveDraft();
    showToast('현재 입력 내용이 임시저장되었습니다 💾');
  }

  function restoreDraft() {
    // 공유 유저간 개인 데이터 잔존 방지를 위해 기본적으로 빈 상태(Clean Slate)로 시작합니다.
  }

  function clearFormCleanState() {
    localStorage.removeItem(STORAGE_KEY_DRAFT);

    // Reset all form inputs completely (연락처, 금액, 주소, 비고 등 전액 초기화)
    listingForm.reset();

    if (bonbunInput) bonbunInput.value = '';
    if (bubunInput) bubunInput.value = '';
    updateJibunAddress();

    // Reset subway chips active state
    document.querySelectorAll('#subwayChips .chip-mini').forEach(c => c.classList.remove('active'));

    // Reset move in detail wrapper
    if (moveInDetailWrapper) moveInDetailWrapper.style.display = 'none';

    // Render fresh Gu and Dong with the next auto listing number
    renderGuAndDongUI();
    updateCalculations();
  }

  // 동일지번 추가 등록: 평수 및 금액조건 데이터 외엔 전부 유지!
  function clearFormForSameAddressNextUnit(nextNum, prevListingNumber) {
    // 1. 호실/층수 초기화
    const roomInput = document.getElementById('roomAndFloor');
    if (roomInput) roomInput.value = '';

    // 2. 평수 초기화 (전용, 계약, 시트반영)
    exclusiveArea.value = '';
    contractArea.value = '';
    pyeongText.value = '';

    // 3. 금액 초기화 (보증금, 월세, 관리비)
    depositInput.value = '';
    rentInput.value = '';
    maintenanceInput.value = '';
    boWolGwanHidden.value = '';
    priceFormatted.textContent = '0/0/0';
    totalMonthlyRent.textContent = '0 만원';

    // 4. 다음 매물번호 설정
    listingNumberInput.value = nextNum;
    listingNumberHint.textContent = `🏢 동일지번 모드 진행 중: [${nextNum}] (이전: ${prevListingNumber})`;

    // 5. 호실 입력창으로 즉시 포커스 이동
    if (roomInput) {
      setTimeout(() => roomInput.focus(), 100);
    }

    updateCalculations();
    showToast(`✅ [${prevListingNumber}] 등록 완료! 다음 호실 [${nextNum}] 입력 대기 중`);
  }

  function resetFormWithConfirm() {
    if (confirm('입력한 내용을 모두 초기화하시겠습니까?')) {
      clearFormCleanState();
      showToast('초기화되었습니다');
    }
  }

  function collectRawFormData() {
    return {
      listingNumber: listingNumberInput.value,
      dong: dongInput.value,
      address: addressInput.value,
      buildingName: document.getElementById('buildingName').value,
      roomAndFloor: document.getElementById('roomAndFloor').value,
      subwayStation: subwayStationInput.value,
      exclusiveArea: exclusiveArea.value,
      contractArea: contractArea.value,
      deposit: depositInput.value,
      rent: rentInput.value,
      maintenance: maintenanceInput.value,
      memo: document.getElementById('memo').value,
      contactLandlord: contactLandlord.value,
      contactTenant: contactTenant.value,
      contactDirector: contactDirector.value,
      contactManager: contactManager.value,
      contactOwner: contactOwner.value
    };
  }

  // Helpers
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
