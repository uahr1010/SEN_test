/* ==========================================================================
   kmap.js — 국내 실적 지도 (SVG, 외부 지도 라이브러리 없음)

   assets/data/kgeo.json (17개 시/도 경계)와 assets/data/kmap.json
   (전체명↔축약명, 지역명→시군구코드)로 시도별 단계색 지도를 그립니다.
   시/도를 클릭하면 assets/data/munis.json(전국 시군구 경계, 300KB라
   이때 처음 불러옵니다)으로 그 도 안의 시군구 지도를 보여줍니다.

   ⚠️ 시군구별 "건수"만 보여줍니다. 개별 프로젝트 이름·주소 목록은 없습니다 —
   content/projects.json 자체가 "서울 강남구" 같은 시군구 단위로만 저장되어
   있고(공개 저장소라 정확한 주소·현장명을 두지 않기로 한 결정), 그보다
   더 잘게 쪼갠 데이터가 애초에 존재하지 않기 때문입니다.

   좌표·경계 데이터 출처: SEN_homepage.html 에 이미 내장돼 있던 GeoJSON을
   그대로 추출해 씁니다 (같은 프로젝트의 다른 산출물).
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var D2R = Math.PI / 180;
  var KY = Math.cos(36.2 * D2R);

  /* 시/도 축약명 → 시군구 코드 앞 2자리 (MUNIS 필터링용) */
  var PROVCODE = {
    '서울': '11', '부산': '21', '대구': '22', '인천': '23', '광주': '24', '대전': '25',
    '울산': '26', '세종': '29', '경기': '31', '강원': '32', '충북': '33', '충남': '34',
    '전북': '35', '전남': '36', '경북': '37', '경남': '38', '제주': '39'
  };

  /* 지도 위 시/도 이름표 위치가 겹치지 않도록 살짝 밀어 주는 값 (픽셀) */
  var NUDGE = {
    '서울': [-6, -14], '인천': [-30, 6], '경기': [30, 46], '세종': [-4, -2], '대전': [4, 6],
    '충남': [-16, 6], '대구': [2, 4], '울산': [10, 0], '부산': [8, 10], '광주': [-6, 4],
    '전남': [-10, 12], '경북': [10, -8], '강원': [6, -6], '충북': [6, 10], '전북': [-2, 4],
    '경남': [-8, 8], '제주': [0, 2]
  };

  var api = { init: init };
  SEN.kmap = api;

  /* ---------- 투영 (등장방형도법을 위도 36.2°에서 등거리로 보정) ---------- */
  function rawXY(lng, lat) { return [lng * KY, -lat]; }

  function boundsOf(features) {
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    features.forEach(function (f) {
      var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach(function (poly) {
        poly.forEach(function (ring) {
          ring.forEach(function (pt) {
            var xy = rawXY(pt[0], pt[1]);
            if (xy[0] < minX) minX = xy[0];
            if (xy[0] > maxX) maxX = xy[0];
            if (xy[1] < minY) minY = xy[1];
            if (xy[1] > maxY) maxY = xy[1];
          });
        });
      });
    });
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  function makePrj(b, vw, vh, pad) {
    var s = Math.min((vw - 2 * pad) / (b.maxX - b.minX), (vh - 2 * pad) / (b.maxY - b.minY));
    var ox = (vw - s * (b.maxX - b.minX)) / 2, oy = (vh - s * (b.maxY - b.minY)) / 2;
    return function (lng, lat) {
      var xy = rawXY(lng, lat);
      return [(xy[0] - b.minX) * s + ox, (xy[1] - b.minY) * s + oy];
    };
  }

  function pathOf(f, prj) {
    var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    var d = '';
    polys.forEach(function (poly) {
      poly.forEach(function (ring) {
        d += ring.map(function (pt, i) {
          var xy = prj(pt[0], pt[1]);
          return (i ? 'L' : 'M') + xy[0].toFixed(1) + ' ' + xy[1].toFixed(1);
        }).join('') + 'Z';
      });
    });
    return d;
  }

  function centroidOf(f, prj) {
    var big = null, bl = 0;
    var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    polys.forEach(function (poly) {
      if (poly[0] && poly[0].length > bl) { bl = poly[0].length; big = poly[0]; }
    });
    var cx = 0, cy = 0;
    big.forEach(function (pt) {
      var xy = prj(pt[0], pt[1]);
      cx += xy[0]; cy += xy[1];
    });
    return [cx / big.length, cy / big.length];
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* 지역 건수 → 파란색 단계. 옅은 회색(--c-tint)에서 사이트 블루(--c-blue)까지 */
  function fillFor(n, maxN) {
    var t = Math.pow((n || 0) / (maxN || 1), 0.45);
    var c0 = [239, 245, 253], c1 = [11, 95, 206];
    return 'rgb(' + c0.map(function (v, i) { return Math.round(lerp(v, c1[i], t)); }).join(',') + ')';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- 데이터 로드 ---------- */
  var kgeo = null, kmapData = null, munis = null;

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' (' + r.status + ')');
      return r.json();
    });
  }

  function loadBase() {
    if (kgeo && kmapData) return Promise.resolve();
    return Promise.all([
      fetchJSON('assets/data/kgeo.json'),
      fetchJSON('assets/data/kmap.json')
    ]).then(function (r) { kgeo = r[0]; kmapData = r[1]; });
  }

  function loadMunis() {
    if (munis) return Promise.resolve(munis);
    return fetchJSON('assets/data/munis.json').then(function (m) { munis = m; return m; });
  }

  /* ---------- 메인 지도 ---------- */
  function init(data, els) {
    return loadBase().then(function () { return build(data, els); })
      .catch(function (err) {
        console.warn('[SEN] 지도를 불러오지 못했습니다:', err.message);
        els.wrap.classList.add('is-unavailable');
        return false;
      });
  }

  function build(data, els) {
    var svg = els.svg, tip = els.tip, drill = els.drill;
    var byProv = data.byProv || {};
    var maxN = 0;
    Object.keys(byProv).forEach(function (k) { if (byProv[k] > maxN) maxN = byProv[k]; });

    var VBW = 760, VBH = 940;
    svg.setAttribute('viewBox', '0 0 ' + VBW + ' ' + VBH);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var bounds = boundsOf(kgeo.features);
    var prj = makePrj(bounds, VBW, VBH, 46);

    var gPaths = document.createElementNS(SVGNS, 'g');
    var gLabels = document.createElementNS(SVGNS, 'g');
    svg.appendChild(gPaths);
    svg.appendChild(gLabels);

    kgeo.features.forEach(function (f) {
      var full = f.properties.name;
      var short = kmapData.prefix[full] || full;
      var n = byProv[short] || 0;

      var path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', pathOf(f, prj));
      path.setAttribute('class', 'kmap__prov' + (n ? ' has' : ''));
      path.setAttribute('fill', fillFor(n, maxN));
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', full + ' ' + n + '건');
      gPaths.appendChild(path);

      var c = centroidOf(f, prj);
      var nudge = NUDGE[short] || [0, 0];
      var cx = c[0] + nudge[0], cy = c[1] + nudge[1];
      if (n) {
        var label = document.createElementNS(SVGNS, 'text');
        label.setAttribute('class', 'kmap__label');
        label.setAttribute('x', cx);
        label.setAttribute('y', cy);
        label.textContent = short + ' ' + n;
        gLabels.appendChild(label);
      }

      function showTip(clientX, clientY) {
        var box = svg.getBoundingClientRect();
        tip.hidden = false;
        tip.innerHTML = '<strong>' + esc(full) + '</strong><span>' + n + '건</span>';
        tip.style.left = (clientX - box.left + 14) + 'px';
        tip.style.top = (clientY - box.top + 10) + 'px';
      }
      path.addEventListener('mousemove', function (e) { showTip(e.clientX, e.clientY); });
      path.addEventListener('mouseleave', function () { tip.hidden = true; });
      path.addEventListener('click', function () { openDrill(short, full, data, drill); });
      path.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrill(short, full, data, drill); }
      });
    });

    return true;
  }

  /* ---------- 시/도 클릭 → 시군구 드릴다운 ---------- */
  function openDrill(short, full, data, drill) {
    var regions = (data.domestic.regions || []).filter(function (r) {
      return r.name.split(' ')[0] === short;
    }).sort(function (a, b) { return b.n - a.n; });
    var total = regions.reduce(function (s, r) { return s + r.n; }, 0);

    drill.querySelector('[data-kmap-drill-title]').textContent = full;
    drill.querySelector('[data-kmap-drill-meta]').textContent =
      total + '건 · ' + regions.length + '개 지역';

    var list = drill.querySelector('[data-kmap-drill-list]');
    list.innerHTML = regions.length
      ? regions.map(function (r) {
          var pct = total ? Math.max(4, Math.round(r.n / regions[0].n * 100)) : 0;
          return '<li><span class="regions__name">' + esc(SEN.util.regionName(r.name.split(' ').slice(1).join(' ') || r.name)) +
            '</span><span class="regions__bar"><i style="width:' + pct + '%"></i></span>' +
            '<span class="regions__n">' + r.n + '</span></li>';
        }).join('')
      : '';

    drill.hidden = false;
    document.body.classList.add('is-locked');

    var dsvg = drill.querySelector('[data-kmap-drill-svg]');
    dsvg.innerHTML = '';
    loadMunis().then(function (m) {
      drawDrillMap(dsvg, m, short, regions);
    }).catch(function (err) {
      console.warn('[SEN] 시군구 지도를 불러오지 못했습니다:', err.message);
    });
  }

  function drawDrillMap(svg, munisData, short, regions) {
    var pc = PROVCODE[short];
    if (!pc) return;
    var feats = munisData.features.filter(function (f) { return f.properties.code.indexOf(pc) === 0; });
    if (!feats.length) return;

    /* RMAP: "서울 강남구" 같은 지역명 → 시군구 코드 배열.
       여러 코드에 걸친 지역(구 통합 전 표기 등)은 건수를 코드 수만큼 나눠 색칠에만 반영합니다. */
    var dCount = {};
    regions.forEach(function (r) {
      var codes = kmapData.rmap[r.name];
      if (!codes || !codes.length) return;
      codes.forEach(function (c) { dCount[c] = (dCount[c] || 0) + r.n / codes.length; });
    });
    var dMax = 1;
    Object.keys(dCount).forEach(function (k) { if (dCount[k] > dMax) dMax = dCount[k]; });

    var VW = 640, VH = 620;
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
    var bounds = boundsOf(feats);
    var prj = makePrj(bounds, VW, VH, 36);

    var gPaths = document.createElementNS(SVGNS, 'g');
    var gLabels = document.createElementNS(SVGNS, 'g');
    svg.appendChild(gPaths);
    svg.appendChild(gLabels);

    feats.forEach(function (f) {
      var code = f.properties.code, name = f.properties.name;
      var n = dCount[code] || 0;
      var path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', pathOf(f, prj));
      path.setAttribute('class', 'kmap__dist' + (n ? ' has' : ''));
      path.setAttribute('fill', n ? fillFor(n, dMax) : '#ececf0');
      gPaths.appendChild(path);

      if (n >= 1) {
        var c = centroidOf(f, prj);
        var t = document.createElementNS(SVGNS, 'text');
        t.setAttribute('class', 'kmap__dist-label');
        t.setAttribute('x', c[0]);
        t.setAttribute('y', c[1]);
        t.textContent = name.length <= 4 ? name : name.slice(0, 3);
        gLabels.appendChild(t);
      }

      var title = document.createElementNS(SVGNS, 'title');
      title.textContent = SEN.util.regionName(name) + (n ? ' — ' + Math.round(n) + '건' : ' — 실적 없음');
      path.appendChild(title);
    });
  }

  function closeDrill(drill) {
    drill.hidden = true;
    document.body.classList.remove('is-locked');
  }

  api.closeDrill = closeDrill;
})(window.SEN);
