/* ==========================================================================
   projectmap.js — 국내 실적 지도 (MapLibre GL, 실제 지도 타일)

   2026-08-20 갱신: 실제 프로젝트 5,775건(assets/data/project_points.json)
   반영본으로 교체. 예전 버전과 가장 크게 다른 점은 시/군/구 원을 더 이상
   화면상 거리로 자동 병합(clusterRadius)하지 않는다는 것입니다 — 그
   방식은 "서울 + 광명 + 안양 = 53건" 처럼 시 경계를 넘어 합쳐진 실체
   없는 숫자를 만들었습니다. 지금은 cityKeyOf()로 행정구역 기준으로만
   묶고(광역시는 구 단위, 도의 시는 구를 합쳐 시 단위), 대신 원이 나오는
   배율을 조금 더 확대된 지점(8.2)으로 늦췄습니다. 자세한 배경은
   프로젝트 지도 수정_20260820/읽어주세요.md 를 참고하세요.

   오른쪽 칸도 예전의 단순 순위 목록 대신, 시/도 카드 → 시/군/구 목록 →
   프로젝트 목록으로 파고드는 패널로 바뀌었습니다(지도 클릭과 서로
   연동됩니다).

     ● 정확한 곳(번지·도로명까지 특정)  낱개 점. 확대하면 흩어집니다.
     ○ 대략인 곳(시/군/구까지만 특정)   그 시/군/구 중심에 원 하나로
       묶어 둡니다.

   배율에 따라 주인공이 바뀝니다: 시/도 색칠(~8.2) → 시/군/구 원
   (8.2~11.5) → 개별 현장 점(11.5~). 색은 어디서나 "건수"만 뜻합니다.

   ⚠️ project_points.json 에는 번지·도로명까지의 정밀 주소와 프로젝트명이
   들어 있습니다. 이 공개 범위는 2026-08-14 사내 확인을 받은 사안입니다.

   특허공법(TSC·PSRC) 표시는 SHOW_PAT 한 줄로 켜고 끕니다. 데이터에는
   method 필드가 그대로 있으므로, 특허 탭을 만들 때 다시 쓸 수 있습니다.

   글자 파일(assets/fonts/Noto Sans Bold/0-255.pbf)이 필요합니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  /* 특허공법(TSC·PSRC) 표시. v2는 순수 실적만 보여주기로 해서 껐습니다. */
  var SHOW_PAT = false;

  /* 번지·도로명까지 잡힌 것으로 보는 값들. */
  var EXACT = { ROAD_ADDR: 1, REGION_ADDR: 1, KEYWORD: 1 };

  /* 시/군/구를 열었을 때 보이는 프로젝트 목록에서, 이 목록에 있는
     프로젝트명과 정확히 같으면(project_points.json의 name 값 그대로)
     이름 끝에 작은 로고를 붙입니다(assets/img/project-logo-mark.png).
     관리자가 준 프로젝트명 목록 중 project_points.json에 실제로 있는
     것만 골라 옮긴 것입니다 — 없는 건 여기 추가하지 말고, 데이터
     자체(assets/data/project_points_base.json)에 그 프로젝트를 먼저
     넣어야 합니다. */
  var LOGO_NAMES = {
    '500KV 동해안 변환소 신축공사\n(PSRC제작납품)': 1,
    '500kV 신가평변환소 AC필터동 DECK PLATE 구조검토': 1,
    '500kV 신가평변환소 AC필터동 변경설계용역': 1,
    'LGES 오창 2 산단 전지생산 2동 옥내 파이프랙 구조설계 용역': 1,
    'LGES 오창 에너지플랜 2공장 POS-H 기술지원용역': 1,
    'LGES 오창 에너지플랜트2 전지생산2동 흡연부스 구조설계': 1,
    'LG전자 평택 시험동공장': 1,
    'LG하우시스 옥산공장': 1,
    'M14 층간리프트(2호기) 설치용 SLAB 타공 공사 설계 용역': 1,
    'Merck BioP PJT': 1,
    'N-PJT Form PSRC 제작 및 납품 2차': 1,
    'P2-PJT 154KV F-PSRC 증축': 1,
    'P2-PJT 그린동/자재동/정수장  철골공사': 1,
    'SK Hynix M15 Ph-4 F02 구조설계 용역': 1,
    'SK Hynix M15X TRUSS DECK SHOP STANDARD DWG 작성 및 구조설계 용역': 1,
    'SK Hynix 용인 Y1 PJT TRUSS DECK 구조설계 용역 계약서': 1,
    'SK Hynix 청주 M15X PJT TRUSS DECK 구조설계': 1,
    'SK On 서산3동 전극조립동 및 화성동': 1,
    'SK실트론 N-Project WF동': 1,
    'SK하이닉스 M15 청주 반도체공장': 1,
    '가산디지털 데이터센터 신축공사': 1,
    '과천 지식정보타운 11-3블럭 신축공사 구조감리': 1,
    '과천 지식정보타운 11-3블럭 신축공사 구조분야': 1,
    '과천지식정보타운 11-18L 철골공사': 1,
    '과천지식정보타운 11-3블럭 신축공사 실시설계': 1,
    '기흥 NRD-K PJT UT동 현장 가설구대 구조검토 용역': 1,
    '남산스퀘어 리모델링 증축공사 / 24층 구조보강공사': 1,
    '대전 Infra 구축 Project 중\nPh-1 F-PSRC 및 TSC 공사': 1,
    '동해 LS 전선': 1,
    '두호 SK VIEW PRUGIO 하자보수 - 지하주차장 보 균열 보강공사 중 WIRE TENSION 보강공사 (WT+철판)': 1,
    '머크 바이오 대전공장 신축공사 설계용역': 1,
    '복합동 A,B': 1,
    '삼성바이오로직스 P3': 1,
    '삼성전기 세종 사업장 5공장 3층 중층 및 브릿지 추가 구조검토 용역': 1,
    '송도 롯데바이오(K1 PJT)\n기둥 제작납품': 1,
    '송도 싸토리우스 바이오소재\nEPC(Earlywork) 중 F-PSRC 설계 및 제작': 1,
    '송도 에디슨 프로젝트 P4 생산동': 1,
    '안산 성곡동 (SEL02) 데이터센터 실시설계': 1,
    '안산 성곡동(SEL02) 데이터센터': 1,
    '용인 Hynix Y1-PJT': 1,
    '울산 AIDC A동 \n신축공사 제작설치': 1,
    '인천지방합동청사 신축공사(T/K)설계용역': 1,
    '전략적 업무제휴 계약(공동연구)': 1,
    '천안 극판 M라인 \n신축공사 중 철골공사': 1,
    '청주 SK 하이닉스 M15X F02 4F X43~48, Y5~7 트러스데크 구조설계': 1,
    '청주 SK하이닉스  M15x 현장 PSRC 및 TSC': 1,
    '청주P&T7 신축공사': 1,
    '탕정 N-PJT': 1,
    '평촌 LG유플러스 2단계 데이터센터': 1,
    '평택 사무3동 철골공사 중 \nPSRC, TSC 제작납품': 1,
    '평택기술2동신축공사': 1,
    '하이닉스 M16 FAB/CUB': 1,
    '하이닉스 용인 CLUSTER 지원시설신축공사': 1
  };

  var MIN_ZOOM = 3.6, MAX_ZOOM = 18, CLUSTER_MAX_ZOOM = 16, CLUSTER_RADIUS = 46;
  /* 원이 나타나는 배율. 자동 병합을 껐으므로(행정구역 기준만 씀) 전국이
     한 화면에 들어오는 배율에서는 시/도 색칠 + 숫자만 맡고, 원은 조금 더
     확대했을 때부터 나옵니다. */
  var PROV_FADE = [8.2, 8.9], CLUST_FADE = [8.2, 8.9], AREA_SWAP = [11.5, 12.5];
  var HOME_BOUNDS = [[119.5, 31.5], [140.5, 43.5]];
  /* 처음 보이는 화면은 서울입니다. 전국 배율에서는 시/도 색칠과 숫자만
     나와서, 확대하면 시군구·현장까지 볼 수 있다는 걸 모르고 지나치기
     쉽습니다. 왼쪽 위 버튼으로 전국 화면으로 나갈 수 있습니다. */
  var START_BOUNDS = [[126.76, 37.42], [127.20, 37.70]];

  var esc = (SEN.util && SEN.util.esc) || function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  function fmt(n) { return Number(n).toLocaleString(); }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }

  var map = null, kgeo, kmapData, munis, popup = null;
  var elWrap, elBack, elLegendMax, elSide;
  var started = false;
  /* build() 안에서 정의되는 resettle()을 init()의 IntersectionObserver
     콜백에서도 부를 수 있도록 바깥으로 내보내는 자리(globe.js의
     _refresh/_focus와 같은 방식) */
  var _resettle = null;
  var pointCount = null;

  /* 이 칸(지도 팝업·오른쪽 패널)의 화면 문구입니다. content/downloads/
     projects.json을 읽지 않고 프로젝트 지도 데이터만 다루는 독립된
     모듈이라, 문구도 여기 직접 4개 언어로 채워 둡니다 — 하나라도
     비우면 SEN.i18n.t()가 한국어로 대신 채우기 때문입니다. */
  var UNIT_LABEL = { ko: '건', en: ' projects', zh: '件', ja: '件' };
  var UI = {
    thisArea:      { ko: '이 일대', en: 'This area', zh: '此区域', ja: 'この一帯' },
    mergedCount:   { ko: '구 {n}곳 합계', en: 'Combined across {n} districts', zh: '合计{n}个区', ja: '{n}区の合計' },
    clickForList:  { ko: '눌러서 프로젝트 목록 보기', en: 'Click to see the project list', zh: '点击查看项目列表', ja: 'クリックしてプロジェクト一覧を表示' },
    districtOnly:  { ko: '주소가 이 구역까지만 있습니다', en: 'Address known only down to this district', zh: '地址仅精确到该区', ja: '住所はこの区域までしか分かりません' },
    clickForDetail:{ ko: '눌러서 자세히', en: 'Click for details', zh: '点击查看详情', ja: 'クリックで詳細表示' },
    methodApplied: { ko: '{method} 공법 적용', en: '{method} method applied', zh: '应用{method}工法', ja: '{method}工法を適用' },
    patLine:       { ko: '특허공법(TSC·PSRC) {pat}건 · {pct}%', en: 'Patented methods (TSC/PSRC) {pat} projects · {pct}%', zh: '专利工法（TSC・PSRC）{pat}件 · {pct}%', ja: '特許工法（TSC・PSRC）{pat}件 · {pct}%' },
    cardsTitle:    { ko: '시/도별 실적', en: 'Results by province', zh: '各省市实绩', ja: '都道府県別実績' },
    cardsLead:     { ko: '카드를 누르면 지도가 그 지역으로 이동하고 시군구 실적이 열립니다 · 전체 <b>{n}건</b>', en: 'Click a card to move the map there and open district results · <b>{n} projects</b> in total', zh: '点击卡片可将地图移至该地区并展开市区县实绩 · 共<b>{n}件</b>', ja: 'カードを押すと地図がその地域へ移動し、市区町村別実績が開きます · 全体<b>{n}件</b>' },
    cardsFoot:     { ko: '막대는 시/도 간 실적 비교', en: 'Bars compare results across provinces', zh: '柱状条用于比较各省市实绩', ja: '棒グラフは都道府県間の実績比較です' },
    foldOpen:      { ko: '시/도별 실적 펼치기', en: 'Show results by province', zh: '展开各省市实绩', ja: '都道府県別実績を開く' },
    foldClose:     { ko: '시/도별 실적 접기', en: 'Hide results by province', zh: '收起各省市实绩', ja: '都道府県別実績を閉じる' },
    backToAll:     { ko: '← 시/도 전체', en: '← All provinces', zh: '← 全部省市', ja: '← 都道府県全体' },
    districtCount: { ko: '시군구 {n}곳', en: '{n} districts', zh: '{n}个市区县', ja: '{n}市区町村' },
    provFoot:      { ko: '시군구를 누르면 프로젝트 목록이 열립니다', en: 'Click a district to open its project list', zh: '点击市区县可展开项目列表', ja: '市区町村をクリックするとプロジェクト一覧が開きます' },
    emptyProjects: { ko: '표시할 프로젝트가 없습니다', en: 'No projects to display', zh: '暂无可显示的项目', ja: '表示できるプロジェクトがありません' },
    areaFoot:      { ko: '{n}건 · 담당자 등 내부 정보는 표시하지 않습니다', en: '{n} projects · Internal details such as staff names are not shown', zh: '{n}件 · 不显示负责人等内部信息', ja: '{n}件 · 担当者等の内部情報は表示しません' }
  };
  function tf(dict, vars) {
    var s = SEN.i18n.t(dict);
    if (vars) { for (var k in vars) { s = s.replace('{' + k + '}', vars[k]); } }
    return s;
  }

  /* 프로젝트 "구분"(구조설계·안전진단 등) 번역은 render.js의
     SEN.util.gubunLabel() 을 씁니다(해외 카드 패널도 같이 씀). */
  var gubunLabel = SEN.util.gubunLabel;

  /* 시/도·시/군/구 지명 번역 — assets/data/region_names_i18n.json(지도
     지명은 그대로 두고 오른쪽 패널에만 씁니다. 프로젝트명·주소는 원본
     데이터라 번역 대상이 아닙니다). 표에 없는 이름은 한국어 그대로
     보여줍니다(신규 지역이 추가돼도 화면이 깨지지 않도록). */
  var REGION_NAMES = {};
  function regionPart(ko) {
    if (!ko) return ko;
    var lang = SEN.i18n.get();
    if (lang === 'ko') return ko;
    var d = REGION_NAMES[ko];
    return d && d[lang] ? d[lang] : ko;
  }
  /* "서울특별시 강남구"처럼 시/도 + 시/군/구가 공백으로 이어진 전체
     이름을 통째로 번역합니다. */
  function regionFullName(full) {
    var toks = String(full || '').split(' ');
    if (toks.length < 2) return regionPart(toks[0]);
    return regionPart(toks[0]) + ' ' + regionPart(toks.slice(1).join(' '));
  }

  function applyPointCount() {
    var el = document.querySelector('[data-pmap-count]');
    if (el && pointCount != null) el.textContent = fmt(pointCount) + SEN.i18n.t(UNIT_LABEL);
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

  /* 세종은 하위에 구가 없는 단층제 자치시입니다. 자료에 '세종특별자치시'와
     '세종특별자치시 세종시'로 갈라져 들어와 있어 하나로 모읍니다. */
  var SEJONG = '세종특별자치시';
  function fixArea(a) {
    a = String(a || '');
    return a.indexOf(SEJONG) === 0 ? SEJONG : a;
  }
  /* 시/군/구를 끝내 알아내지 못한 건 — 목록에도 지도 원에도 넣지 않습니다.
     (세종은 구가 없는 것이지 모르는 게 아니므로 제외) */
  function isUnknownGu(a) {
    return !a || (String(a).split(' ').length < 2 && a !== SEJONG);
  }

  /* 원을 어느 단위로 묶을지 정합니다. 다른 시끼리는 절대 합치지 않습니다.
       서울특별시 강남구   -> 서울특별시 강남구   (광역시는 구가 곧 지역)
       경기도 수원시권선구 -> 경기도 수원시       (도의 시는 구를 합침)
       경기도 화성시       -> 경기도 화성시       (그대로) */
  function cityKeyOf(area) {
    var t = String(area || '').split(' ');
    var sido = t[0] || '', rest = t.slice(1).join('');
    if (!rest) return sido;
    if (/(특별시|광역시|특별자치시)$/.test(sido)) return sido + ' ' + rest;
    var i = rest.indexOf('시');
    if (i > 0 && i < rest.length - 1) return sido + ' ' + rest.slice(0, i + 1);
    return sido + ' ' + rest;
  }

  var SHORT_FIX = { 충청북: '충북', 충청남: '충남', 경상북: '경북', 경상남: '경남', 전라북: '전북', 전라남: '전남' };
  /* 화면에 보여줄 시/도 구분과 순서(2026 행정구역 명칭 기준). shorts = 데이터 안의 표기 */
  var PROVS = [
    { key: 'seoul',   label: '서울특별시',         shorts: ['서울'] },
    { key: 'busan',   label: '부산광역시',         shorts: ['부산'] },
    { key: 'daegu',   label: '대구광역시',         shorts: ['대구'] },
    { key: 'incheon', label: '인천광역시',         shorts: ['인천'] },
    { key: 'daejeon', label: '대전광역시',         shorts: ['대전'] },
    { key: 'ulsan',   label: '울산광역시',         shorts: ['울산'] },
    { key: 'sejong',  label: '세종특별자치시',     shorts: ['세종'] },
    { key: 'gg',      label: '경기도',             shorts: ['경기'] },
    { key: 'gw',      label: '강원특별자치도',     shorts: ['강원'] },
    { key: 'cb',      label: '충청북도',           shorts: ['충북'] },
    { key: 'cn',      label: '충청남도',           shorts: ['충남'] },
    { key: 'jb',      label: '전북특별자치도',     shorts: ['전북'] },
    { key: 'jn',      label: '전남광주통합특별시', shorts: ['전남', '광주'] },
    { key: 'gb',      label: '경상북도',           shorts: ['경북'] },
    { key: 'gn',      label: '경상남도',           shorts: ['경남'] },
    { key: 'jeju',    label: '제주특별자치도',     shorts: ['제주'] }
  ];
  var SHORT2KEY = {}; PROVS.forEach(function (p) { p.shorts.forEach(function (s) { SHORT2KEY[s] = p.key; }); });
  var PROV_BY_KEY = {}; PROVS.forEach(function (p) { PROV_BY_KEY[p.key] = p; });
  function shortProv(addr) {
    var s = (String(addr).split(' ')[0] || '').replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '');
    return SHORT_FIX[s] || s;
  }
  function methodOf(p) { return p.method || ''; }

  var PROV_AGG = {};   /* key -> {key,label,shorts,n,pat,areas:{name:{n,pat,items[],center,codes}},bounds} */

  function buildRegions(bucket) {
    var byCode = {};
    munis.features.forEach(function (f) { byCode[f.properties.code] = f; });

    var feats = [], labels = [], groups = {};
    Object.keys(bucket).forEach(function (k) {
      var b = bucket[k];
      if (!b.codes || !b.codes.length) return;
      if (b.prec === 'SIDO') return;

      var key = b.codes.slice().sort().join(',');
      if (!groups[key]) groups[key] = { codes: b.codes, n: 0, pat: 0, name: b.name, prec: b.prec, lng: b.lng, lat: b.lat };
      groups[key].n += b.n; groups[key].pat += b.pat;
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

      var props = { n: b.n, pat: b.pat, name: b.name, prec: b.prec };
      feats.push({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: rings }, properties: props });
      labels.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [b.lng, b.lat] }, properties: props });
    });
    return { poly: { type: 'FeatureCollection', features: feats },
             label: { type: 'FeatureCollection', features: labels } };
  }

  function styleSpec() {
    return {
      version: 8,
      glyphs: 'assets/fonts/{fontstack}/{range}.pbf',
      /* 배경 지도는 '글자 없는' 타일(light_nolabels)을 씁니다. 글자 있는
         타일(light_all)은 OSM 규칙대로 분쟁 지명을 여러 언어로 병기해
         동해 자리에 '日本海 / 동해' 가 함께 찍힙니다. 지명은 우리가
         한글로 따로 얹습니다(아래 buildProvLabels). */
      sources: {
        base: {
          type: 'raster',
          tiles: ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png',
                  'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png',
                  'https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png'],
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

  function patLine(n, pat) {
    if (!SHOW_PAT) return '';
    return '<br><span class="pp">' + esc(tf(UI.patLine, { pat: fmt(pat), pct: pct(pat, n) })) + '</span>';
  }

  var MX = 1;
  function build(byProvCount, byProvPat, exactFC, areaFC, regionFC) {
    var mx = 1;
    Object.keys(byProvCount).forEach(function (k) { if (byProvCount[k] > mx) mx = byProvCount[k]; });
    MX = mx;
    if (elLegendMax) elLegendMax.textContent = fmt(mx) + SEN.i18n.t(UNIT_LABEL);

    var fc = { type: 'FeatureCollection', features: kgeo.features.map(function (f) {
      var short = kmapData.prefix[f.properties.name] || f.properties.name;
      var key = SHORT2KEY[short], P = key && PROV_AGG[key];
      var n = byProvCount[short] || 0, pp = byProvPat[short] || 0;
      return { type: 'Feature', geometry: f.geometry,
               properties: { name: P ? P.label : f.properties.name, key: key || '', short: short,
                             n: P ? P.n : n, pat: P ? P.pat : 0, t: Math.pow(n / mx, 0.45) } };
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
    map.addLayer({ id: 'prov-n', type: 'symbol', source: 'prov', minzoom: 5.6, maxzoom: PROV_FADE[1],
      filter: ['>', ['get', 'n'], 0],
      layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 5.6, 11, 8, 15], 'text-allow-overlap': false },
      paint: { 'text-color': '#0b3b8f', 'text-halo-color': '#ffffff', 'text-halo-width': 2.5,
               'text-opacity': ['interpolate', ['linear'], ['zoom'], 5.6, 0, 6.2, 1, PROV_FADE[0], 1, PROV_FADE[1], 0] } });

    map.addSource('sites', { type: 'geojson', data: exactFC, cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM, clusterRadius: CLUSTER_RADIUS, clusterProperties: { pat: ['+', ['get', 'pat']] } });
    var fadeIn = ['interpolate', ['linear'], ['zoom'], AREA_SWAP[0], 0, AREA_SWAP[1], 1];
    map.addLayer({ id: 'cl', type: 'circle', source: 'sites', filter: ['has', 'point_count'], minzoom: AREA_SWAP[0],
      paint: {
        'circle-color': '#0071e3',
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], AREA_SWAP[0], 0, AREA_SWAP[1], 0.92],
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': fadeIn
      } });
    map.addLayer({ id: 'cl-n', type: 'symbol', source: 'sites', filter: ['has', 'point_count'], minzoom: AREA_SWAP[0],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'],
                'text-size': 12, 'text-allow-overlap': true },
      paint: { 'text-color': '#ffffff', 'text-opacity': fadeIn } });
    map.addLayer({ id: 'pt', type: 'circle', source: 'sites', filter: ['!', ['has', 'point_count']], minzoom: AREA_SWAP[0],
      paint: {
        'circle-color': SHOW_PAT ? ['case', ['>', ['get', 'pat'], 0], '#0071e3', '#8fb8ea'] : '#0071e3',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 18, 10],
        'circle-opacity': fadeIn,
        'circle-stroke-width': SHOW_PAT ? ['case', ['>', ['get', 'pat'], 0], 2.5, 1.5] : 1.5,
        'circle-stroke-color': SHOW_PAT ? ['case', ['>', ['get', 'pat'], 0], '#0b3b8f', '#ffffff'] : '#ffffff',
        'circle-stroke-opacity': fadeIn
      } });

    /* 묶기(cluster)를 쓰지 않습니다 — 화면상 거리로 합치면 '서울 + 광명 +
       안양' 같은 정체불명의 숫자가 생기기 때문입니다. areaFC는 이미
       cityKeyOf() 기준으로 다 묶여서 들어옵니다. */
    map.addSource('areas', { type: 'geojson', data: areaFC });
    var areaFade = ['interpolate', ['linear'], ['zoom'], CLUST_FADE[0], 0, CLUST_FADE[1], 1, AREA_SWAP[0], 1, AREA_SWAP[1], 0];
    var t = ['^', ['min', 1, ['/', ['get', 'n'], mx]], 0.45];
    var RAMP = ['interpolate', ['linear'], t, 0, '#c7ddf7', 0.35, '#93c5fd', 0.7, '#3b82f6', 1, '#1d4ed8'];
    map.addLayer({ id: 'ar', type: 'circle', source: 'areas', minzoom: CLUST_FADE[0], maxzoom: AREA_SWAP[1],
      paint: {
        'circle-color': RAMP,
        'circle-radius': ['step', ['get', 'n'], 15, 10, 20, 50, 26, 200, 33],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], CLUST_FADE[0], 0, CLUST_FADE[1], 0.94, AREA_SWAP[0], 0.94, AREA_SWAP[1], 0],
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': areaFade
      } });
    map.addLayer({ id: 'ar-n', type: 'symbol', source: 'areas', minzoom: CLUST_FADE[0], maxzoom: AREA_SWAP[1],
      layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'],
                'text-size': ['step', ['get', 'n'], 12, 50, 13, 200, 14], 'text-allow-overlap': true },
      paint: { 'text-color': ['case', ['<', t, 0.55], '#0b3b8f', '#ffffff'], 'text-opacity': areaFade } });

    var regionFade = ['interpolate', ['linear'], ['zoom'], AREA_SWAP[0], 0, AREA_SWAP[1], 1];
    map.addSource('regions', { type: 'geojson', data: regionFC.poly });
    map.addSource('regionlabels', { type: 'geojson', data: regionFC.label });
    map.addLayer({ id: 'rg-fill', type: 'fill', source: 'regions', minzoom: AREA_SWAP[0],
      paint: { 'fill-color': '#0071e3', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], AREA_SWAP[0], 0, AREA_SWAP[1], 0.07] } }, 'cl');
    map.addLayer({ id: 'rg-line', type: 'line', source: 'regions', minzoom: AREA_SWAP[0],
      paint: { 'line-color': '#0071e3', 'line-width': 1.6, 'line-dasharray': [3, 3],
               'line-opacity': ['interpolate', ['linear'], ['zoom'], AREA_SWAP[0], 0, AREA_SWAP[1], 0.5] } }, 'cl');
    map.addLayer({ id: 'rg-n', type: 'symbol', source: 'regionlabels', minzoom: AREA_SWAP[0],
      layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'], 'text-size': 14,
                'text-padding': 8, 'text-allow-overlap': false, 'text-ignore-placement': false },
      paint: { 'text-color': '#0b5fce', 'text-opacity': regionFade, 'text-halo-color': '#ffffff', 'text-halo-width': 2.5 } });

    wireEvents();
    map.resize();
    buildProvLabels();

    /* 첫 화면(서울)로 맞춥니다. 지도가 숨겨진 탭 안에 있거나 아직 폭이
       잡히지 않았을 때 fitBounds를 부르면 조용히 무시되므로, 크기가
       생기는 첫 순간에 한 번 더 맞춰 줍니다. */
    var didStart = false, userMoved = false;
    /* fitBounds를 마지막으로 맞췄을 때 기준으로 삼은 칸 크기 — 이후 이
       크기와 실제로 달라지면(4px 넘게) 다시 맞춰야 한다는 뜻입니다. */
    var settledW = 0, settledH = 0;
    /* ensureStart()는 칸 폭이 50px만 넘으면(=아직 최종 폭이 아닐 수
       있음) 바로 fitBounds를 해버립니다 — 제목·리드문 줄바꿈, 웹폰트
       로딩 등으로 그 뒤에도 레이아웃이 계속 자리를 잡는 동안, 칸 크기
       자체는 ResizeObserver가 따라가 줘도 fitBounds는 다시 안 해서,
       좁을 때 기준으로 맞춘 화면이 넓어진 칸에 그대로 늘어나 보이거나
       (헤더가 가린 만큼 잘려 보이는 것처럼) 남는 자리가 생겼습니다.
       resettle()이 그 보정을 맡습니다 — 아래 두 군데에서 부릅니다:
       ① 초기 몇 초 동안 정해진 시각마다, ② 이 구역이 화면에 실제로
       걸칠 때마다(IntersectionObserver, init() 참고) — 사용자가 스크롤로
       한참 뒤에야 이 구역에 도달해도(=위 ①의 짧은 시간 안에 크기가 아직
       안 바뀐 채였어도) 그 시점에 다시 확인해 바로잡습니다. 단, 사용자가
       한 번이라도 직접 드래그·확대/축소했으면 그 뒤로는 절대 화면을
       되돌리지 않습니다(userMoved). */
    function resettle() {
      if (!map || userMoved) return;
      var c = map.getContainer();
      if (c.clientWidth < 50 || c.clientHeight < 50) return;
      if (Math.abs(c.clientWidth - settledW) > 4 || Math.abs(c.clientHeight - settledH) > 4) {
        settledW = c.clientWidth; settledH = c.clientHeight;
        map.resize();
        map.fitBounds(START_BOUNDS, { padding: 30, duration: 0 });
      } else {
        map.resize();
      }
    }
    _resettle = resettle;
    map.on('dragstart', function (e) { if (e.originalEvent) userMoved = true; });
    map.on('zoomstart', function (e) { if (e.originalEvent) userMoved = true; });
    function ensureStart() {
      if (didStart) return;
      var c = map.getContainer();
      if (c.clientWidth < 50 || c.clientHeight < 50) return;
      didStart = true;
      settledW = c.clientWidth; settledH = c.clientHeight;
      map.resize();
      map.fitBounds(START_BOUNDS, { padding: 30, duration: 0 });
      if (elBack) elBack.hidden = false;
      [200, 600, 1500, 3000].forEach(function (delay) { setTimeout(resettle, delay); });
    }
    ensureStart();
    if (!didStart) {
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(function () { ensureStart(); if (didStart) ro.disconnect(); });
        ro.observe(map.getContainer());
      } else {
        var tid = setInterval(function () { ensureStart(); if (didStart) clearInterval(tid); }, 250);
        setTimeout(function () { clearInterval(tid); }, 15000);
      }
    }
  }

  /* ---------- 시/도 이름(한글) — HTML 오버레이 ----------
     MapLibre로 한글을 그리려면 글꼴 파일이 수십 장 필요하므로, 이름은
     HTML로 얹습니다. 위치는 시/도 폴리곤 중 가장 큰 조각의 중심. */
  var provLabelEls = [];
  function buildProvLabels() {
    if (!elWrap) return;
    var seen = {};
    kgeo.features.forEach(function (f) {
      var short = kmapData.prefix[f.properties.name] || f.properties.name, key = SHORT2KEY[short];
      if (!key || seen[key]) return;
      var P = PROV_BY_KEY[key];
      if (P.shorts.length > 1 && short !== P.shorts[0]) return;   /* 통합 그룹(전남광주)은 한 번만 */
      seen[key] = 1;
      var c = featureCenter(f); if (!c) return;
      var el = document.createElement('div');
      el.className = 'pmap__label';
      el.textContent = P.label.replace(/(특별시|광역시|특별자치시|특별자치도|통합특별시)$/, '').replace(/^전남광주$/, '전남·광주');
      var metro = { seoul: 1, incheon: 1, daejeon: 1, ulsan: 1, sejong: 1, daegu: 1 };
      elWrap.appendChild(el);
      provLabelEls.push({ el: el, lnglat: c, minz: metro[key] ? 6.0 : 0 });
    });
    [['동해', [131.2, 38.2]], ['서해', [124.6, 36.2]], ['남해', [128.0, 33.9]]].forEach(function (s) {
      var el = document.createElement('div');
      el.className = 'pmap__label pmap__label--sea';
      el.textContent = s[0];
      elWrap.appendChild(el);
      provLabelEls.push({ el: el, lnglat: s[1] });
    });
    map.on('move', placeProvLabels); map.on('zoom', placeProvLabels); map.on('resize', placeProvLabels);
    placeProvLabels();
  }
  function placeProvLabels() {
    var z = map.getZoom(), vis = z < CLUST_FADE[0] + 0.3;
    var w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
    provLabelEls.forEach(function (o) {
      var p = map.project(o.lnglat);
      var show = vis && z >= (o.minz || 0) && p.x > 0 && p.x < w && p.y > 0 && p.y < h;
      o.el.style.display = show ? '' : 'none';
      if (!show) return;
      o.el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-50%)';
      o.el.style.opacity = z < 5.2 ? 0.75 : 1;
    });
  }

  function wireEvents() {
    var GL = window.maplibregl;
    function areaShown() { return map.getZoom() >= CLUST_FADE[0] && map.getZoom() < AREA_SWAP[1]; }
    function shown() { return map.getZoom() >= AREA_SWAP[0]; }
    function pop(ll, html, off) {
      if (popup) popup.remove();
      popup = new GL.Popup({ offset: off || 12, closeButton: false, closeOnClick: false }).setLngLat(ll).setHTML(html).addTo(map);
    }
    function unpop() { if (popup) { popup.remove(); popup = null; } }

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
      pop(e.features[0].geometry.coordinates, '<strong>' + esc(p.name || p.addr) + '</strong>' +
        ((SHOW_PAT && p.method) ? '<br><span class="pp">' + esc(tf(UI.methodApplied, { method: p.method })) + '</span>' : '') +
        '<br>' + (p.year ? p.year + ' · ' : '') + esc(p.addr));
    });
    map.on('mouseenter', 'ar', function (e) {
      if (!areaShown()) return;
      var f = e.features[0], p = f.properties;
      pop(f.geometry.coordinates, '<strong>' + esc(p.name || tf(UI.thisArea)) + ' ' + fmt(p.n) + esc(SEN.i18n.t(UNIT_LABEL)) + '</strong>' + patLine(p.n, p.pat) +
        (p.nsub > 1 ? '<br>' + esc(tf(UI.mergedCount, { n: p.nsub })) : '') + '<br>' + esc(tf(UI.clickForList)), 16);
    });
    map.on('mouseleave', 'ar', unpop);
    map.on('mousemove', 'rg-fill', function (e) {
      if (map.getZoom() < AREA_SWAP[0]) return;
      var best = e.features[0];
      for (var i = 1; i < e.features.length; i++) { if (e.features[i].properties.prec === 'SIGUNGU') { best = e.features[i]; break; } }
      var p = best.properties;
      map.getCanvas().style.cursor = 'help';
      pop(e.lngLat, '<strong>' + esc(p.name) + ' ' + fmt(p.n) + esc(SEN.i18n.t(UNIT_LABEL)) + '</strong>' + patLine(p.n, p.pat) + '<br>' + esc(tf(UI.districtOnly)), 8);
    });
    map.on('mouseleave', 'rg-fill', function () { map.getCanvas().style.cursor = ''; unpop(); });
    map.on('click', 'ar', function (e) {
      if (!areaShown()) return;
      var p = e.features[0].properties;
      if (p.one) { openArea(p.one); return; }               /* 시군구 하나면 그 목록으로 */
      var key = SHORT2KEY[shortProv(p.name)];                /* 구가 여럿이면 시/도 목록으로 */
      if (key) { openProv(key); flyToProv(key); }
    });
    map.on('click', 'rg-fill', function (e) {
      if (map.getZoom() < AREA_SWAP[0]) return;
      var best = e.features[0];
      for (var i = 1; i < e.features.length; i++) { if (e.features[i].properties.prec === 'SIGUNGU') { best = e.features[i]; break; } }
      openArea(best.properties.name);
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
      pop(f.geometry.coordinates, '<strong>' + fmt(f.properties.point_count) + esc(SEN.i18n.t(UNIT_LABEL)) + '</strong>' + patLine(f.properties.point_count, f.properties.pat) + '<br>' + esc(tf(UI.clickForDetail)), 16);
    });
    map.on('mouseleave', 'cl', unpop);
    map.on('mousemove', 'prov-fill', function (e) {
      if (map.getZoom() >= CLUST_FADE[0]) return;
      var p = e.features[0].properties;
      map.getCanvas().style.cursor = 'pointer';
      pop(e.lngLat, '<strong>' + esc(p.name) + '</strong><br>' + fmt(p.n) + esc(SEN.i18n.t(UNIT_LABEL)) + patLine(p.n, p.pat) + '<br>' + esc(tf(UI.clickForList)), 8);
    });
    map.on('mouseleave', 'prov-fill', function () { map.getCanvas().style.cursor = ''; unpop(); });
    map.on('click', 'prov-fill', function (e) {
      if (map.getZoom() >= CLUST_FADE[0]) return;
      var k = e.features[0].properties.key;
      if (k) { openProv(k); flyToProv(k); }
    });
    /* 전국 화면일 때만 버튼을 숨깁니다(그 화면에서는 누를 이유가 없으므로) */
    map.on('moveend', function () { if (elBack) elBack.hidden = map.getZoom() < 6.4; });
    if (elBack) {
      elBack.addEventListener('click', function () { unpop(); map.fitBounds(HOME_BOUNDS, { padding: 24, duration: 700 }); });
    }
  }

  /* ================= 오른쪽 패널 ================= */
  function provRows() { return PROVS.map(function (p) { return PROV_AGG[p.key]; }); }   /* 고정 순서 */

  function flyToProv(key) {
    var P = PROV_AGG[key]; if (!P || !P.bounds || !map) return;
    map.fitBounds(P.bounds, { padding: { top: 40, bottom: 40, left: 40, right: 40 }, maxZoom: 9.6, duration: 800 });
  }

  /* 좁은 화면에서는 시/도 17개가 세로로 쭉 늘어서 화면을 다 잡아먹기에
     이 목록을 +/- 버튼으로 여닫고, 처음에는 접어 둡니다. 접힘 여부는
     여닫는 CSS와 함께 640px 이하에서만 뜻이 있고(components.css의
     .panel.is-foldable), 데스크톱에서는 버튼이 감춰져 늘 펼친 그대로입니다.
     한 번 펼쳐 두면 시/도 → 시군구로 들어갔다 "← 시/도 전체"로 돌아와도
     펼친 채로 남도록, 상태를 이 변수에 기억합니다. */
  var cardsFolded = true;

  function renderCards() {
    if (!elSide) return;
    pState.view = 'cards'; pState.prov = null; pState.area = null;
    var rows = provRows(), maxN = rows.reduce(function (m, r) { return Math.max(m, r.n); }, 1);
    var totN = 0; rows.forEach(function (r) { totN += r.n; });
    var title = tf(UI.cardsTitle);
    var lead = tf(UI.cardsLead, { n: fmt(totN) });
    elSide.innerHTML = '<div class="panel is-foldable' + (cardsFolded ? ' is-folded' : '') + '">' +
      '<div class="panel__head panel__head--tight panel__head--fold"><div class="panel__title">' + esc(title) + '</div>' +
      '<button type="button" class="panel__fold" data-panel-fold aria-expanded="' + (cardsFolded ? 'false' : 'true') + '" ' +
        'aria-label="' + esc(tf(cardsFolded ? UI.foldOpen : UI.foldClose)) + '">' +
        '<span class="panel__fold-sign" aria-hidden="true">' + (cardsFolded ? '+' : '−') + '</span></button>' +
      '<div class="panel__sub">' + lead + '</div></div>' +
      '<div class="panel__body"><div class="prov-cards">' + rows.map(function (r) {
        return '<button type="button" class="prov-card" data-prov="' + r.key + '">' +
          '<span class="prov-card__nm">' + esc(regionPart(r.label)) + '</span>' +
          '<span class="prov-card__n">' + fmt(r.n) + '<small>' + esc(SEN.i18n.t(UNIT_LABEL)) + '</small></span>' +
          '<span class="prov-card__bar"><i style="width:' + Math.max(2, Math.round(r.n / maxN * 100)) + '%"></i></span></button>';
      }).join('') + '</div></div>' +
      '<div class="panel__foot"><span class="panel__lgd">' + esc(tf(UI.cardsFoot)) + '</span></div></div>';
    elSide.querySelectorAll('[data-prov]').forEach(function (b) {
      b.addEventListener('click', function () { var k = b.getAttribute('data-prov'); openProv(k); flyToProv(k); });
    });
    var pnl = elSide.querySelector('.panel'), fld = elSide.querySelector('[data-panel-fold]');
    if (fld) fld.addEventListener('click', function () {
      cardsFolded = pnl.classList.toggle('is-folded');
      fld.setAttribute('aria-expanded', cardsFolded ? 'false' : 'true');
      fld.setAttribute('aria-label', tf(cardsFolded ? UI.foldOpen : UI.foldClose));
      fld.querySelector('.panel__fold-sign').textContent = cardsFolded ? '+' : '−';
    });
  }

  var pState = { view: 'cards', prov: null, area: null };

  function headHTML(crumbs, title, n, sub) {
    return '<div class="panel__head"><div class="panel__crumb">' + crumbs + '</div><div class="panel__title">' + esc(title) + '</div>' +
      '<div class="panel__big">' + fmt(n) + '<small>' + esc(SEN.i18n.t(UNIT_LABEL)) + (sub ? ' · ' + esc(sub) : '') + '</small></div></div>';
  }

  function openProv(key) {
    if (!elSide) return;
    var P = PROV_AGG[key]; if (!P) return;
    pState.view = 'prov'; pState.prov = key; pState.area = null;
    var areas = Object.keys(P.areas).map(function (k) { return P.areas[k]; }).sort(function (a, b) { return b.n - a.n; });
    var maxN = areas.reduce(function (m, a) { return Math.max(m, a.n); }, 1);
    elSide.innerHTML = '<div class="panel">' +
      headHTML('<button type="button" data-back-rank>' + esc(tf(UI.backToAll)) + '</button><span class="panel__sep">›</span><span class="panel__cur">' + esc(regionPart(P.label)) + '</span>', regionPart(P.label), P.n, tf(UI.districtCount, { n: areas.length })) +
      '<div class="panel__body">' + areas.map(function (a) {
        var rest = a.name.split(' ').slice(1).join(' ');
        var nm = regionPart(rest ? rest : a.name);   /* 세종처럼 구가 없는 시는 이름을 그대로 씁니다 */
        if (rest && P.shorts.length > 1) nm = regionPart(shortProv(a.name)) + ' ' + nm;   /* 통합 표기(전남+광주) 구분용 */
        return '<div class="arow" data-area="' + esc(a.name) + '"><span class="arow__nm">' + esc(nm) + '</span>' +
          '<span class="arow__ct"><b>' + fmt(a.n) + '</b>' + esc(SEN.i18n.t(UNIT_LABEL)) + '</span>' +
          '<span class="arow__bar"><i style="width:' + Math.max(2, Math.round(a.n / maxN * 100)) + '%"></i></span></div>';
      }).join('') + '</div><div class="panel__foot">' + esc(tf(UI.provFoot)) + '</div></div>';
    var panel = elSide.querySelector('.panel');
    panel.querySelector('[data-back-rank]').addEventListener('click', function () { renderCards(); map.fitBounds(HOME_BOUNDS, { padding: 24, duration: 700 }); });
    panel.querySelectorAll('[data-area]').forEach(function (el) {
      el.addEventListener('click', function () { openArea(el.getAttribute('data-area')); });
    });
  }

  function openArea(areaFull, skipFly) {
    if (!elSide) return;
    var key = SHORT2KEY[shortProv(areaFull)], P = key && PROV_AGG[key], A = P && P.areas[areaFull];
    if (!A) {
      /* 이름이 다르게 들어온 경우 모든 시/도에서 찾아봅니다 */
      Object.keys(PROV_AGG).some(function (k) {
        if (PROV_AGG[k].areas[areaFull]) { key = k; P = PROV_AGG[k]; A = P.areas[areaFull]; return true; }
        return false;
      });
    }
    if (!A) return;
    pState.view = 'area'; pState.prov = key; pState.area = areaFull;
    var nm = regionPart(areaFull.split(' ').slice(1).join(' ') || areaFull);
    elSide.innerHTML = '<div class="panel">' +
      headHTML('<button type="button" data-back-rank>' + esc(tf(UI.backToAll)) + '</button><span class="panel__sep">›</span>' +
        '<button type="button" data-back-prov>' + esc(regionPart(P.label)) + '</button><span class="panel__sep">›</span><span class="panel__cur">' + esc(nm) + '</span>',
        regionFullName(areaFull), A.n, null) +
      '<div class="panel__body">' + A.items.slice().sort(function (a, b) { return (b.year || 0) - (a.year || 0); }).map(function (it) {
        return '<div class="prow"><div class="prow__nm">' + esc(it.name || it.addr) +
          (LOGO_NAMES[it.name] ? '<img class="prow__logo" src="assets/img/project-logo-mark.png" alt="" width="14" height="14">' : '') +
          ((SHOW_PAT && it.method) ? '<span class="pmap-chip' + (it.method === 'TSC' ? ' is-tsc' : '') + '">' + esc(it.method) + '</span>' : '') + '</div>' +
          '<div class="prow__kd">' + (it.year ? it.year + ' · ' : '') + esc(gubunLabel(it.gubun)) + (it.addr ? ' · ' + esc(it.addr) : '') + '</div></div>';
      }).join('') + (A.items.length ? '' : '<div class="panel__empty">' + esc(tf(UI.emptyProjects)) + '</div>') + '</div>' +
      '<div class="panel__foot">' + esc(tf(UI.areaFoot, { n: fmt(A.items.length) })) + '</div></div>';
    var panel = elSide.querySelector('.panel');
    panel.querySelector('[data-back-rank]').addEventListener('click', function () { renderCards(); map.fitBounds(HOME_BOUNDS, { padding: 24, duration: 700 }); });
    panel.querySelector('[data-back-prov]').addEventListener('click', function () { openProv(key); flyToProv(key); });
    var c = A.center;
    if (!skipFly && c && map) map.easeTo({ center: c, zoom: Math.max(map.getZoom(), 9.5), duration: 700 });
  }

  /* ---------- 진입점 ----------
     els: { wrap, canvas, back, legendMax, side } */
  function init(els) {
    if (started) return;   // 언어 전환 등으로 다시 불려도 중복 초기화 안 함
    if (!window.maplibregl) { if (els.wrap) els.wrap.classList.add('is-unavailable'); return; }
    started = true;
    elWrap = els.wrap; elBack = els.back; elLegendMax = els.legendMax; elSide = els.side;

    Promise.all([
      getJSON('assets/data/kgeo.json'),
      getJSON('assets/data/kmap.json'),
      getJSON('assets/data/project_points.json'),
      getJSON('assets/data/munis.json'),
      getJSON('assets/data/region_names_i18n.json').catch(function () { return {}; })
    ]).then(function (res) {
      kgeo = res[0]; kmapData = res[1]; munis = res[3]; REGION_NAMES = res[4] || {};
      var raw = res[2];

      /* 표시 그룹 초기화 + 지도 이동용 경계(가장 큰 조각 기준 — 먼 섬으로
         화면이 늘어나지 않게) */
      PROV_AGG = {};
      PROVS.forEach(function (p) { PROV_AGG[p.key] = { key: p.key, label: p.label, shorts: p.shorts, n: 0, pat: 0, areas: {}, bounds: null }; });
      function ringBounds(ring) {
        var b = [[Infinity, Infinity], [-Infinity, -Infinity]];
        ring.forEach(function (c) {
          if (c[0] < b[0][0]) b[0][0] = c[0]; if (c[1] < b[0][1]) b[0][1] = c[1];
          if (c[0] > b[1][0]) b[1][0] = c[0]; if (c[1] > b[1][1]) b[1][1] = c[1];
        });
        return b;
      }
      kgeo.features.forEach(function (f) {
        var short = kmapData.prefix[f.properties.name] || f.properties.name, key = SHORT2KEY[short];
        if (!key) return;
        var polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
        var best = null, bestA = 0;
        polys.forEach(function (p) { var c = ringCentroid(p[0]); if (c && c[2] > bestA) { bestA = c[2]; best = p[0]; } });
        if (!best) return;
        var b = ringBounds(best), P = PROV_AGG[key];
        if (!P.bounds) P.bounds = b;
        else P.bounds = [[Math.min(P.bounds[0][0], b[0][0]), Math.min(P.bounds[0][1], b[0][1])],
                         [Math.max(P.bounds[1][0], b[1][0]), Math.max(P.bounds[1][1], b[1][1])]];
      });

      var cnt = {}, cntPat = {}, exactFeats = [], bucket = {}, areaBucket = {}, skipped = 0;
      raw.points.forEach(function (p) {
        var aname = fixArea(p.area || areaName(p.addr));
        /* 시/군/구를 끝내 못 찾은 건은 지도·목록·시도 합계 어디에도 넣지
           않습니다. 원본 주소가 보완되어 좌표 파일이 갱신되면 저절로
           살아납니다. */
        if (isUnknownGu(aname)) { skipped++; return; }
        var method = methodOf(p), isP = method ? 1 : 0;
        var short = shortProv(p.area || p.addr);
        if (short) { cnt[short] = (cnt[short] || 0) + 1; cntPat[short] = (cntPat[short] || 0) + isP; }
        var key = SHORT2KEY[short];
        if (key) {
          var PA = PROV_AGG[key]; PA.n++; PA.pat += isP;
          if (!PA.areas[aname]) PA.areas[aname] = { name: aname, n: 0, pat: 0, items: [], center: null, codes: p.codes || [] };
          PA.areas[aname].n++; PA.areas[aname].pat += isP;
          PA.areas[aname].items.push({ name: p.name, addr: p.addr, year: p.year, gubun: p.gubun, kind: p.kind, prec: p.prec, method: method });
        }
        /* 원은 행정구역 기준으로만 묶습니다 — 다른 시끼리 합쳐지지 않도록 */
        var codes = p.codes || [];
        var akey = cityKeyOf(aname);
        if (!areaBucket[akey]) areaBucket[akey] = { codes: [], n: 0, pat: 0, name: akey, fbLng: p.lng, fbLat: p.lat, areas: {} };
        var AB = areaBucket[akey]; AB.n += 1; AB.pat += isP; AB.areas[aname] = 1;
        codes.forEach(function (c) { if (AB.codes.indexOf(c) < 0) AB.codes.push(c); });

        if (EXACT[p.prec]) {
          exactFeats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
                             properties: { name: p.name, addr: p.addr, year: p.year, prec: p.prec, kind: p.kind, method: method, pat: isP } });
          return;
        }
        var bkey = p.lng.toFixed(5) + ',' + p.lat.toFixed(5);
        if (!bucket[bkey]) bucket[bkey] = { lng: p.lng, lat: p.lat, n: 0, pat: 0, prec: p.prec, name: aname, codes: codes };
        bucket[bkey].n += 1; bucket[bkey].pat += isP;
      });

      var exactFC = { type: 'FeatureCollection', features: exactFeats };
      var areaFC = { type: 'FeatureCollection', features: Object.keys(areaBucket).map(function (k) {
        var b = areaBucket[k], c = codesCenter(b.codes), list = Object.keys(b.areas);
        return { type: 'Feature', geometry: { type: 'Point', coordinates: c || [b.fbLng, b.fbLat] },
                 properties: { n: b.n, pat: b.pat, name: b.name, one: list.length === 1 ? list[0] : '', nsub: list.length } };
      }) };
      Object.keys(PROV_AGG).forEach(function (s) {
        Object.keys(PROV_AGG[s].areas).forEach(function (a) { var A = PROV_AGG[s].areas[a]; A.center = codesCenter(A.codes); });
      });
      var regionFC = buildRegions(bucket);

      /* 화면의 모든 숫자가 서로 맞도록, 지도에 올린 건수를 기준으로 씁니다.
         (시/군/구를 못 찾아 제외한 건은 좌표 파일이 보완되면 저절로 합쳐집니다) */
      pointCount = raw.points.length - skipped;
      applyPointCount();

      renderCards();

      map = new window.maplibregl.Map({
        container: els.canvas, style: styleSpec(),
        center: [129.5, 37.5], zoom: 5.2,
        minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, attributionControl: true,
        /* 모바일에서 손가락 한 개로 페이지를 스크롤하려다 지도가 먼저
           반응해 버리는 문제 — 두 손가락으로만 지도를 조작하게 하고,
           한 손가락 터치는 그대로 페이지 스크롤로 넘어가게 합니다. */
        cooperativeGestures: true,
        locale: {
          'CooperativeGesturesHandler.MobileHelpText': '두 손가락으로 지도를 움직일 수 있어요',
          'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + 스크롤로 지도를 확대/축소할 수 있어요',
          'CooperativeGesturesHandler.MacHelpText': '⌘ + 스크롤로 지도를 확대/축소할 수 있어요'
        }
      });
      map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', function () { build(cnt, cntPat, exactFC, areaFC, regionFC); });

      /* MapLibre는 창(window) 크기 변화만 자동으로 따라갑니다. 이 칸의
         높이(.pmap)는 제목·리드문 줄바꿈, 웹폰트 로딩, 헤더가 나타나는
         시점 등으로 창 크기와 상관없이 나중에 바뀔 수 있는데, 그럴 때
         캔버스가 못 따라가면 지도가 칸을 다 못 채우고(헤더가 가린
         만큼 잘려 보이는 것처럼) 남는 자리에 자리표시가 그대로 비쳐
         보였습니다. 칸 자체를 감시해서 크기가 바뀔 때마다 다시
         맞춥니다 — resize()를 ResizeObserver 콜백 안에서 바로 부르면
         드물게 이번 프레임에 반영이 안 되는 경우가 있어(레이아웃이 막
         끝난 시점과 겹칠 때), 다음 프레임으로 한 번 미룹니다. */
      if (window.ResizeObserver && els.wrap) {
        new ResizeObserver(function () {
          requestAnimationFrame(function () { if (map) map.resize(); });
        }).observe(els.wrap);
      }
      /* 위 감시가 크기 변화를 놓치는 경우에 대비한 안전장치 — 지도가
         생긴 직후 몇 초 동안은 한 번 더 확인해서 맞춥니다. 첫 화면
         맞추기(build() 안의 ensureStart)는 지도 타일이 다 뜬 뒤(load)
         에만 하지만, 이 칸 크기 자체는 그보다 먼저 안정되므로 여기서는
         load를 기다리지 않습니다. */
      [300, 800, 1800, 3500].forEach(function (delay) {
        setTimeout(function () { if (map) map.resize(); }, delay);
      });

      /* 이 칸이 브라우저 창보다 커서 한 화면에 다 안 들어오면, 화면 밖으로
         벗어난 부분은 브라우저가 캔버스를 실제로 안 그려 둡니다(성능
         최적화) — 스크롤로 그 부분이 새로 화면에 들어와도 "다시 그려라"
         신호가 없으면 계속 비어 있습니다. 화면에 조금이라도 걸쳐 있는
         동안은 스크롤할 때마다 계속 다시 그리게 합니다. */
      var pmapInView = false;
      function repaintIfVisible() {
        if (!pmapInView) return;
        if (_resettle) _resettle(); else if (map) map.resize();
        map.triggerRepaint();
      }
      if (window.IntersectionObserver && els.wrap) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            pmapInView = e.isIntersecting;
            if (pmapInView) repaintIfVisible();
          });
        }, { threshold: 0 }).observe(els.wrap);
      } else {
        pmapInView = true;
      }
      /* map.resize()는 매 스크롤 프레임마다 부르기엔 무거운 작업이라
         모바일에서 이 구역을 지나칠 때 스크롤이 버벅이는 원인이었습니다
         — 화면에 "새로" 걸쳐질 때만 resize까지 하고, 스크롤 도중에는
         가벼운 triggerRepaint()만 부릅니다. */
      var repaintTicking = false;
      addEventListener('scroll', function () {
        if (!pmapInView || repaintTicking) return;
        repaintTicking = true;
        requestAnimationFrame(function () { repaintTicking = false; map.triggerRepaint(); });
      }, { passive: true });
    }).catch(function (err) {
      console.warn('[SEN] 프로젝트 지도를 불러오지 못했습니다:', err && err.message);
      if (els.wrap) els.wrap.classList.add('is-unavailable');
    });
  }

  /* 탭을 국외→국내로 되돌아왔을 때, 그 사이 화면 폭이 바뀌었을 수 있으니
     캔버스 크기를 다시 맞춥니다(globe.js의 refresh()와 같은 이유). 언어를
     바꿨을 때도 이 함수가 불리므로, 화면에 남아 있는 문구(범례 최댓값,
     오른쪽 패널)도 지금 보고 있던 자리 그대로 다시 그립니다 — openArea만
     지도 이동(easeTo)을 같이 하길래 skipFly로 그 부분만 막았습니다. */
  function refresh() {
    if (map) map.resize();
    applyPointCount();
    if (elLegendMax && MX != null) elLegendMax.textContent = fmt(MX) + SEN.i18n.t(UNIT_LABEL);
    if (elSide) {
      if (pState.view === 'area' && pState.area) openArea(pState.area, true);
      else if (pState.view === 'prov' && pState.prov) openProv(pState.prov);
      else renderCards();
    }
  }

  SEN.projectMap = { init: init, refresh: refresh };
})(window.SEN);
