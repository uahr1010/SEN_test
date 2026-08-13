/* ==========================================================================
   cover.js — 표지(첫 화면) 사진 크로스페이드 + 그룹명 폭 맞춤

   카카오톡으로 받은 히어로_미리보기_v3.html 을 그대로 이식했습니다
   (클래스명만 .hero__* → .cover__* 로 바꿨습니다 — .hero 는 이미
   인트로 텍스트 플립 섹션이 쓰고 있어서 이름이 겹칩니다).
   data.json 을 안 쓰므로 main.js 의 부팅 순서와 무관하게 바로 실행됩니다.

   표지 사진은 Pages CMS [미디어 → 표지 사진]에서 uploads/main/ 에
   main_1.png, main_2.png … 처럼 올리면 바뀝니다(관리자 화면 폼이 아니라
   파일 업로드라, 정적 사이트에는 "이 폴더에 뭐가 있는지" 알려줄 목록이
   따로 없습니다 — 그래서 main_1 부터 순서대로 실제로 로드되는지 하나씩
   찔러 보고, 존재하는 것만 골라 씁니다). 하나도 없으면(첫 설치 등)
   assets/img/hero/ 안의 기본 사진 4장을 대신 씁니다. */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var MAIN_DIR   = 'uploads/main/';
  var MAX_INDEX  = 10;                              // main_1 ~ main_10 까지 찾아봅니다
  var EXTS       = ['png', 'jpg', 'jpeg', 'webp'];  // 확장자는 이 중 아무거나 됩니다
  var FALLBACK   = [1, 2, 3, 4].map(function (i) { return 'assets/img/hero/hero-' + i + '.jpg'; });
  var CYCLE      = 24;  // 전체 한 바퀴(초). 사진 한 장당 CYCLE / 장수 초씩 보입니다

  /** main_N.<확장자> 가 실제로 존재하는지 순서대로 시도해 URL을 돌려줍니다 (없으면 null) */
  function probeOne(n) {
    return new Promise(function (resolve) {
      var i = 0;
      function tryExt() {
        if (i >= EXTS.length) { resolve(null); return; }
        var url = MAIN_DIR + 'main_' + n + '.' + EXTS[i++];
        var img = new Image();
        img.onload = function () { resolve(url); };
        img.onerror = tryExt;
        img.src = url;
      }
      tryExt();
    });
  }

  /** main_1 ~ main_10 을 병렬로 찔러 보고, 실제로 있는 것만 번호순으로 돌려줍니다 */
  function discoverPhotos() {
    var indices = [];
    for (var n = 1; n <= MAX_INDEX; n++) indices.push(n);
    return Promise.all(indices.map(probeOne)).then(function (results) {
      var found = [];
      results.forEach(function (url, i) { if (url) found.push({ n: i + 1, url: url }); });
      found.sort(function (a, b) { return a.n - b.n; });
      return found.length ? found.map(function (f) { return f.url; }) : FALLBACK;
    });
  }

  /* ---------- 배경 사진 교차 전환 ---------- */
  function initFade() {
    var bg = document.querySelector('[data-cover-bg]');
    if (!bg) return;
    discoverPhotos().then(function (urls) { buildFade(bg, urls); });
  }

  function buildFade(bg, urls) {
    var count = urls.length;
    if (!count) return;

    var slot = 100 / count;
    var fade = Math.min(slot * 0.22, 6);
    var r = function (n) { return n.toFixed(3); };

    var css =
      '@keyframes coverFade{' +
        '0%{opacity:0}' +
        r(fade) + '%{opacity:1}' +
        r(slot) + '%{opacity:1}' +
        r(slot + fade) + '%{opacity:0}' +
        '100%{opacity:0}}' +
      /* 정지 사진이 밋밋하지 않도록 아주 천천히 확대 */
      '@keyframes coverZoom{' +
        '0%{transform:scale(1.02)}' +
        r(slot + fade) + '%{transform:scale(1.08)}' +
        '100%{transform:scale(1.08)}}';

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var html = '';
    urls.forEach(function (url, i) {
      html += '<img src="' + url + '" alt=""' +
              (i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + '>';
    });
    bg.innerHTML = html;

    [].forEach.call(bg.children, function (img, i) {
      var delay = (CYCLE / count * i) + 's';
      img.style.animationName = 'coverFade, coverZoom';
      img.style.animationDuration = CYCLE + 's, ' + CYCLE + 's';
      img.style.animationTimingFunction = 'linear, linear';
      img.style.animationIterationCount = 'infinite, infinite';
      img.style.animationDelay = delay + ', ' + delay;
    });
  }

  /* ---------- 그룹명을 화면 폭에 정확히 맞춤 ---------- */
  function fitBrand() {
    var el = document.querySelector('[data-cover-brand]');
    if (!el) return;
    var host = el.parentElement.getBoundingClientRect().width;
    if (!host || host < 10) return;

    var cs = getComputedStyle(el);
    var fs = parseFloat(cs.fontSize) || 100;
    var lsEm = (cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0) / fs;

    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;' +
      'font-family:' + cs.fontFamily + ';font-weight:' + cs.fontWeight +
      ';letter-spacing:' + (lsEm * 100) + 'px;font-size:100px';
    probe.textContent = el.textContent.trim();
    document.body.appendChild(probe);
    var w100 = probe.getBoundingClientRect().width;
    probe.remove();
    if (!w100) return;

    el.style.fontSize = (100 * host / w100).toFixed(2) + 'px';
    // 반올림 오차로 1~2px 넘칠 수 있어 실제 폭을 보고 한 번 더 조입니다
    for (var i = 0; i < 3 && el.scrollWidth > host; i++) {
      el.style.fontSize = (parseFloat(el.style.fontSize) * host / el.scrollWidth).toFixed(2) + 'px';
    }
  }

  function init() {
    if (!document.querySelector('[data-cover]')) return;
    initFade();
    fitBrand();
    addEventListener('resize', fitBrand);
    // 웹폰트(Anton)는 늦게 도착합니다. 안 기다리면 대체폰트 기준으로 계산돼 어긋납니다.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBrand);
  }

  SEN.cover = { init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.SEN);
