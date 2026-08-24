/* ==========================================================================
   overseasmap.js — 해외 실적 카드(국가별) + 연도별 구조설계·안전진단 건수

   assets/data/overseas_projects.json(연도·구분·나라 목록, 해외 프로젝트
   목록.md 기반)을 읽어 나라별로 묶습니다. 국내 지도(assets/js/
   projectmap.js)의 시/도 카드 → 시/군/구 목록과 같은 모양의 패널을
   쓰되, 여기서는 카드가 "나라"이고 그 안은 시/군/구 대신 "연도"입니다.
   카드를 고르면 오른쪽 지구본(assets/js/globe.js)도 그 나라 쪽으로
   돌아갑니다.

   이 목록은 지구본의 점·라벨(assets/js/globe.js, content/downloads/
   projects.json 의 주소 목록 기반)과는 서로 다른, 별도의 실적
   집계입니다 — 지구본 점은 "어디서 했는지"를, 이 카드는 "몇 건을
   언제·어떤 구분으로 했는지"를 보여줍니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var DATA_URL = 'assets/data/overseas_projects.json';
  var esc = SEN.util.esc;
  var gubunLabel = SEN.util.gubunLabel;
  function fmt(n) { return Number(n).toLocaleString(); }

  /* 이 카드 전용 문구입니다(국내 지도의 UI 사전과 같은 방식) — 4개
     언어를 다 채워 두지 않으면 SEN.i18n.t()가 한국어로 대신 채웁니다. */
  var UNIT_LABEL = { ko: '건', en: ' projects', zh: '件', ja: '件' };
  var UI = {
    cardsTitle: { ko: '국가별 실적', en: 'Results by Country', zh: '各国实绩', ja: '国別実績' },
    cardsLead: { ko: '카드를 누르면 지구본이 그 나라로 움직이고 연도별 실적이 열립니다 · 전체 <b>{n}건</b>', en: 'Click a card to turn the globe there and open yearly results · <b>{n} projects</b> in total', zh: '点击卡片后地球仪会转向该国并展开年度实绩 · 共<b>{n}件</b>', ja: 'カードを押すと地球儀がその国へ動き、年度別実績が開きます · 全体<b>{n}件</b>' },
    cardsFoot: { ko: '막대는 국가 간 실적 비교', en: 'Bars compare results across countries', zh: '柱状条用于比较各国实绩', ja: '棒グラフは国別の実績比較です' },
    foldOpen: { ko: '국가별 실적 펼치기', en: 'Show results by country', zh: '展开各国实绩', ja: '国別実績を開く' },
    foldClose: { ko: '국가별 실적 접기', en: 'Hide results by country', zh: '收起各国实绩', ja: '国別実績を閉じる' },
    backToAll: { ko: '← 국가 전체', en: '← All countries', zh: '← 全部国家', ja: '← 国全体' },
    countryFoot: { ko: '연도별 구조설계·안전진단 건수', en: 'Structural design and safety diagnosis counts by year', zh: '按年度显示结构设计与安全诊断件数', ja: '年度別の構造設計・安全診断件数' },
    patNote:     { ko: '이 로고는 특허공법(TSC·PSRC)이 적용된 프로젝트임을 나타냅니다', en: 'This logo marks a project built with a patented method (TSC/PSRC)', zh: '此徽标表示采用了专利工法（TSC・PSRC）的项目', ja: 'このロゴは特許工法（TSC・PSRC）が適用されたプロジェクトを示します' }
  };
  function tf(dict, vars) {
    var s = SEN.i18n.t(dict);
    if (vars) { for (var k in vars) { s = s.replace('{' + k + '}', vars[k]); } }
    return s;
  }

  /* 나라 이름 번역 + 지구본에 띄울 좌표(수도 기준). 지도 데이터(geo.json)
     의 해외 좌표와는 별개입니다 — 그쪽은 도시 단위로 뒤섞여 있어(예:
     "필리핀 마닐라"), 나라를 대표하는 좌표로 새로 정리했습니다. */
  var COUNTRIES = {
    '싱가포르':   { en: 'Singapore',      zh: '新加坡',     ja: 'シンガポール', lat: 1.3521,   lng: 103.8198 },
    '태국':       { en: 'Thailand',       zh: '泰国',       ja: 'タイ',         lat: 13.7563,  lng: 100.5018 },
    '인도네시아': { en: 'Indonesia',      zh: '印度尼西亚', ja: 'インドネシア', lat: -6.2088,  lng: 106.8456 },
    '베트남':     { en: 'Vietnam',        zh: '越南',       ja: 'ベトナム',     lat: 21.0278,  lng: 105.8342 },
    '우즈베키스탄': { en: 'Uzbekistan',   zh: '乌兹别克斯坦', ja: 'ウズベキスタン', lat: 41.2995, lng: 69.2401 },
    '미국':       { en: 'United States',  zh: '美国',       ja: 'アメリカ',     lat: 38.9072,  lng: -77.0369 },
    '필리핀':     { en: 'Philippines',    zh: '菲律宾',     ja: 'フィリピン',   lat: 14.5995,  lng: 120.9842 },
    '파나마':     { en: 'Panama',         zh: '巴拿马',     ja: 'パナマ',       lat: 8.9824,   lng: -79.5199 },
    '러시아':     { en: 'Russia',         zh: '俄罗斯',     ja: 'ロシア',       lat: 55.7558,  lng: 37.6173 },
    '이라크':     { en: 'Iraq',           zh: '伊拉克',     ja: 'イラク',       lat: 33.3152,  lng: 44.3661 },
    '헝가리':     { en: 'Hungary',        zh: '匈牙利',     ja: 'ハンガリー',   lat: 47.4979,  lng: 19.0402 },
    '멕시코':     { en: 'Mexico',         zh: '墨西哥',     ja: 'メキシコ',     lat: 19.4326,  lng: -99.1332 },
    '말레이시아': { en: 'Malaysia',       zh: '马来西亚',   ja: 'マレーシア',   lat: 3.1390,   lng: 101.6869 }
  };
  function countryName(ko) {
    var lang = SEN.i18n.get();
    if (lang === 'ko') return ko;
    var d = COUNTRIES[ko];
    return d && d[lang] ? d[lang] : ko;
  }

  var elSide = null, started = false;
  var COUNTRY_AGG = {}, ORDER = [];
  var pState = { view: 'cards', country: null };

  /* sub는 crumbs와 마찬가지로 이미 안전하게(esc 처리 다 해서) 만들어진
     HTML 조각을 그대로 받습니다 — 특허공법 로고(이미지)처럼 텍스트가
     아닌 것도 넣어야 해서, 여기서 또 esc()로 감싸면 안 됩니다. */
  function headHTML(crumbs, title, n, sub) {
    return '<div class="panel__head"><div class="panel__crumb">' + crumbs + '</div><div class="panel__title">' + esc(title) + '</div>' +
      '<div class="panel__big">' + fmt(n) + '<small>' + esc(SEN.i18n.t(UNIT_LABEL)) + (sub ? ' · ' + sub : '') + '</small></div></div>';
  }

  /* 상단 "누적 실적/수행 지역" 숫자(main.js가 그리는 data-globe-stats
     안의 빈 자리)도 카드·지구본과 같은 이 데이터를 기준으로 채웁니다 —
     domestic의 data-pmap-count와 같은 방식으로, DOM에 그 자리가 있을
     때마다(탭 전환·언어 전환으로 main.js가 다시 그릴 때마다) 채워
     넣습니다. */
  function applyStats() {
    var elT = document.querySelector('[data-oproj-total]');
    var elR = document.querySelector('[data-oproj-regions]');
    if (!elT && !elR) return;
    var total = ORDER.reduce(function (s, c) { return s + COUNTRY_AGG[c].n; }, 0);
    if (elT) elT.textContent = fmt(total);
    if (elR) elR.textContent = ORDER.length;
  }

  /* 국내 지도 쪽(projectmap.js)과 같은 방식입니다 — 좁은 화면에서 나라
     목록이 세로로 길게 늘어지지 않도록 +/- 버튼으로 여닫고 처음에는 접어
     둡니다. 접힘은 640px 이하에서만 효력이 있고(components.css의
     .panel.is-foldable), 데스크톱에서는 버튼이 감춰져 늘 펼쳐진 그대로입니다. */
  var cardsFolded = true;

  /* 나라 상세(openCountry)의 큰 건수 옆에, 관리자가 특허공법이라고 지정한
     연도·나라 조합의 합계만 로고와 함께 보여줍니다(국내 지도의
     LOGO_NAMES와 같은 방식 — assets/img/project-logo-mark.png). 관리자가
     처음 준 4건(2025/2018/2020 싱가포르, 2022 말레이시아) 중 2018·2020
     싱가포르·2022 말레이시아는 당시 데이터(assets/data/
     overseas_projects_base.json)에 없어서, 그 3건을 새 항목으로 추가한
     뒤 여기 반영했습니다. */
  var PATENT_YEARS = { '2025|싱가포르': 1, '2018|싱가포르': 1, '2020|싱가포르': 1, '2022|말레이시아': 1, '2023|베트남': 1 };

  function renderCards() {
    if (!elSide) return;
    pState.view = 'cards'; pState.country = null;
    var maxN = ORDER.reduce(function (m, c) { return Math.max(m, COUNTRY_AGG[c].n); }, 1);
    var totN = ORDER.reduce(function (s, c) { return s + COUNTRY_AGG[c].n; }, 0);
    elSide.innerHTML = '<div class="panel is-foldable' + (cardsFolded ? ' is-folded' : '') + '">' +
      '<div class="panel__head panel__head--tight panel__head--fold"><div class="panel__title">' + esc(tf(UI.cardsTitle)) + '</div>' +
      '<button type="button" class="panel__fold" data-panel-fold aria-expanded="' + (cardsFolded ? 'false' : 'true') + '" ' +
        'aria-label="' + esc(tf(cardsFolded ? UI.foldOpen : UI.foldClose)) + '">' +
        '<span class="panel__fold-sign" aria-hidden="true">' + (cardsFolded ? '+' : '−') + '</span></button>' +
      '<div class="panel__sub">' + tf(UI.cardsLead, { n: fmt(totN) }) + '</div></div>' +
      '<div class="panel__body"><div class="prov-cards">' + ORDER.map(function (c) {
        var C = COUNTRY_AGG[c];
        return '<button type="button" class="prov-card" data-country="' + esc(c) + '">' +
          '<span class="prov-card__nm">' + esc(countryName(c)) + '</span>' +
          '<span class="prov-card__n">' + fmt(C.n) + '<small>' + esc(SEN.i18n.t(UNIT_LABEL)) + '</small></span>' +
          '<span class="prov-card__bar"><i style="width:' + Math.max(2, Math.round(C.n / maxN * 100)) + '%"></i></span></button>';
      }).join('') + '</div></div>' +
      '<div class="panel__foot"><span class="panel__lgd">' + esc(tf(UI.cardsFoot)) + '</span></div></div>';
    elSide.querySelectorAll('[data-country]').forEach(function (b) {
      b.addEventListener('click', function () { openCountry(b.getAttribute('data-country')); });
    });
    var pnl = elSide.querySelector('.panel'), fld = elSide.querySelector('[data-panel-fold]');
    if (fld) fld.addEventListener('click', function () {
      cardsFolded = pnl.classList.toggle('is-folded');
      fld.setAttribute('aria-expanded', cardsFolded ? 'false' : 'true');
      fld.setAttribute('aria-label', tf(cardsFolded ? UI.foldOpen : UI.foldClose));
      fld.querySelector('.panel__fold-sign').textContent = cardsFolded ? '+' : '−';
    });
  }

  function openCountry(ko, skipFocus) {
    if (!elSide) return;
    var C = COUNTRY_AGG[ko]; if (!C) return;
    pState.view = 'country'; pState.country = ko;
    var years = Object.keys(C.years).map(Number).sort(function (a, b) { return b - a; });
    /* 나라 이름 아래 큰 건수 옆에, 특허공법 로고가 붙은 연도들의 건수만
       따로 더해 "[로고 이미지] N건"으로 보여줍니다(글자 "로고"가 아니라
       실제 로고 그림입니다 — PATENT_YEARS에 없으면 0건이라 아예 안 보임). */
    var patCount = years.reduce(function (s, y) {
      if (!PATENT_YEARS[y + '|' + ko]) return s;
      var g = C.years[y];
      return s + Object.keys(g).reduce(function (s2, gb) { return s2 + g[gb]; }, 0);
    }, 0);
    var sub = patCount
      ? '<span class="oproj-patlogo"><img src="assets/img/project-logo-mark.png" alt="" width="14" height="14">' +
        '<span>' + fmt(patCount) + esc(SEN.i18n.t(UNIT_LABEL)) + '</span></span>'
      : null;
    elSide.innerHTML = '<div class="panel">' +
      headHTML('<button type="button" data-back-rank>' + esc(tf(UI.backToAll)) + '</button><span class="panel__sep">›</span><span class="panel__cur">' + esc(countryName(ko)) + '</span>', countryName(ko), C.n, sub) +
      '<div class="panel__body">' + years.map(function (y) {
        var g = C.years[y];
        var yTotal = Object.keys(g).reduce(function (s, gb) { return s + g[gb]; }, 0);
        var detail = Object.keys(g).map(function (gb) {
          return esc(gubunLabel(gb)) + ' ' + fmt(g[gb]) + esc(SEN.i18n.t(UNIT_LABEL));
        }).join(' · ');
        return '<div class="arow"><span class="arow__nm">' + y + '</span>' +
          '<span class="arow__ct"><b>' + fmt(yTotal) + '</b>' + esc(SEN.i18n.t(UNIT_LABEL)) + '</span>' +
          '<span class="arow__detail">' + detail + '</span></div>';
      }).join('') + '</div>' +
      '<div class="panel__foot">' + esc(tf(UI.countryFoot)) +
      '<div class="panel__foot-note"><img src="assets/img/project-logo-mark.png" alt="" width="12" height="12">' + esc(tf(UI.patNote)) + '</div>' +
      '</div></div>';
    var panel = elSide.querySelector('.panel');
    panel.querySelector('[data-back-rank]').addEventListener('click', renderCards);
    if (!skipFocus) {
      var geo = COUNTRIES[ko];
      if (geo && SEN.globe && SEN.globe.focus) SEN.globe.focus(geo.lat, geo.lng);
    }
  }

  var globeEls = null;
  function init(els) {
    if (started) return;
    started = true;
    elSide = els.side;
    globeEls = els.globe || null;
    fetch(DATA_URL, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(DATA_URL + ' (' + r.status + ')');
      return r.json();
    }).then(function (data) {
      (data.items || []).forEach(function (it) {
        var c = it.country; if (!c) return;
        if (!COUNTRY_AGG[c]) { COUNTRY_AGG[c] = { ko: c, n: 0, years: {} }; ORDER.push(c); }
        var CA = COUNTRY_AGG[c]; CA.n++;
        var y = it.year;
        if (!CA.years[y]) CA.years[y] = {};
        CA.years[y][it.gubun] = (CA.years[y][it.gubun] || 0) + 1;
      });
      ORDER.sort(function (a, b) { return COUNTRY_AGG[b].n - COUNTRY_AGG[a].n; });
      renderCards();
      applyStats();

      /* 지구본은 카드와 같은 나라 목록·건수를 씁니다 — 그래야 카드에 뜬
         나라가 곧 지구본에 찍힌 점이 됩니다("연동"). 좌표는 COUNTRIES의
         수도 좌표를 그대로 씁니다. */
      if (globeEls && SEN.globe) {
        /* 관리자가 새 나라를 올렸는데 아직 COUNTRIES 표(수도 좌표)에
           없으면 카드에는 뜨지만 지구본 점은 못 찍습니다 — 좌표가 없는
           채로 넘기면 NaN 좌표로 깨지므로, 좌표가 있는 나라만 지구본에
           넘깁니다. */
        var regions = ORDER.filter(function (c) {
          var geo = COUNTRIES[c];
          return geo && typeof geo.lat === 'number' && typeof geo.lng === 'number';
        }).map(function (c) {
          var geo = COUNTRIES[c];
          return { name: c, lat: geo.lat, lng: geo.lng, n: COUNTRY_AGG[c].n,
                    i18n: { en: geo.en, zh: geo.zh, ja: geo.ja } };
        });
        SEN.globe.init({ regions: regions }, globeEls);
      }
    }).catch(function (err) {
      console.warn('[SEN] 해외 실적 카드 데이터를 불러오지 못했습니다:', err && err.message);
    });
  }

  /* 탭을 오가거나 언어를 바꿀 때 main.js가 부릅니다 — 지금 보고 있던
     자리(카드 목록 또는 특정 나라)를 그대로 다시 그립니다. 나라 화면을
     다시 그릴 때는 지구본을 또 돌리지 않습니다(skipFocus). */
  function refresh() {
    if (!elSide) return;
    if (pState.view === 'country' && pState.country) openCountry(pState.country, true);
    else renderCards();
    applyStats();
  }

  SEN.overseasMap = { init: init, refresh: refresh };
})(window.SEN);
