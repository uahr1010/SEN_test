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

  var mainEl;

  function init() {
    topbar = document.querySelector('.topbar');
    sections = [].slice.call(document.querySelectorAll('.scene'));
    if (!sections.length) return;

    buildProgress();
    initNav();
    initLang();

    /* 표지(.cover)가 있는 페이지(index.html)에서만 헤더를 표지 뒤에
       숨겨 뒀다가, 본문(main)이 화면을 덮기 시작하는 지점부터 보여줍니다.
       news.html 등은 여기 init() 자체를 안 불러서(initLang만 씀)
       이 로직을 안 타 항상 그대로 보입니다. */
    mainEl = document.querySelector('main#top');
    if (topbar && document.querySelector('.cover') && mainEl) {
      topbar.classList.add('is-gated');
    }

    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
  }

  /** 고정 헤더에 제목이 가리지 않도록 그 높이만큼 빼고 이동합니다 */
  function headerH() { return topbar ? topbar.offsetHeight - 1 : 0; }

  /* id로 이동 — hero.js의 "채용중"/"새 소식" 배지처럼 #scene-careers 같은
     해시 링크를 그냥 두면 브라우저 기본 앵커 점프가 일어나 오른쪽 점을
     눌렀을 때와 도착 위치가 살짝 어긋납니다(고정 헤더 높이를 안 뺌).
     같은 goTo() 보정을 타도록 섹션 id로 인덱스를 찾아 넘겨줍니다. */
  function goToId(id) {
    var i = sections.findIndex(function (s) { return s.id === id; });
    if (i > -1) goTo(i);
  }

  function goTo(i) {
    var el = sections[i];
    if (!el) return;
    var top = el.getBoundingClientRect().top + scrollY - headerH();
    /* 맨 위 점(첫 섹션)을 누르면 예전엔 헤더가 나타나기(표지를 다 지나기)
       "직전" 지점에 멈춰서, 이동은 됐는데 헤더는 아직 안 보였습니다.
       표지가 있는 페이지에서는 헤더가 확실히 보이는 지점 이후로 보정합니다. */
    if (topbar && mainEl && topbar.classList.contains('is-gated')) {
      top = Math.max(top, mainEl.offsetTop + 4);
    }
    scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
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
      /* 마지막 섹션이 화면보다 짧으면 "offsetTop + 헤더높이 + 8" 지점까지
         스크롤이 물리적으로 안 내려가서, 맨 아래로 가도 마지막 점이
         안 켜지는 문제가 있었습니다(PC에서 특히 잘 보임). 스크롤이 사실상
         끝까지 내려갔으면 위 계산과 상관없이 무조건 마지막 섹션으로 봅니다. */
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) {
        idx = sections.length - 1;
      }
      setActive(idx);

      /* 표지가 있는 페이지: main이 화면 위쪽을 덮기 시작하면(= 표지를
         다 지나면) 헤더를 보여줍니다. */
      if (topbar && mainEl && topbar.classList.contains('is-gated')) {
        topbar.classList.toggle('is-visible', scrollY >= mainEl.offsetTop - 2);
      }
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
  SEN.atlas = { init: init, goTo: goTo, goToId: goToId, initLang: initLang };
})(window.SEN);
