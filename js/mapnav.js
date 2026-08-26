/* ============================================================================
 * js/mapnav.js — 지도 진입점 — 다른 탭에서 지도로 이동
 *
 * 왜 따로 있나: goMapCat/goMapFocus/goConvItem 은 '어느 탭에서 왔든 지도를 특정 상태로 만든다'는 한 가지 일을 한다. 호출부가 홈·관광·생활에 흩어져 있어 기능 파일에 두면 중복된다.
 * 함께 볼 것:   js/map.js 의 setFilter()·kakaoMap 전역에 의존한다. 칩 토글 규약이 바뀌면 _ensureFilter() 를 함께 고쳐야 한다.
 *
 * index.html 인라인 <script> 2105~2275줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

function menuGoTourism(sub) {
  closeMenu();
  go('tourism');
  /* 지연 없이 동기로. go() 가 이미 _tourismSub 기준(기본 '인기')으로 목록을 다 그려
   * 놓기 때문에, 늦추면 그 '엉뚱한 서브탭' 화면이 그동안 보인다 — 메뉴에서 숙박을
   * 눌렀는데 인기 목록이 먼저 뜨고 나중에 바뀌었다.
   * switchTourismSub 은 클래스 토글과 display 교체뿐이고 CONVENIENCE 도 동기 로드라
   * 지금 불러도 안전하다(js/boot.js 의 goLivingCat 이 같은 모양이다). */
  var chip = document.querySelector('.tourism-subnav .chip[data-sub="' + sub + '"]');
  if (chip && typeof switchTourismSub === 'function') switchTourismSub(chip, sub);
}
function menuGoLiving(cat) {
  closeMenu();
  go('living');
  /* menuGoTourism 과 같은 이유로 동기다. go() 안의 renderLivingPage() 가 이미
   * '모범음식점'으로 그려 놓으므로, 늦추면 다른 카테고리가 그동안 보이거나
   * (같은 카테고리라도) 목록을 두 번 그려 .place-item 등장 애니메이션이 두 번 재생된다. */
  var el = document.getElementById('liv-cat-' + cat);
  if (el && typeof switchLivingCat === 'function') switchLivingCat(el, cat);
}

/* setFilter 는 같은 칩 재클릭 시 해제하는 토글이다.
 * 이미 켜져 있는 칩에 다시 호출하면 필터가 꺼져 빈 지도가 되므로 상태를 먼저 확인한다. */
function _ensureFilter(cat) {
  var chip = document.querySelector('#map-chips .chip[data-cat="' + cat + '"]');
  if (!chip || !chip.classList.contains('active')) setFilter(cat);
}

function goMapCat(cat) {
  go('map');
  setTimeout(function () {
    if (cat === 'parking') { if (typeof activateParking === 'function') activateParking(); }
    else _ensureFilter(cat);
  }, 200);
}

