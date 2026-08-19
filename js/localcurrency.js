'use strict';

var lcData      = [];
var lcClusterer = null;
var lcMap       = null;
var lcBuilt     = false;
var lcBuilding  = false;

/* ── 데이터만 미리 로드 (마커 생성은 지연) ── */
function initLocalCurrency(map) {
  lcMap = map;
  fetch('js/localcurrency-static.json')
    .then(function (r) { return r.json(); })
    .then(function (data) { lcData = data; })
    .catch(function (e) { console.warn('[가맹점] 로드 실패:', e); });
}

/* ── 표시 / 숨김 ── */
function setLcVisible(visible) {
  if (!visible) {
    if (lcClusterer) lcClusterer.setMap(null);
    return;
  }
  /* 이미 완성됐으면 바로 표시 */
  if (lcBuilt && lcClusterer) {
    lcClusterer.setMap(lcMap);
    return;
  }
  /* 아직 만들지 않았으면 청크 빌드 시작 */
  if (!lcBuilding) buildLcClusterer();
}

/* ── 클러스터러 + 마커를 500개씩 청크로 비동기 생성 ── */
function buildLcClusterer() {
  if (!lcMap || !lcData.length || lcBuilding) return;
  lcBuilding = true;

  lcClusterer = new kakao.maps.MarkerClusterer({
    map:              lcMap,
    averageCenter:    true,
    minLevel:         7,
    disableClickZoom: false,
    styles: [{
      width: '42px', height: '42px',
      background: 'rgba(22,163,74,0.38)',
      borderRadius: '50%',
      color: '#fff',
      textAlign: 'center',
      lineHeight: '42px',
      fontSize: '12px',
      fontWeight: '700',
      border: '2px solid rgba(255,255,255,0.7)',
      boxSizing: 'border-box',
      boxShadow: '0 1px 6px rgba(0,0,0,0.18)',
    }, {
      width: '50px', height: '50px',
      background: 'rgba(22,163,74,0.44)',
      borderRadius: '50%',
      color: '#fff',
      textAlign: 'center',
      lineHeight: '50px',
      fontSize: '13px',
      fontWeight: '700',
      border: '2px solid rgba(255,255,255,0.7)',
      boxSizing: 'border-box',
      boxShadow: '0 1px 6px rgba(0,0,0,0.18)',
    }, {
      width: '58px', height: '58px',
      background: 'rgba(15,118,56,0.48)',
      borderRadius: '50%',
      color: '#fff',
      textAlign: 'center',
      lineHeight: '58px',
      fontSize: '14px',
      fontWeight: '700',
      border: '2px solid rgba(255,255,255,0.7)',
      boxSizing: 'border-box',
      boxShadow: '0 1px 6px rgba(0,0,0,0.18)',
    }],
  });

  var CHUNK = 500;
  var allMarkers = [];

  function addChunk(start) {
    var end = Math.min(start + CHUNK, lcData.length);
    var chunk = [];
    for (var i = start; i < end; i++) {
      var p = lcData[i];
      var marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(p.lat, p.lng),
      });
      /* IIFE로 클로저 캡처 */
      (function (pp) {
        kakao.maps.event.addListener(marker, 'click', function () {
          showLcSlide(pp);
        });
      })(p);
      chunk.push(marker);
    }
    allMarkers = allMarkers.concat(chunk);
    lcClusterer.addMarkers(chunk, end < lcData.length); /* 마지막 청크만 redraw */

    if (end < lcData.length) {
      setTimeout(function () { addChunk(end); }, 0);
    } else {
      lcBuilt     = true;
      lcBuilding  = false;
    }
  }

  addChunk(0);
}

/* ── 가맹점 슬라이드 카드 ── */
function showLcSlide(p) {
  document.getElementById('slide-inner').innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">'
    + '<span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">💳 지역화폐 가맹점</span>'
    + '</div>'
    + '<div style="font-size:18px;font-weight:900;color:var(--text);margin-bottom:4px">' + p.n + '</div>'
    + '<div style="font-size:12px;color:var(--primary);font-weight:600;margin-bottom:6px">' + p.c + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">📍 ' + p.a + '</div>'
    + '<div class="sl-actions">'
    + '<button class="sl-btn primary" onclick="openRoute(' + p.lat + ',' + p.lng + ',\'' + p.n.replace(/'/g, '') + '\')">🗺 길찾기</button>'
    + '</div>';

  requestAnimationFrame(function () {
    document.getElementById('place-slide').classList.add('open');
    document.getElementById('map-dim').classList.add('show');
  });
}
