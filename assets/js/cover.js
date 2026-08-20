/* ==========================================================================
   cover.js — 표지(첫 화면) 사진 크로스페이드
   (그룹명 글자 크기는 atlas.css가 container query 단위로 처리합니다)

   카카오톡으로 받은 히어로_미리보기_v3.html 을 그대로 이식했습니다
   (클래스명만 .hero__* → .cover__* 로 바꿨습니다 — .hero 는 이미
   인트로 텍스트 플립 섹션이 쓰고 있어서 이름이 겹칩니다).
   main.js 의 부팅 순서와 무관하게 바로 실행되도록, content/*.json 을
   main.js 와 별도로 여기서 직접 fetch 합니다(표지가 첫 화면이라 다른
   콘텐츠를 기다리지 않고 바로 사진을 올리기 위함).

   표지 사진은 Pages CMS [③ 표지 사진]에서 관리합니다 — 예전에는
   uploads/main/ 에 main_1.png, main_2.png … 처럼 정해진 파일 이름으로
   올려야 했고(파일 업로드 방식이라 "이 폴더에 뭐가 있는지" 알려줄
   목록이 없어, 정해진 이름을 하나씩 찔러 보는 방식으로 우회했습니다),
   사진마다 제목을 붙일 수도 없었습니다. 지금은 그 탭에서 사진을 목록
   으로 직접 추가·순서 변경·제목 입력을 하면 content/cover-photos.json
   에 그대로 저장되고, 여기서는 그 파일을 읽어 파일 이름과 상관없이
   그 목록에 있는 사진을 그대로 씁니다. */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var DATA_URL   = 'content/cover-photos.json';
  var FALLBACK   = [1, 2, 3, 4].map(function (i) { return { image: 'assets/img/hero/hero-' + i + '.jpg', title: '' }; });
  var PHOTO_SEC  = 1;  // 사진 한 장이 보이는 시간(초). 장수가 몇 장이든 이 값은 고정입니다

  /** render.js의 asset()과 같은 규칙 — 앞의 슬래시만 정리합니다.
      cover.js는 render.js보다 먼저(또는 무관하게) 실행될 수 있어
      SEN.util 에 기대지 않고 따로 둡니다. */
  function assetPath(p) {
    if (!p) return '';
    var s = String(p).trim();
    if (/^(https?:)?\/\//i.test(s) || s.indexOf('data:') === 0) return s;
    return s.replace(/^\/+/, '');
  }

  /** content/cover-photos.json 을 읽어 {image, title} 목록을 돌려줍니다.
      파일이 없거나 목록이 비어 있으면(첫 설치 등) 기본 사진 4장을 씁니다. */
  function loadPhotos() {
    return fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var list = (data && Array.isArray(data.photos)) ? data.photos : [];
        list = list.filter(function (p) { return p && p.image; });
        return list.length ? list : FALLBACK;
      })
      .catch(function () { return FALLBACK; });
  }

  /* ---------- 배경 사진 교차 전환 ---------- */
  function initFade() {
    var bg = document.querySelector('[data-cover-bg]');
    if (!bg) return;
    loadPhotos().then(function (photos) { buildFade(bg, photos); });
  }

  function buildFade(bg, photos) {
    var count = photos.length;
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
    photos.forEach(function (p, i) {
      html += '<img src="' + assetPath(p.image) + '" alt=""' +
              (i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + '>';
    });
    bg.innerHTML = html;

    function syncAnim(el, i) {
      var delay = (CYCLE / count * i) + 's';
      el.style.animationName = 'coverFade, coverZoom';
      el.style.animationDuration = CYCLE + 's, ' + CYCLE + 's';
      el.style.animationTimingFunction = 'linear, linear';
      el.style.animationIterationCount = 'infinite, infinite';
      el.style.animationDelay = delay + ', ' + delay;
    }
    [].forEach.call(bg.children, syncAnim);

    /* 사진명(제목) — SEN ENGINEERING GROUP 글자 바로 위에, 지금 보이는
       사진과 같은 타이밍으로 크로스페이드됩니다(사진과 같은 coverFade
       키프레임을 그대로 씁니다. coverZoom은 확대 효과라 글자에는 안 씀). */
    var titleHost = document.querySelector('[data-cover-photo-titles]');
    if (titleHost) {
      var titleHtml = '';
      photos.forEach(function (p) {
        titleHtml += '<span>' + (p.title ? String(p.title).replace(/[<>&]/g, function (c) {
          return c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;';
        }) : '') + '</span>';
      });
      titleHost.innerHTML = titleHtml;
      [].forEach.call(titleHost.children, function (el, i) {
        var delay = (CYCLE / count * i) + 's';
        el.style.animationName = 'coverFade';
        el.style.animationDuration = CYCLE + 's';
        el.style.animationTimingFunction = 'linear';
        el.style.animationIterationCount = 'infinite';
        el.style.animationDelay = delay;
      });
    }
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
  function initAutoPause(cover) {
    var pausedByScroll = false, pausedByTab = document.hidden;
    /* 사진(.cover__bg img)과 사진명(.cover__photo-titles span)이 같은
       coverFade 타이밍을 공유하므로, is-paused 는 그 둘을 감싸는
       cover 루트에 둡니다 — 둘 중 하나만 멈추면 서로 어긋납니다. */
    function sync() { cover.classList.toggle('is-paused', pausedByScroll || pausedByTab); }

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
    initAutoPause(cover);
  }

  SEN.cover = { init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.SEN);
