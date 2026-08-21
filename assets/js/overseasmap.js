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
    backToAll: { ko: '← 국가 전체', en: '← All countries', zh: '← 全部国家', ja: '← 国全体' },
    countryFoot: { ko: '연도별 구조설계·안전진단 건수', en: 'Structural design and safety diagnosis counts by year', zh: '按年度显示结构设计与安全诊断件数', ja: '年度別の構造設計・安全診断件数' }
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
    '멕시코':     { en: 'Mexico',         zh: '墨西哥',     ja: 'メキシコ',     lat: 19.4326,  lng: -99.1332 }
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

  function headHTML(crumbs, title, n, sub) {
    return '<div class="panel__head"><div class="panel__crumb">' + crumbs + '</div><div class="panel__title">' + esc(title) + '</div>' +
      '<div class="panel__big">' + fmt(n) + '<small>' + esc(SEN.i18n.t(UNIT_LABEL)) + (sub ? ' · ' + esc(sub) : '') + '</small></div></div>';
  }

  function renderCards() {
    if (!elSide) return;
    pState.view = 'cards'; pState.country = null;
    var maxN = ORDER.reduce(function (m, c) { return Math.max(m, COUNTRY_AGG[c].n); }, 1);
    var totN = ORDER.reduce(function (s, c) { return s + COUNTRY_AGG[c].n; }, 0);
    elSide.innerHTML = '<div class="panel"><div class="panel__head panel__head--tight"><div class="panel__title">' + esc(tf(UI.cardsTitle)) + '</div>' +
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
  }

  function openCountry(ko, skipFocus) {
    if (!elSide) return;
    var C = COUNTRY_AGG[ko]; if (!C) return;
    pState.view = 'country'; pState.country = ko;
    var years = Object.keys(C.years).map(Number).sort(function (a, b) { return b - a; });
    elSide.innerHTML = '<div class="panel">' +
      headHTML('<button type="button" data-back-rank>' + esc(tf(UI.backToAll)) + '</button><span class="panel__sep">›</span><span class="panel__cur">' + esc(countryName(ko)) + '</span>', countryName(ko), C.n, null) +
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
      '<div class="panel__foot">' + esc(tf(UI.countryFoot)) + '</div></div>';
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

      /* 지구본은 카드와 같은 나라 목록·건수를 씁니다 — 그래야 카드에 뜬
         나라가 곧 지구본에 찍힌 점이 됩니다("연동"). 좌표는 COUNTRIES의
         수도 좌표를 그대로 씁니다. */
      if (globeEls && SEN.globe) {
        var regions = ORDER.map(function (c) {
          var geo = COUNTRIES[c] || {};
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
  }

  SEN.overseasMap = { init: init, refresh: refresh };
})(window.SEN);
