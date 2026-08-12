/* ==========================================================================
   atlas.js — 상단 네비 · 스크롤 위치 표시

   페이지는 평범한 세로 스크롤입니다.
   예전에는 화면에 고정된 무대 위에서 장면을 교차 전환했는데,
   스크롤할 때마다 창이 통째로 바뀌는 느낌이라 걷어냈습니다.
   지금은 섹션이 그냥 위에서 아래로 이어지고, 이 파일은 세 가지만 합니다.

     · 메뉴 / 오른쪽 점을 누르면 해당 섹션으로 부드럽게 이동
     · 지금 보고 있는 섹션의 메뉴에 표시
     · 인트로 위에서는 투명 헤더, 그 아래에서는 흰 헤더
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var sections = [], dots = [], navBtns = [], topbar;
  var cur = -1, ticking = false;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init() {
    topbar = document.querySelector('.topbar');
    sections = [].slice.call(document.querySelectorAll('.scene'));
    if (!sections.length) return;

    buildProgress();
    initNav();
    initLang();

    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
  }

  /** 고정 헤더에 제목이 가리지 않도록 그 높이만큼 빼고 이동합니다 */
  function headerH() { return topbar ? topbar.offsetHeight - 1 : 0; }

  function goTo(i) {
    var el = sections[i];
    if (!el) return;
    scrollTo({
      top: el.getBoundingClientRect().top + scrollY - headerH(),
      behavior: reduce ? 'auto' : 'smooth'
    });
  }

  /* ---------- 지금 보고 있는 섹션 ----------
     헤더 바로 아래 지점이 어느 섹션 안에 있는지로 판단합니다.
     (IntersectionObserver 로 하면 섹션 높이가 제각각일 때 경계가 흔들립니다) */
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var line = scrollY + headerH() + 8;
      var idx = 0;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].offsetTop <= line) idx = i;
      }
      setActive(idx);
    });
  }

  function setActive(i) {
    if (i === cur) return;
    cur = i;
    dots.forEach(function (d, k) { d.classList.toggle('is-on', k === i); });
    navBtns.forEach(function (b) {
      b.classList.toggle('is-on', +b.getAttribute('data-scene') === i);
    });
    if (topbar) topbar.classList.toggle('is-light', !sections[i].classList.contains('scene--dark'));
  }

  /* ---------- 오른쪽 진행 점 ---------- */
  function buildProgress() {
    var host = document.getElementById('prog');
    if (!host) return;
    dots = sections.map(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', (s.getAttribute('data-label') || '') + ' 로 이동');
      b.addEventListener('click', function () { goTo(i); });
      host.appendChild(b);
      return b;
    });
  }

  /* ---------- 상단 메뉴 ---------- */
  function initNav() {
    navBtns = [].slice.call(document.querySelectorAll('[data-scene]'));
    navBtns.forEach(function (b) {
      b.addEventListener('click', function () { goTo(+b.getAttribute('data-scene')); });
    });
  }

  /* ---------- 언어 토글 ---------- */
  function initLang() {
    var wrap = document.querySelector('[data-langswitch]');
    if (!wrap) return;
    var btn = wrap.querySelector('[data-lang-toggle]');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      wrap.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', wrap.classList.contains('is-open'));
    });
    wrap.querySelectorAll('[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () {
        SEN.i18n.set(b.getAttribute('data-lang'));
        wrap.classList.remove('is-open');
      });
    });
    document.addEventListener('click', function () { wrap.classList.remove('is-open'); });
  }

  SEN.atlas = { init: init, goTo: goTo };
})(window.SEN);
