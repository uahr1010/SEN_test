/* ==========================================================================
   cover.js — 표지(첫 화면) 사진 크로스페이드
   (그룹명 글자 크기는 atlas.css가 container query 단위로 처리합니다)

   카카오톡으로 받은 히어로_미리보기_v3.html 을 그대로 이식했습니다
   (클래스명만 .hero__* → .cover__* 로 바꿨습니다 — .hero 는 이미
   인트로 텍스트 플립 섹션이 쓰고 있어서 이름이 겹칩니다).
   data.json 을 안 쓰므로 main.js 의 부팅 순서와 무관하게 바로 실행됩니다.

   표지 사진은 Pages CMS [미디어 → 표지 사진]에서 uploads/main/ 에
   main_1.png, main_2.png … 최대 main_10.png 까지 올리면 바뀝니다
   (관리자 화면 폼이 아니라 파일 업로드라, 정적 사이트에는 "이 폴더에
   뭐가 있는지" 알려줄 목록이 따로 없습니다 — 그래서 main_1 부터
   순서대로 실제로 로드되는지 하나씩 찔러 보고, 존재하는 것만 골라
   씁니다). 하나도 없으면(첫 설치 등) assets/img/hero/ 안의 기본 사진
   4장을 대신 씁니다. */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var MAIN_DIR   = 'uploads/main/';
  var MAX_INDEX  = 10;                              // main_1 ~ main_10 까지 찾아봅니다
  var EXTS       = ['png', 'jpg', 'jpeg', 'webp'];  // 확장자는 이 중 아무거나 됩니다
  var FALLBACK   = [1, 2, 3, 4].map(function (i) { return 'assets/img/hero/hero-' + i + '.jpg'; });
  var PHOTO_SEC  = 1;  // 사진 한 장이 보이는 시간(초). 장수가 몇 장이든 이 값은 고정입니다

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

    var CYCLE = PHOTO_SEC * count;   // 사진 한 장당 PHOTO_SEC초씩 보이도록, 장수에 맞춰 전체 주기를 계산
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

  /* 그룹명(.cover__brand) 글자 크기는 더 이상 여기서 재서 맞추지 않습니다
     — atlas.css가 container query 단위(cqw)로 .cover__foot 폭에 비례해
     그립니다. JS로 폭을 측정해 나중에 덮어쓰던 예전 방식(fitBrand())은
     자바스크립트가 아직 안 돌았을 때(첫 페인트, 폰트 로딩 중)나 이벤트를
     놓쳤을 때(브라우저 확대/축소가 항상 resize를 내는 게 아님) 글자가
     잘려 보이는 문제가 있었는데, CSS만 쓰면 그런 타이밍 문제 자체가
     없어집니다.

     표지 사진 전환은 CSS @keyframes(무한 반복)라, 스크롤로 화면 밖에
     나가거나 다른 탭으로 넘어가도 계속 돌아갑니다 — opacity/transform만
     쓰는 애니메이션이라 브라우저가 어느 정도 알아서 덜 그리긴 하지만,
     타이머 자체는 안 멈춥니다. 표지가 화면에 없거나(스크롤로 지나감)
     탭이 안 보일 때는 확실히 멈춰서 불필요하게 도는 걸 없앱니다. */
  function initAutoPause(cover, bg) {
    var pausedByScroll = false, pausedByTab = document.hidden;
    function sync() { bg.classList.toggle('is-paused', pausedByScroll || pausedByTab); }

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        pausedByScroll = !entries[entries.length - 1].isIntersecting;
        sync();
      }, { threshold: 0 }).observe(cover);
    }
    document.addEventListener('visibilitychange', function () {
      pausedByTab = document.hidden;
      sync();
    });
  }

  function init() {
    var cover = document.querySelector('[data-cover]');
    if (!cover) return;
    initFade();
    initAutoPause(cover, cover.querySelector('[data-cover-bg]'));
  }

  SEN.cover = { init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.SEN);
