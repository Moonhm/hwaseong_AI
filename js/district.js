/* ============================================================================
 * js/district.js — 행정구역(4개 구)별 보기 · 검색 (2026-08-26, 개발 Claude)
 *
 * 사용자 요청: "동네별로 그니까 행정동으로 나눠서 지도를 보게 하는 기능",
 *              "검색 기능에 그냥 넣어버리는것도 좋을거같은데"
 *
 * ── 왜 '행정동'이 아니라 '구' 인가 ───────────────────────────────────────
 * 읍면동 단위로 나누려면 데이터에 읍면동이 있어야 하는데, 실측하니 이렇다:
 *     주차장 131건 중 읍면동 인식  3건 (2%)   ← 대부분 도로명 주소다
 *     음식점 3,754건 중            1,439건 (38%)
 *     PLACES 251건 중                141건 (56%)
 * 읍면동으로 나누면 절반 이상이 '미분류'로 빠진다. 반면 구는:
 *     음식점 100% · 지역화폐 98% · (PLACES·주차장은 아래 지오코딩으로 100%)
 * 화성시가 2026년에 4개 구로 개편돼 새 주소에는 구가 들어 있다.
 *
 * ── 지도는 '분류' 가 아니라 '화면' 으로 거른다 (사용자 제안) ──────────────
 * 구를 고르면 그 구의 좌표 범위로 카메라만 옮긴다. 핀은 그대로 살아 있고,
 * 각 레이어의 뷰포트 컬링(js/localcurrency.js·restaurants.js·map.js)이
 * 화면 밖을 알아서 안 그린다. 그래서 경계 근처가 애매해도 문제가 없다 —
 * 화면에 있으면 보이고 없으면 안 보인다. 분류 정확도라는 개념 자체가 없다.
 * 폴리곤(경계선)은 그리지 않는다: data/ 의 '공간정보' CSV 10개를 전부 열어 봤으나
 * 경계 좌표를 담은 파일이 하나도 없다(BML_ADMB 는 이름과 달리 코드표다).
 *
 * ── 검색은 '라벨' 이 필요하다 ────────────────────────────────────────────
 * bbox 로만 거르면 22% 가 두 구에 동시에 걸린다(만세구가 효행구를 감싸는 모양).
 * 그래서 검색용으로는 항목마다 구 라벨을 붙인다:
 *     음식점·지역화폐  주소에서 파싱 (100% / 98%, 비용 0)
 *     PLACES·주차장    kakao coord2RegionCode (건수가 적어 8초면 끝나고 캐시된다)
 * 큰 데이터는 주소가 깨끗해 지오코딩이 불필요하고, 지오코딩이 필요한 쪽은
 * 건수가 적어 비용이 싸다 — 정확히 갈린다.
 *
 * ⚠ 축제는 지역 기능에서 통째로 제외한다 (2026-08-26 사용자 지시 "축제는 일단 빼버려").
 *   장소 미정 축제 21건이 지도 중심 좌표 한 점에 몰려 있어 어느 구로 넣어도 거짓이 된다.
 * ========================================================================== */

/* 구별 좌표 범위. 음식점 3,754건(구 라벨 100%)에서 뽑았고, 양끝 1% 는 이상치로 잘랐다
 * — 한두 건이 bbox 를 통째로 늘려 카메라가 엉뚱하게 멀어지는 것을 막는다. */
var GU_LIST = [
  { k: '동탄구', lat: [37.1592, 37.2192], lng: [127.0534, 127.1390] },
  { k: '병점구', lat: [37.2012, 37.2368], lng: [126.9839, 127.0718] },
  { k: '효행구', lat: [37.1316, 37.2652], lng: [126.8582, 127.0299] },
  { k: '만세구', lat: [37.0631, 37.2863], lng: [126.6255, 126.9848] },
];
var GU_NAMES = GU_LIST.map(function (g) { return g.k; });

/* 읍면동 → 구. 음식점 데이터에서 구와 읍면동이 함께 있는 1,439건으로 뽑았고,
 * 두 구에 걸치는 모호한 동은 0종이었다. 옛 주소 표기를 구로 옮길 때 쓴다. */
var DONG_TO_GU = {
  '경기동': '동탄구', '동탄치동': '동탄구',
  '병점동': '병점구',
  '기안동': '효행구', '매송면': '효행구', '봉담읍': '효행구', '비봉면': '효행구', '정남면': '효행구',
  '남양읍': '만세구', '마도면': '만세구', '서신면': '만세구', '송산면': '만세구',
  '양감면': '만세구', '우정읍': '만세구', '장안면': '만세구', '팔탄면': '만세구', '향남읍': '만세구',
};