/* ── 생활탭 항목 클릭 → 지도에서 해당 위치 줌인 + 슬라이드 카드 표시 ── */
function goConvItem(convCat, idx) {
  /* CONVENIENCE 원본 데이터 참조 */
  var srcMap = { mobeom: 'restaurants', touristrest: 'touristRestaurants' };
  var arr = CONVENIENCE[srcMap[convCat]];
  if (!arr || !arr[idx]) return;
  var rawItem = arr[idx];

  go('map');

  setTimeout(function () {
    if (!kakaoMap || typeof kakao === 'undefined') return;

    /* 필터 활성화 (캐시 있으면 즉시, 없으면 geocoding 시작) */
    _ensureFilter(convCat);

    /* CONV_PLACES에 이미 geocoding 완료된 항목이 있으면 바로 사용 */
    var cached = (typeof CONV_PLACES !== 'undefined' ? CONV_PLACES[convCat] || [] : [])
      .find(function (p) { return p.name === rawItem.name; });

    if (cached) {
      _zoomAndShowConv(cached);
      return;
    }

    /* 없으면 이 항목만 단독 geocoding */
    if (typeof kakao.maps.services === 'undefined') return;
    var geocoder = new kakao.maps.services.Geocoder();
    var cfg = typeof CONV_CAT_CFG !== 'undefined' && CONV_CAT_CFG[convCat];
    if (!cfg) return;
    var cleanAddr = (rawItem.addr || '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/\s+[가-힣A-Za-z][^\d]*$/, '')
      .trim();
    var fullAddr = cfg.getFullAddr
      ? cfg.getFullAddr(Object.assign({}, rawItem, { addr: cleanAddr }))
      : '경기도 화성시 ' + cleanAddr;

    geocoder.addressSearch(fullAddr, function (data, status) {
      var place = {
        id:       'conv_' + convCat + '_single',
        name:     rawItem.name,
        category: convCat,
        address:  '화성시 ' + (rawItem.addr || ''),
        lat:      status === 'OK' && data.length ? parseFloat(data[0].y) : null,
        lng:      status === 'OK' && data.length ? parseFloat(data[0].x) : null,
        extra:    rawItem,
      };
      _zoomAndShowConv(place);
    });
  }, 300);
}

function _zoomAndShowConv(place) {
  if (place.lat && place.lng && kakaoMap) {
    kakaoMap.setLevel(4);
    if (typeof _panPinAboveSlide === 'function') _panPinAboveSlide(place.lat, place.lng, 150, 280);
  }
  setTimeout(function () {
    if (typeof _showConvSlide === 'function') _showConvSlide(place);
  }, 120);
}

/* ── 특정 장소로 지도 이동 + 슬라이드 오픈 ──
 * placeId: PLACES 배열의 id (PLACES-기반 장소만, 없으면 null)
 * level  : zoom level (작을수록 확대, 기본 4)
 */
function goMapFocus(lat, lng, level, placeId) {
  /* 축제는 지도에서 뺐다 (2026-08-26, js/map.js buildOverlays 참조).
     핀이 없으므로 지도로 보내면 빈 화면에 필터만 켜진 채 아무 일도 안 일어난다.
     호출부가 6곳(즐겨찾기·검색·홈·데이터랩·관광목록·상세)이라 각각 고치는 대신
     여기 한 곳에서 축제 상세로 돌린다 — 새 진입점이 생겨도 자동으로 걸린다. */
  if (placeId != null && typeof PLACES !== 'undefined') {
    var _fp = PLACES.find(function (x) { return x.id === placeId; });
    if (_fp && _fp.category === 'festival') {
      /* openFestView 가 '어느 탭에서 왔는지'를 기억해 뒤로가기와 헤더 라벨을 맞추고,
       * 탭 전환까지 맡는다(js/tourism.js, 2026-08-26). 지연은 없다 — go() 뒤에
       * setTimeout 을 두면 추천 탭 목록이 한 프레임 번쩍인다. */
      openFestView('detail', placeId);
      return;
    }
  }
  go('map');
  setTimeout(function () {
    if (!kakaoMap) {
      if (typeof showToast === 'function') showToast('지도를 불러오는 중이에요. 잠시 후 다시 눌러주세요.');
      return;
    }
    /* 카테고리 필터 활성화 (이미 활성화된 경우 토글 방지) */
    if (placeId != null && typeof PLACES !== 'undefined') {
      var _p = PLACES.find(function(x) { return x.id === placeId; });
      if (_p) {
        var _cat = _p.category;
        if (_cat === 'tourist') {
          var _tkChip = document.querySelector('#map-chips .chip[data-cat="tourist"]');
          if (!_tkChip || !_tkChip.classList.contains('active')) setFilter('tourist');
          else if (typeof setTouristVisible === 'function') setTouristVisible(true);
        } else {
          var _catChip = document.querySelector('#map-chips .chip[data-cat="' + _cat + '"]');
          if (!_catChip || !_catChip.classList.contains('active')) {
            if (typeof setFilter === 'function') setFilter(_cat);
          }
        }
      }
    }
    kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
    kakaoMap.setLevel(level || 4);
    if (placeId != null) {
      /* 디바운스(100ms) + 렌더 여유 → 300ms 후 클릭 */
      setTimeout(function () { if (typeof onPinClick === 'function') onPinClick(placeId); }, 300);
    }
  }, 350);
}

/* ── 주차장 위치로 지도 이동 + 슬라이드 오픈 ── */
function goMapPark(lat, lng, parkId) {
  go('map');
  setTimeout(function () {
    if (!kakaoMap) return;
    if (typeof activateParking === 'function') activateParking();
    setTimeout(function () {
      kakaoMap.setLevel(4);
      if (typeof _panPinAboveSlide === 'function') _panPinAboveSlide(lat, lng, 150, 300);
      /* 주차장 슬라이드 카드 오픈 */
      var pk = null;
      if (parkId != null && typeof parkingData !== 'undefined') {
        pk = parkingData.find(function (p) { return p.id === parkId; });
      }
      if (!pk && typeof parkingData !== 'undefined') {
        pk = parkingData.find(function (p) { return p.lat === lat && p.lng === lng; });
      }
      if (pk && typeof showParkingSlide === 'function') {
        setTimeout(function () { showParkingSlide(pk); }, 160);
      }
    }, 150);
  }, 350);
}

/* ── 지역화폐 위치로 지도 이동 ── */
function goMapLc(lat, lng) {
  go('map');
  setTimeout(function () {
    if (!kakaoMap) return;
    /* 이미 활성화된 경우 toggle 방지 */
    var _lcChip = document.querySelector('#map-chips .chip[data-cat="localcurrency"]');
    if (!_lcChip || !_lcChip.classList.contains('active')) setFilter('localcurrency');
    setTimeout(function () {
      kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
      kakaoMap.setLevel(4);
    }, 150);
  }, 350);
}

/* ── 편의정보 칩 + 좌표로 지도 열기 (2026-08-26) ────────────────────────────
 * 영화관을 PLACES 에서 CONVENIENCE.cinemas 로 옮기면서 필요해졌다.
 * 그전에는 관광지라 goMapFocus(=PLACES 핀)로 갔는데, 이제 편의정보 칩을 켜야
 * 핀이 그려진다. 위 goMapLc 와 같은 구조다 — 칩을 먼저 켜고 한 박자 뒤에
 * 카메라를 옮긴다. 순서를 바꾸면 칩이 켜지며 지도를 다시 그려 중심이 되돌아간다.
 * cat 은 js/conv_map.js 의 CONV_CAT_CFG 키다('cinema'·'camping'·'hotel' 등). */
function goMapConv(cat, lat, lng) {
  go('map');
  setTimeout(function () {
    if (!kakaoMap) return;
    var chip = document.querySelector('#map-chips .chip[data-cat="' + cat + '"]');
    if (!chip || !chip.classList.contains('active')) setFilter(cat);
    if (lat && lng) {
      setTimeout(function () {
        kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
        kakaoMap.setLevel(4);
      }, 150);
    }
  }, 350);
}

