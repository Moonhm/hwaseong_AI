/* ============================================================================
 * js/favorites.js — 즐겨찾기 — localStorage 저장과 표시
 *
 * 왜 따로 있나: 저장소(localStorage)를 직접 만지는 유일한 기능 묶음이라 따로 둔다. 키 이름 _FAV_KEY 가 여기서만 정의된다.
 * 함께 볼 것:   홈·관광·지도 세 곳에서 별 버튼을 그린다. _favCfg() 는 CATEGORY_CONFIG 미로드 환경 대비 인라인 사본이다.
 *
 * index.html 인라인 <script> 3381~3526줄에서 분리 (2026-08-25, 개발 Claude).
 * classic script 다 — type="module" 을 붙이면 전역이 사라져 onclick 이 전부 죽는다.
 * ========================================================================== */

/* ── 즐겨찾기 ── */
var _FAV_KEY = 'hsida_favs';

function getFavs() {
  try { return JSON.parse(localStorage.getItem(_FAV_KEY) || '[]'); } catch(e) { return []; }
}
function isFav(id) {
  return getFavs().some(function(f) { return f.id === id; });
}
function toggleFav(fav) {
  var favs = getFavs();
  var idx = favs.findIndex(function(f) { return f.id === fav.id; });
  if (idx >= 0) favs.splice(idx, 1); else favs.unshift(fav);
  localStorage.setItem(_FAV_KEY, JSON.stringify(favs));
  _refreshFavUi();
}
function toggleFavBtn(btn) {
  var fid = btn.dataset.fid;
  var fav = {
    id:      fid,
    type:    btn.dataset.type || 'place',
    placeId: btn.dataset.pid ? +btn.dataset.pid : null,
    cat:     btn.dataset.cat  || '',
    lat:     +btn.dataset.lat,
    lng:     +btn.dataset.lng,
    name:    btn.dataset.name  || '',
    lcCat:   btn.dataset.lcat  || '',
    lcAddr:  btn.dataset.laddr || ''
  };
  toggleFav(fav);
  var saved = isFav(fid);
  btn.textContent = saved ? '♥ 저장됨' : '♡ 저장';
  btn.classList.toggle('saved', saved);
}
function removeFav(id) {
  localStorage.setItem(_FAV_KEY, JSON.stringify(getFavs().filter(function(f) { return f.id !== id; })));
  _refreshFavUi();
}
function clearFavs() {
  if (!confirm('즐겨찾기를 모두 삭제할까요?')) return;
  localStorage.removeItem(_FAV_KEY);
  _refreshFavUi();
}
function _refreshFavUi() {
  renderFavSection();
  renderMenuFavs();
}

/* 카테고리별 시각 정보 (CATEGORY_CONFIG 미로드 환경 대비 인라인) */
function _favCfg(f) {
  var map = {
    tourist:     { emoji:'★',  bg:'#FEF3C7', label:'관광지'    },
    festival:    { emoji:'🎉', bg:'#FEE2E2', label:'축제'      },
    mobeom:      { emoji:'🍽️', bg:'#FEF3C7', label:'모범음식점' },
    touristrest: { emoji:'🥢', bg:'#FEE2E2', label:'관광식당'  },
    lc:          { emoji:'💳', bg:'#D1FAE5', label:'가맹점'    },
    parking:     { emoji:'🅿️', bg:'#DBEAFE', label:'주차장'    }
  };
  var key = f.type === 'lc' || f.type === 'parking' ? f.type : (f.cat || 'tourist');
  return map[key] || { emoji:'★', bg:'#F3F4F6', label:'장소' };
}

function navToFav(id) {
  var f = getFavs().find(function(x) { return x.id === id; });
  if (!f) return;

  /* 주차장: goMapPark이 go('map') + activateParking + 슬라이드 오픈 일괄 처리 */
  if (f.type === 'parking') {
    goMapPark(f.lat, f.lng, f.placeId);
    return;
  }

  /* 관광지·축제 등 PLACES 핀: goMapFocus가 go('map') + 필터 + onPinClick 일괄 처리 */
  if (f.type === 'place') {
    goMapFocus(f.lat, f.lng, 4, f.placeId || null);
    return;
  }

  /* 지역화폐 가맹점: 지도 이동 + LC 필터 + 슬라이드 직접 오픈 */
  if (f.type === 'lc' && f.lat && f.lng) {
    go('map');
    setTimeout(function() {
      if (!kakaoMap || typeof kakao === 'undefined') return;
      kakaoMap.setLevel(4);
      kakaoMap.setCenter(new kakao.maps.LatLng(f.lat, f.lng));
      if (typeof setFilter === 'function') setFilter('localcurrency');
      setTimeout(function() {
        if (typeof showLcSlide === 'function') {
          showLcSlide({ id: f.placeId || 0, n: f.name, c: f.lcCat, a: f.lcAddr, lat: f.lat, lng: f.lng });
        }
      }, 400);
    }, 350);
  }
}

function renderFavSection() {
  var sec = document.getElementById('home-favs-section');
  if (!sec) return;
  var favs = getFavs();
  if (!favs.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  sec.innerHTML =
    '<div style="padding:0 var(--px) 8px;display:flex;align-items:center;justify-content:space-between">' +
      '<div class="section-title" style="font-size:15px">♥ 즐겨찾기</div>' +
      '<button style="font-size:12px;color:var(--text-muted);background:none;border:none;cursor:pointer" onclick="clearFavs()">전체 삭제</button>' +
    '</div>' +
    '<div class="fav-section">' +
    favs.slice(0, 6).map(function(f) {
      var cfg = _favCfg(f);
      var sid = f.id.replace(/'/g, '');
      return '<div class="fav-item" onclick="navToFav(\'' + sid + '\')">' +
        '<div class="fav-icon" style="background:' + cfg.bg + '">' + cfg.emoji + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="fav-name">' + (f.name || '') + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:1px">' + cfg.label + '</div>' +
        '</div>' +
        '<button class="fav-del" onclick="event.stopPropagation();removeFav(\'' + sid + '\')">×</button>' +
      '</div>';
    }).join('') +
    (favs.length > 6 ? '<div style="text-align:center;font-size:12px;color:var(--primary);padding:4px 0">+' + (favs.length - 6) + '개 더</div>' : '') +
    '</div>';
}

function renderMenuFavs() {
  var wrap = document.getElementById('menu-favs-wrap');
  if (!wrap) return;
  var favs = getFavs();
  if (!favs.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML =
    '<div class="menu-section-title" style="padding-top:16px">♥ 즐겨찾기</div>' +
    favs.slice(0, 5).map(function(f) {
      var cfg = _favCfg(f);
      var sid = f.id.replace(/'/g, '');
      return '<div class="menu-fav-item" onclick="closeMenu();navToFav(\'' + sid + '\')">' +
        '<div class="menu-fav-icon" style="background:' + cfg.bg + '">' + cfg.emoji + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="menu-fav-name">' + (f.name || '') + '</div>' +
          '<div class="menu-fav-type">' + cfg.label + '</div>' +
        '</div>' +
        '<button style="background:none;border:none;color:#D1D5DB;font-size:22px;cursor:pointer;padding:0 0 0 8px;line-height:1" ' +
          'onclick="event.stopPropagation();removeFav(\'' + sid + '\')">×</button>' +
      '</div>';
    }).join('') +
    (favs.length > 5 ? '<div style="text-align:center;font-size:12px;color:var(--primary);padding:4px 0 8px">+' + (favs.length - 5) + '개 더 (홈에서 확인)</div>' : '');
}

