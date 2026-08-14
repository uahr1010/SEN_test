/* ==========================================================================
   projectmap.js — 국내 실적 지도 (MapLibre GL, 실제 지도 타일)

   예전 kmap.js(순수 SVG, 시/도 색칠 → 클릭하면 시/군/구 팝업)를 대신합니다.
   이번에는 4,576개 현장 좌표(assets/data/project_points.json)를 지도
   레이어로 전부 올려 두고, 확대할수록 저절로 갈라지는 방식입니다 —
   팝업으로 한 번 더 들어갈 필요가 없어 시/도 드릴다운 팝업도 없앴습니다.

     ● 정확한 곳(번지·도로명까지 특정)  낱개 점. 확대하면 흩어집니다.
     ○ 대략인 곳(시/군/구까지만 특정)   그 시/군/구 중심에 속 빈 원 하나로
       묶어 둡니다 — 정확한 지점이 아니라는 걸 형태로 알립니다.

   배율에 따라 주인공이 바뀝니다: 시/도 색칠(~6.9) → 시/군/구 원(6.9~11.5)
   → 개별 현장 점(11.5~). 색은 어디서나 "건수"만 뜻합니다(진할수록 많음).
   자세한 이유는 이 코드를 만든 팀이 남긴 _전달_프로젝트지도/읽어주세요.md
   에 더 적혀 있습니다.

   ⚠️ project_points.json 에는 번지·도로명까지의 정밀 주소가 들어 있습니다
   (기존 content/downloads/projects.json 은 시/군/구까지만). 이 공개
   범위 확대는 2026-08-14 사내 확인을 받은 사안입니다.

   글자 파일(assets/fonts/Noto Sans Bold/0-255.pbf)이 필요합니다 — 폴더
   이름의 띄어쓰기까지 그대로여야 합니다. MapLibre는 글자 파일을 못
   받으면 그 타일의 원까지 통째로 버립니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  /* 번지·도로명까지 잡힌 것으로 보는 값들.
     REGION(동 중심)·ROAD(번지 없는 도로)는 좌표가 있어도 그 지점이
     아니므로 낱개 점에 넣지 않습니다. */
  var EXACT = { ROAD_ADDR: 1, REGION_ADDR: 1, KEYWORD: 1 };

  var MIN_ZOOM = 3.6;
  var MAX_ZOOM = 18;
  var CLUSTER_MAX_ZOOM = 16;
  var CLUSTER_RADIUS = 46;
  var PROV_FADE  = [6.9, 7.5];
  var CLUST_FADE = [6.9, 7.5];
  var AREA_SWAP  = [11.5, 12.5];
  var AREA_SPLIT = 11;
  var HOME_BOUNDS = [[119.5, 31.5], [140.5, 43.5]];

  var esc = (SEN.util && SEN.util.esc) || function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  var map = null, kgeo, kmapData, munis, popup = null;
  var elBack, elLegendMax;
  var started = false;
  var pointCount = null;   // project_points.json 의 count. 탭을 오가도 다시 안 지워지도록 캐시해 둡니다.

  function applyPointCount() {
    var el = document.querySelector('[data-pmap-count]');
    if (el && pointCount != null) el.textContent = pointCount.toLocaleString() + '건';
  }

  /* ---------- 시/군/구 중심점 ---------- */
  var _cCache = {}, _byCode = null;
  function muniByCode() {
    if (!_byCode) {
      _byCode = {};
      munis.features.forEach(function (f) { _byCode[f.properties.code] = f; });
    }
    return _byCode;
  }
  function ringCentroid(ring) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      var x0 = ring[i][0], y0 = ring[i][1], x1 = ring[i + 1][0], y1 = ring[i + 1][1];
      var cr = x0 * y1 - x1 * y0;
      a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
    }
    if (Math.abs(a) < 1e-12) return null;
    a *= 0.5;
    return [cx / (6 * a), cy / (6 * a), Math.abs(a)];
  }
  function featureCenter(f) {
    var polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    var best = null;
    polys.forEach(function (p) {
      var c = ringCentroid(p[0]);
      if (c && (!best || c[2] > best[2])) best = c;
    });
    return best ? [best[0], best[1]] : null;
  }
  function codesCenter(codes) {
    if (!codes || !codes.length) return null;
    var key = codes.slice().sort().join(',');
    if (_cCache[key]) return _cCache[key];
    var by = muniByCode(), xs = 0, ys = 0, k = 0;
    codes.forEach(function (code) {
      var f = by[code]; if (!f) return;
      var c = featureCenter(f); if (!c) return;
      xs += c[0]; ys += c[1]; k++;
    });
    if (!k) return null;
    return (_cCache[key] = [xs / k, ys / k]);
  }

  function areaName(addr) {
    var toks = String(addr).split(' ');
    return toks.length >= 2 ? toks[0] + ' ' + toks[1] : (toks[0] || '');
  }

  /* 시/군/구 여러 개에 걸친 묶음을 하나의 칠할 구역으로 합칩니다
     (청주시=구 4개, 시/도까지만 아는 건=그 도의 시군구 전부). */
  function buildRegions(bucket) {
    var byCode = {};
    munis.features.forEach(function (f) { byCode[f.properties.code] = f; });

    var feats = [], labels = [];
    var groups = {};
    Object.keys(bucket).forEach(function (k) {
      var b = bucket[k];
      if (!b.codes || !b.codes.length) return;
      if (b.prec === 'SIDO') return;   // 시/도까지만 아는 건 구역 칠은 과장이라 원(속 빈)으로만 둠

      var key = b.codes.slice().sort().join(',');
      if (!groups[key]) groups[key] = { codes: b.codes, n: 0, name: b.name, prec: b.prec, lng: b.lng, lat: b.lat };
      groups[key].n += b.n;
      if (b.prec === 'SIGUNGU') {
        groups[key].name = b.name; groups[key].lng = b.lng; groups[key].lat = b.lat; groups[key].prec = b.prec;
      }
    });

    Object.keys(groups).forEach(function (k) {
      var b = groups[k];
      var rings = [];
      b.codes.forEach(function (code) {
        var f = byCode[code]; if (!f) return;
        var g = f.geometry;
        if (g.type === 'Polygon') rings.push(g.coordinates);
        else g.coordinates.forEach(function (p) { rings.push(p); });
      });
      if (!rings.length) return;

      var props = { n: b.n, name: b.name, prec: b.prec };
      feats.push({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: rings }, properties: props });
      labels.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [b.lng, b.lat] }, properties: props });
    });
    return { poly: { type: 'FeatureCollection', features: feats },
             label: { type: 'FeatureCollection', features: labels } };
  }

  function styleSpec() {
    return {
      version: 8,
      /* ⚠️ 외부 폰트 서버(fonts.openmaptiles.org)는 두 폰트를 이어붙인
         요청에 pbf 대신 HTML을 200으로 돌려줘, MapLibre가 그 타일을
         통째로 버립니다. 그래서 파일을 같이 받아 둡니다. */
      glyphs: 'assets/fonts/{fontstack}/{range}.pbf',
      sources: {
        base: {
          type: 'raster',
          tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
                  'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
                  'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors © CARTO'
        }
      },
      layers: [{ id: 'base', type: 'raster', source: 'base' }]
    };
  }

  function getJSON(u) {
    return fetch(u, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(u + ' (' + r.status + ')');
      return r.json();
    });
  }

  /* ---------- 지도 구성 ---------- */
  function build(byProvCount, exactFC, areaFC, regionFC) {
    var mx = 1;
    Object.keys(byProvCount).forEach(function (k) { if (byProvCount[k] > mx) mx = byProvCount[k]; });
    if (elLegendMax) elLegendMax.textContent = mx.toLocaleString() + '건';

    /* 1) 시/도 색칠 — 멀리서 전체 분포, 가까이 가면 사라짐 */
    var fc = { type: 'FeatureCollection', features: kgeo.features.map(function (f) {
      var short = kmapData.prefix[f.properties.name] || f.properties.name;
      var n = byProvCount[short] || 0;
      return { type: 'Feature', geometry: f.geometry,
               properties: { name: f.properties.name, n: n, t: Math.pow(n / mx, 0.45) } };
    }) };
    map.addSource('prov', { type: 'geojson', data: fc });
    map.addLayer({ id: 'prov-fill', type: 'fill', source: 'prov',
      paint: {
        'fill-color': ['interpolate', ['linear'], ['get', 't'], 0, '#c7ddf7', 0.35, '#93c5fd', 0.7, '#3b82f6', 1, '#1d4ed8'],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], PROV_FADE[0], 0.55, PROV_FADE[1], 0]
      } });
    map.addLayer({ id: 'prov-line', type: 'line', source: 'prov',
      paint: { 'line-color': '#ffffff', 'line-width': 1.2,
               'line-opacity': ['interpolate', ['linear'], ['zoom'], PROV_FADE[0], 0.9, PROV_FADE[1], 0] } });

    /* 2) 정확한 곳 — 클러스터 켬 */
    map.addSource('sites', { type: 'geojson', data: exactFC, cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM, clusterRadius: CLUSTER_RADIUS });

    var fadeIn = ['interpolate', ['linear'], ['zoom'], AREA_SWAP[0], 0, AREA_SWAP[1], 1];

    map.addLayer({ id: 'cl', type: 'circle', source: 'sites', filter: ['has', 'point_count'],
      minzoom: AREA_SWAP[0],
      paint: {
        'circle-color': '#0071e3',
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], AREA_SWAP[0], 0, AREA_SWAP[1], 0.92],
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': fadeIn
      } });
    map.addLayer({ id: 'cl-n', type: 'symbol', source: 'sites', filter: ['has', 'point_count'],
      minzoom: AREA_SWAP[0],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'],
                'text-size': 12, 'text-allow-overlap': true },
      paint: { 'text-color': '#ffffff', 'text-opacity': fadeIn } });

    map.addLayer({ id: 'pt', type: 'circle', source: 'sites', filter: ['!', ['has', 'point_count']],
      minzoom: AREA_SWAP[0],
      paint: {
        'circle-color': '#0071e3',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 18, 10],
        'circle-opacity': fadeIn, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': fadeIn
      } });

    /* 3) 대략인 곳 — 시/군/구마다 속 빈 원 (묶기 반경은 원 지름보다 넉넉히) */
    map.addSource('areas', { type: 'geojson', data: areaFC,
      cluster: true, clusterMaxZoom: AREA_SPLIT, clusterRadius: 72,
      clusterProperties: { n: ['+', ['get', 'n']] } });

    var areaFade = ['interpolate', ['linear'], ['zoom'],
      CLUST_FADE[0], 0, CLUST_FADE[1], 1, AREA_SWAP[0], 1, AREA_SWAP[1], 0];
    var t = ['^', ['min', 1, ['/', ['get', 'n'], mx]], 0.45];
    var RAMP = ['interpolate', ['linear'], t, 0, '#c7ddf7', 0.35, '#93c5fd', 0.7, '#3b82f6', 1, '#1d4ed8'];

    map.addLayer({ id: 'ar', type: 'circle', source: 'areas',
      minzoom: CLUST_FADE[0], maxzoom: AREA_SWAP[1],
      paint: {
        'circle-color': RAMP,
        'circle-radius': ['step', ['get', 'n'], 15, 10, 20, 50, 26, 200, 33],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'],
          CLUST_FADE[0], 0, CLUST_FADE[1], 0.94, AREA_SWAP[0], 0.94, AREA_SWAP[1], 0],
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': areaFade
      } });
    map.addLayer({ id: 'ar-n', type: 'symbol', source: 'areas',
      minzoom: CLUST_FADE[0], maxzoom: AREA_SWAP[1],
      layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'],
                'text-size': ['step', ['get', 'n'], 12, 50, 13, 200, 14], 'text-allow-overlap': true },
      paint: { 'text-color': ['case', ['<', t, 0.55], '#0b3b8f', '#ffffff'], 'text-opacity': areaFade } });

    /* 4) 확대했을 때의 구역 칠하기 — 원을 대신함 */
    var regionFade = ['interpolate', ['linear'], ['zoom'], AREA_SWAP[0], 0, AREA_SWAP[1], 1];
    map.addSource('regions', { type: 'geojson', data: regionFC.poly });
    map.addSource('regionlabels', { type: 'geojson', data: regionFC.label });

    map.addLayer({ id: 'rg-fill', type: 'fill', source: 'regions', minzoom: AREA_SWAP[0],
      paint: { 'fill-color': '#0071e3',
               'fill-opacity': ['interpolate', ['linear'], ['zoom'], AREA_SWAP[0], 0, AREA_SWAP[1], 0.07] } }, 'cl');
    map.addLayer({ id: 'rg-line', type: 'line', source: 'regions', minzoom: AREA_SWAP[0],
      paint: { 'line-color': '#0071e3', 'line-width': 1.6, 'line-dasharray': [3, 3],
               'line-opacity': ['interpolate', ['linear'], ['zoom'], AREA_SWAP[0], 0, AREA_SWAP[1], 0.5] } }, 'cl');
    map.addLayer({ id: 'rg-n', type: 'symbol', source: 'regionlabels', minzoom: AREA_SWAP[0],
      layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'], 'text-size': 14,
                'text-padding': 8, 'text-allow-overlap': false, 'text-ignore-placement': false },
      paint: { 'text-color': '#0b5fce', 'text-opacity': regionFade, 'text-halo-color': '#ffffff', 'text-halo-width': 2.5 } });

    wireEvents();
    map.resize();
    map.fitBounds(HOME_BOUNDS, { padding: 24, duration: 0 });
  }

  function precLabel(p) {
    if (p === 'ROAD_ADDR')   return '도로명 주소로 찾은 위치';
    if (p === 'REGION_ADDR') return '지번 주소로 찾은 위치';
    if (p === 'KEYWORD')     return '장소명으로 찾은 위치';
    if (p === 'REGION')      return '동 중심 (번지는 못 찾음)';
    if (p === 'ROAD')        return '도로 중심 (번지는 못 찾음)';
    if (p === 'SIGUNGU')     return '시/군/구 중심 (대략 위치)';
    if (p === 'CITY')        return '시 중심 (대략 위치)';
    if (p === 'SIDO')        return '시/도 중심 (대략 위치)';
    return '';
  }

  function wireEvents() {
    var GL = window.maplibregl;
    function areaShown() { return map.getZoom() >= CLUST_FADE[0] && map.getZoom() < AREA_SWAP[1]; }
    function shown() { return map.getZoom() >= AREA_SWAP[0]; }

    map.on('click', 'cl', function (e) {
      if (!shown()) return;
      var f = map.queryRenderedFeatures(e.point, { layers: ['cl'] })[0];
      if (!f) return;
      map.getSource('sites').getClusterExpansionZoom(f.properties.cluster_id).then(function (z) {
        map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z, MAX_ZOOM), duration: 600 });
      }).catch(function () {
        map.easeTo({ center: f.geometry.coordinates, zoom: map.getZoom() + 2, duration: 600 });
      });
    });

    map.on('click', 'pt', function (e) {
      if (!shown()) return;
      var p = e.features[0].properties;
      if (popup) popup.remove();
      popup = new GL.Popup({ offset: 12, closeButton: false })
        .setLngLat(e.features[0].geometry.coordinates)
        .setHTML('<strong>' + esc(p.addr) + '</strong><br>' + precLabel(p.prec))
        .addTo(map);
    });

    map.on('mouseenter', 'ar', function (e) {
      if (!areaShown()) return;
      var f = e.features[0], p = f.properties;
      var merged = !!p.cluster;
      if (popup) popup.remove();
      popup = new GL.Popup({ offset: 16, closeButton: false, closeOnClick: false })
        .setLngLat(f.geometry.coordinates)
        .setHTML('<strong>' + esc(merged ? '이 일대' : (p.name || '이 일대')) + ' ' + Number(p.n).toLocaleString() + '건</strong>'
                 + (merged ? '<br>가까운 지역을 합쳐 놓았습니다<br>눌러서 나눠 보기' : '<br>확대하면 현장이 하나씩 보입니다'))
        .addTo(map);
    });
    map.on('mouseleave', 'ar', function () { if (popup) { popup.remove(); popup = null; } });

    map.on('mousemove', 'rg-fill', function (e) {
      if (map.getZoom() < AREA_SWAP[0]) return;
      var best = e.features[0];
      for (var i = 1; i < e.features.length; i++) {
        if (e.features[i].properties.prec === 'SIGUNGU') { best = e.features[i]; break; }
      }
      var p = best.properties;
      map.getCanvas().style.cursor = 'help';
      if (popup) popup.remove();
      popup = new GL.Popup({ offset: 8, closeButton: false, closeOnClick: false })
        .setLngLat(e.lngLat)
        .setHTML('<strong>' + esc(p.name) + ' ' + Number(p.n).toLocaleString() + '건</strong><br>주소가 이 구역까지만 있습니다<br>정확한 지점은 확인되지 않았습니다')
        .addTo(map);
    });
    map.on('mouseleave', 'rg-fill', function () {
      map.getCanvas().style.cursor = '';
      if (popup) { popup.remove(); popup = null; }
    });

    map.on('click', 'ar', function (e) {
      if (!areaShown()) return;
      var f = e.features[0];
      if (!f.properties.cluster) return;
      map.getSource('areas').getClusterExpansionZoom(f.properties.cluster_id).then(function (z) {
        map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z, MAX_ZOOM), duration: 600 });
      }).catch(function () {
        map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(map.getZoom() + 2, MAX_ZOOM), duration: 600 });
      });
    });

    ['cl', 'pt'].forEach(function (id) {
      map.on('mouseenter', id, function () { if (shown()) map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, function () { map.getCanvas().style.cursor = ''; });
    });
    map.on('mouseenter', 'ar', function () { if (areaShown()) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'ar', function () { map.getCanvas().style.cursor = ''; });

    map.on('mouseenter', 'cl', function (e) {
      if (!shown()) return;
      var f = e.features[0];
      if (popup) popup.remove();
      popup = new GL.Popup({ offset: 16, closeButton: false, closeOnClick: false })
        .setLngLat(f.geometry.coordinates)
        .setHTML('<strong>' + Number(f.properties.point_count).toLocaleString() + '건</strong><br>눌러서 자세히')
        .addTo(map);
    });
    map.on('mouseleave', 'cl', function () { if (popup) { popup.remove(); popup = null; } });

    map.on('mousemove', 'prov-fill', function (e) {
      if (map.getZoom() >= CLUST_FADE[0]) return;
      var p = e.features[0].properties;
      map.getCanvas().style.cursor = 'pointer';
      if (popup) popup.remove();
      popup = new GL.Popup({ offset: 8, closeButton: false, closeOnClick: false })
        .setLngLat(e.lngLat)
        .setHTML('<strong>' + esc(p.name) + '</strong><br>' + Number(p.n).toLocaleString() + '건')
        .addTo(map);
    });
    map.on('mouseleave', 'prov-fill', function () {
      map.getCanvas().style.cursor = '';
      if (popup) { popup.remove(); popup = null; }
    });

    map.on('moveend', function () { if (elBack) elBack.hidden = map.getZoom() < 7.2; });
    if (elBack) {
      elBack.addEventListener('click', function () {
        if (popup) { popup.remove(); popup = null; }
        map.fitBounds(HOME_BOUNDS, { padding: 24, duration: 700 });
      });
    }
  }

  /* ---------- 진입점 ----------
     els: { wrap, canvas, back, legendMax } */
  function init(els) {
    if (started) return;   // 언어 전환 등으로 render()가 다시 불려도 중복 초기화 안 함
    if (!window.maplibregl) { if (els.wrap) els.wrap.classList.add('is-unavailable'); return; }
    started = true;
    elBack = els.back;
    elLegendMax = els.legendMax;

    Promise.all([
      getJSON('assets/data/kgeo.json'),
      getJSON('assets/data/kmap.json'),
      getJSON('assets/data/project_points.json'),
      getJSON('assets/data/munis.json')
    ]).then(function (res) {
      kgeo = res[0]; kmapData = res[1]; munis = res[3];
      var raw = res[2];
      pointCount = raw.count;
      applyPointCount();

      var cnt = {}, exactFeats = [], bucket = {}, areaBucket = {};
      raw.points.forEach(function (p) {
        var short = (p.addr.split(' ')[0] || '').replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '');
        if (short) cnt[short] = (cnt[short] || 0) + 1;

        var codes = p.codes || [];
        var akey = codes.length ? codes.slice().sort().join(',') : 'xy:' + p.lng.toFixed(4) + ',' + p.lat.toFixed(4);
        if (!areaBucket[akey]) areaBucket[akey] = { codes: codes, n: 0, name: p.area || areaName(p.addr), fbLng: p.lng, fbLat: p.lat };
        areaBucket[akey].n += 1;

        if (EXACT[p.prec]) {
          exactFeats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
                             properties: { addr: p.addr, prec: p.prec, kind: p.kind } });
          return;
        }
        var key = p.lng.toFixed(5) + ',' + p.lat.toFixed(5);
        if (!bucket[key]) bucket[key] = { lng: p.lng, lat: p.lat, n: 0, prec: p.prec, name: p.area || areaName(p.addr), codes: codes };
        bucket[key].n += 1;
      });

      var exactFC = { type: 'FeatureCollection', features: exactFeats };
      var areaFC = { type: 'FeatureCollection', features: Object.keys(areaBucket).map(function (k) {
        var b = areaBucket[k];
        var c = codesCenter(b.codes);
        return { type: 'Feature', geometry: { type: 'Point', coordinates: c || [b.fbLng, b.fbLat] },
                 properties: { n: b.n, name: b.name } };
      }) };
      var regionFC = buildRegions(bucket);

      map = new window.maplibregl.Map({
        container: els.canvas, style: styleSpec(),
        center: [129.5, 37.5], zoom: 5.2,
        minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, attributionControl: true
      });
      map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', function () { build(cnt, exactFC, areaFC, regionFC); });
    }).catch(function (err) {
      console.warn('[SEN] 프로젝트 지도를 불러오지 못했습니다:', err && err.message);
      if (els.wrap) els.wrap.classList.add('is-unavailable');
    });
  }

  /* 탭을 국외→국내로 되돌아왔을 때, 그 사이 화면 폭이 바뀌었을 수 있으니
     캔버스 크기를 다시 맞춥니다(globe.js의 refresh()와 같은 이유). */
  function refresh() {
    if (map) map.resize();
    applyPointCount();   // 탭을 오갈 때마다 renderProjectPanel()이 통계 칸을 다시 쓰므로, 알고 있으면 바로 채워 넣습니다
  }

  SEN.projectMap = { init: init, refresh: refresh };
})(window.SEN);