var _GU_RE = /화성시\s+(?:([가-힣]+구)\b)?\s*(?:([가-힣]{2,6}(?:읍|면|동))\b)?/;

/* 주소 문자열에서 구를 뽑는다. 못 뽑으면 null. */
function guFromAddress(addr) {
  var m = _GU_RE.exec(String(addr || '').replace('경기 ', '경기도 '));
  if (!m) return null;
  if (m[1] && GU_NAMES.indexOf(m[1]) >= 0) return m[1];
  if (m[2] && DONG_TO_GU[m[2]]) return DONG_TO_GU[m[2]];
  return null;
}

/* 좌표가 어느 구 bbox 안인가. 여러 개면 면적이 작은 쪽을 고른다 —
 * 만세구가 효행구를 감싸는 모양이라 큰 쪽을 고르면 늘 만세구가 된다. */
function guFromBox(lat, lng) {
  var hit = GU_LIST.filter(function (g) {
    return lat >= g.lat[0] && lat <= g.lat[1] && lng >= g.lng[0] && lng <= g.lng[1];
  });
  if (!hit.length) return null;
  hit.sort(function (a, b) {
    return ((a.lat[1] - a.lat[0]) * (a.lng[1] - a.lng[0])) -
           ((b.lat[1] - b.lat[0]) * (b.lng[1] - b.lng[0]));
  });
  return hit[0].k;
}

/* ── 지도: 그 구로 카메라 이동 ─────────────────────────────────────────── */
var _guActive = null;

function setGuView(gu) {
  var g = GU_LIST.filter(function (x) { return x.k === gu; })[0];
  /* 같은 칩 재클릭 = 해제. 화성시 전체로 돌아간다. */
  if (!g || _guActive === gu) {
    _guActive = null;
    _guSyncChips();
    if (typeof kakaoMap !== 'undefined' && kakaoMap && typeof kakao !== 'undefined') {
      kakaoMap.setCenter(new kakao.maps.LatLng(HWASEONG.lat, HWASEONG.lng));
      kakaoMap.setLevel(9);
    }
    return;
  }
  _guActive = gu;
  _guSyncChips();
  if (typeof kakaoMap === 'undefined' || !kakaoMap || typeof kakao === 'undefined') return;
  /* setBounds 만 쓰면 레이어가 안 켜져 있을 때 빈 화면이 된다 — 카메라만 옮기고
   * 무엇을 그릴지는 사용자가 고른 카테고리 칩이 정한다. 두 축을 곱해서 쓴다. */
  var b = new kakao.maps.LatLngBounds();
  b.extend(new kakao.maps.LatLng(g.lat[0], g.lng[0]));
  b.extend(new kakao.maps.LatLng(g.lat[1], g.lng[1]));
  kakaoMap.setBounds(b, 24);
  if (typeof showToast === 'function') showToast(gu + ' 화면입니다 — 화면 안의 것만 표시돼요');
}

function _guSyncChips() {
  document.querySelectorAll('#map-chips .chip[data-gu]').forEach(function (c) {
    c.classList.toggle('active', c.dataset.gu === _guActive);
  });
}

/* 지도 탭 재클릭 리셋(js/map.js resetMapPage)이 칩을 전부 끌 때 함께 불린다.
 * 상태 변수를 안 되돌리면 칩은 꺼졌는데 _guActive 는 남아 다음 클릭이 '해제'로 먹는다. */
function resetGuView() { _guActive = null; _guSyncChips(); }


/* ══════════════════════════════════════════════════════════════════════════
   검색용 구 라벨 — PLACES(관광지·문화재) + 주차장
   coord2RegionCode 는 좌표 하나로 시·구·행정동을 정확히 돌려준다.
   주소 파싱보다 정확하고, 행정동 이름까지 얻어 나중에 더 좁힐 여지가 생긴다.
   기존 편의시설 지오코딩(js/conv_map.js)과 같은 속도(10건/200ms)와
   같은 localStorage 캐시 방식을 쓴다.

   왜 큰 데이터는 여기 없나: 음식점 3,754건은 주소에 구가 100%, 지역화폐
   27,374건은 98% 들어 있어 지오코딩이 필요 없다. 반대로 지오코딩이 필요한
   PLACES·주차장은 합쳐 382건이라 8초면 끝난다 — 비용이 정확히 갈린다.
   ══════════════════════════════════════════════════════════════════════════ */
var GU_CACHE_KEY = 'hsida_gu_v1';
var _guMap = null;      /* 't:12' | 'p:83' → { gu, dong } */
var _guResolving = false;

