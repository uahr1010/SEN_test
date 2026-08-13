/* ==========================================================================
   cover.js — 표지(첫 화면) 사진 크로스페이드 + 그룹명 폭 맞춤

   카카오톡으로 받은 히어로_미리보기_v3.html 을 그대로 이식했습니다
   (클래스명만 .hero__* → .cover__* 로 바꿨습니다 — .hero 는 이미
   인트로 텍스트 플립 섹션이 쓰고 있어서 이름이 겹칩니다).
   data.json 을 안 쓰므로 main.js 의 부팅 순서와 무관하게 바로 실행됩니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var PHOTOS = 4;   // assets/img/hero/hero-1.jpg ~ hero-4.jpg
  var CYCLE  = 24;  // 전체 한 바퀴(초). 사진 한 장당 CYCLE / PHOTOS 초씩 보입니다

  /* ---------- 배경 사진 교차 전환 ---------- */
  function initFade() {
    var bg = document.querySelector('[data-cover-bg]');
    if (!bg || PHOTOS < 1) return;

    var slot = 100 / PHOTOS;
    var fade = Math.min(slot * 0.22, 6);
    var r = function (n) { return n.toFixed(3); };

    var css =
      '@keyframes coverFade{' +
        '0%{opacity:0}' +
        r(fade) + '%{opacity:1}' +
        r(slot) + '%{opacity:1}' +
        r(slot + fade) + '%{opacity:0}' +
        '100%{opacity:0}}' +
      '@keyframes coverZoom{' +
        '0%{transform:scale(1.02)}' +
        r(slot + fade) + '%{transform:scale(1.08)}' +
        '100%{transform:scale(1.08)}}';

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var html = '';
    for (var i = 1; i <= PHOTOS; i++) {
      html += '<img src="assets/img/hero/hero-' + i + '.jpg" alt=""' +
              (i === 1 ? ' fetchpriority="high"' : ' loading="lazy"') + '>';
    }
    bg.innerHTML = html;

    [].forEach.call(bg.children, function (img, i) {
      var delay = (CYCLE / PHOTOS * i) + 's';
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
