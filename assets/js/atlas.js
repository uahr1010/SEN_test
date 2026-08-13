/* ==========================================================================
   atlas.js — 상단 네비 · 스크롤 위치 표시

   페이지는 평범한 세로 스크롤입니다.
   예전에는 화면에 고정된 무대 위에서 장면을 교차 전환했는데,
   스크롤할 때마다 창이 통째로 바뀌는 느낌이라 걷어냈습니다.
   지금은 섹션이 그냥 위에서 아래로 이어지고, 이 파일은 세 가지만 합니다.

     · 오른쪽 점을 누르면 해당 섹션으로 부드럽게 이동
     · 지금 보고 있는 섹션을 오른쪽 점에 표시
     · 언어 토글

   상단 메뉴(회사소개/프로젝트/뉴스/채용) 4개는 없앴습니다 — 헤더에는
   로고와 언어만 남았고, 배경은 항상 투명 유지입니다.
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
    initLogo();

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

  /* ---------- 좌상단 로고 ----------
     href="#top" 은 원래 <main id="top"> 을 가리켰지만, 표지(.cover)가
     main 앞에 추가되면서 main 이 화면 한 장(100vh) 아래에서 시작하게
     됐습니다. 그대로 두면 로고를 눌러도 표지가 아니라 그 아래(회사소개
     시작 지점)로 이동해 버려서, 페이지 맨 위(표지)로 직접 스크롤하도록
     가로챕니다. */
  function initLogo() {
    var logo = document.querySelector('.topbar__logo[href="#top"]');
    if (!logo) return;
    logo.addEventListener('click', function (e) {
      e.preventDefault();
      scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
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
    /* 상단 메뉴가 없어지면서 헤더는 항상 투명 유지로 고정했습니다
       (예전엔 밝은 장면 위에서 .is-light 로 흰 배경으로 바꿨습니다). */
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
  /* 버튼에 보이는 짧은 표기 — 드롭다운 안의 "한국어/English/中文/日本語"와는
     별개로, 지금 선택된 언어를 KO/EN/ZH/JP 로 압축해 보여줍니다. */
  var LANG_SHORT = { ko: 'KO', en: 'EN', zh: 'ZH', ja: 'JP' };

  function initLang() {
    var wrap = document.querySelector('[data-langswitch]');
    if (!wrap) return;
    var btn = wrap.querySelector('[data-lang-toggle]');
    var currentEl = wrap.querySelector('[data-lang-current]');

    function syncCurrent() {
      if (!currentEl) return;
      var lang = SEN.i18n.get();
      currentEl.textContent = LANG_SHORT[lang] || lang.toUpperCase();
    }
    syncCurrent();
    SEN.i18n.onChange(syncCurrent);

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

  /* initLang 은 news.html 처럼 .scene 이 없는 서브 페이지에서도
     헤더의 언어 토글만 따로 살리기 위해 별도로 내보냅니다. */
  SEN.atlas = { init: init, goTo: goTo, initLang: initLang };
})(window.SEN);
