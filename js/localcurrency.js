'use strict';

var lcData      = [];
var lcClusterer = null;
var lcMap       = null;

/* ── 초기화 ── */
function initLocalCurrency(map) {
  lcMap = map;
  fetch('js/localcurrency-static.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      lcData = data;
      buildLcClusterer();
    })
    .catch(function (e) { console.warn('[가맹점] 로드 실패:', e); });
}

/* ── 클러스터러 생성 ── */
function buildLcClusterer() {
  if (!lcMap || !lcData.length) return;

  var markers = lcData.map(function (p) {
    var marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(p.lat, p.lng),
    });
    kakao.maps.event.addListener(marker, 'click', function () {
      showLcSlide(p);
    });
    return marker;
  });

  lcClusterer = new kakao.maps.MarkerClusterer({
    map:           null,          /* 처음엔 숨김 */
    averageCenter: true,
    minLevel:      7,             /* level 7 이하에서 개별 마커 표시 */
    disableClickZoom: false,
    markers:       markers,
    styles: [{
      width: '44px', height: '44px',
      background: 'rgba(22,163,74,0.82)',
      borderRadius: '50%',
      color: '#fff',
      textAlign: 'center',
      lineHeight: '44px',
      fontSize: '13px',
      fontWeight: '700',
      border: '2.5px solid #fff',
      boxSizing: 'border-box',
    }, {
      width: '52px', height: '52px',
      background: 'rgba(22,163,74,0.88)',
      borderRadius: '50%',
      color: '#fff',
      textAlign: 'center',
      lineHeight: '52px',
      fontSize: '14px',
      fontWeight: '700',
      border: '2.5px solid #fff',
      boxSizing: 'border-box',
    }, {
      width: '60px', height: '60px',
      background: 'rgba(15,118,56,0.9)',
      borderRadius: '50%',
      color: '#fff',
      textAlign: 'center',
      lineHeight: '60px',
      fontSize: '15px',
      fontWeight: '700',
      border: '2.5px solid #fff',
      boxSizing: 'border-box',
    }],
  });
}

/* ── 표시 / 숨김 ── */
function setLcVisible(visible) {
  if (!lcClusterer) return;
  lcClusterer.setMap(visible ? lcMap : null);
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