function _guLoadCache() {
  if (_guMap) return _guMap;
  try { _guMap = JSON.parse(localStorage.getItem(GU_CACHE_KEY) || '{}'); }
  catch (e) { _guMap = {}; }
  return _guMap;
}
function _guSaveCache() {
  try { localStorage.setItem(GU_CACHE_KEY, JSON.stringify(_guMap || {})); } catch (e) {}
}

/* 지역 라벨이 필요한 대상. 축제는 제외한다 — 파일 상단 주석 참고. */
function _guTargets() {
  var out = [];
  if (typeof PLACES !== 'undefined') {
    PLACES.forEach(function (p) {
      if (p.category === 'festival') return;          /* ⚠ 축제 제외 (사용자 지시) */
      if (!p.lat || !p.lng) return;
      out.push({ key: 't:' + p.id, lat: p.lat, lng: p.lng });
    });
  }
  if (typeof parkingData !== 'undefined') {
    parkingData.forEach(function (p) {
      if (!p.lat || !p.lng) return;
      out.push({ key: 'p:' + p.id, lat: p.lat, lng: p.lng });
    });
  }
  return out;
}

/* 아직 캐시에 없는 것만 지오코딩한다. 두 번째 실행부터는 한 건도 안 부른다. */
function resolveDistricts(cb) {
  _guLoadCache();
  if (_guResolving) { if (cb) cb(false); return; }
  /* SDK 가 아직 안 뜬 상태(autoload=false 로 지도 탭 전)면 조용히 넘긴다 —
   * guOf() 가 주소·bbox 폴백으로 답하므로 검색은 그대로 동작한다. */
  if (typeof kakao === 'undefined' || !kakao.maps || !kakao.maps.services) { if (cb) cb(false); return; }
  var todo = _guTargets().filter(function (t) { return !_guMap[t.key]; });
  if (!todo.length) { if (cb) cb(true); return; }

  _guResolving = true;
  var geocoder = new kakao.maps.services.Geocoder();
  var done = 0;
  todo.forEach(function (t, i) {
    setTimeout(function () {
      geocoder.coord2RegionCode(t.lng, t.lat, function (res, status) {
        if (status === kakao.maps.services.Status.OK && res && res.length) {
          /* region_type 'H' 가 행정동, 'B' 가 법정동이다. 행정동을 우선한다. */
          var r = res.filter(function (x) { return x.region_type === 'H'; })[0] || res[0];
          var g2 = r.region_2depth_name || '';
          var m  = /([가-힣]+구)/.exec(g2);
          _guMap[t.key] = { gu: m ? m[1] : '', dong: r.region_3depth_name || '' };
        }
        if (++done === todo.length) { _guResolving = false; _guSaveCache(); if (cb) cb(true); }
      });
    }, Math.floor(i / 10) * 200);
  });
}

/* 한 항목의 구. 지오코딩 캐시 → 주소 → bbox 순으로 떨어진다.
 * kind: 't'(PLACES) | 'p'(주차장) | null */
function guOf(item, kind) {
  if (!item) return null;
  _guLoadCache();
  if (kind && item.id != null) {
    var c = _guMap[kind + ':' + item.id];
    if (c && c.gu) return c.gu;
  }
  var a = guFromAddress(item.address || item.a || item.addr);
  if (a) return a;
  var lat = item.lat, lng = item.lng;
  if (lat == null && item.x != null) { lat = parseFloat(item.x); lng = parseFloat(item.y); }
  if (lat != null && lng != null) return guFromBox(lat, lng);
  return null;
}

/* 행정동까지 (지오코딩된 것만 있다) */
function dongOf(item, kind) {
  _guLoadCache();
  if (kind && item && item.id != null) {
    var c = _guMap[kind + ':' + item.id];
    if (c && c.dong) return c.dong;
  }
  return null;
}

/* 검색어에서 구 이름을 떼어낸다. '동탄구 카페' → { gu:'동탄구', rest:'카페' }
 * '동탄' 처럼 '구' 를 빼고 쳐도 잡는다. */
function splitGuQuery(q) {
  var s = String(q || '').trim();
  for (var i = 0; i < GU_NAMES.length; i++) {
    var full = GU_NAMES[i];
    var stem = full.slice(0, full.length - 1);
    var re = new RegExp('(^|\\s)(' + full + '|' + stem + ')(\\s|$)');
    if (re.test(s)) return { gu: full, rest: s.replace(re, ' ').replace(/\s+/g, ' ').trim() };
  }
  return { gu: null, rest: s };
}
