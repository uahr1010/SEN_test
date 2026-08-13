/* ==========================================================================
   timeline.js — 회사연혁 가로 타임라인

   하나의 수평선 위에 연혁을 왼쪽에서 오른쪽으로 늘어놓습니다.

     · 창립(1973)부터 2020년대까지 전체 선이 항상 다 그려져 있습니다
       (예전처럼 연대를 접었다 폈다 하며 선 길이가 바뀌지 않습니다).
     · 1990 / 2000 / 2010 / 2020년대 버튼을 누르면 그 연대가 시작하는
       지점으로 선을 부드럽게 이동시킵니다(누르면 "펼치기"가 아니라
       "이동하기"). 처음에는 2020년대가 기본으로 선택돼 있습니다.
     · 선을 좌우로 끌어(드래그) 볼 수도 있습니다.
     · 오른쪽 끝은 화살표. 마지막 항목보다 조금 더 뻗어 있고
       그 앞에 사람이 서 있습니다 (계속 나아가는 중이라는 표시).

   ▸ 처음 화면에 들어왔을 때
     1973 에서 잠깐 멈췄다가, 기본 선택 연대(2020년대)가 시작하는
     지점까지 미끄러진 뒤 멈춥니다 — 버튼을 눌렀을 때와 같은 지점입니다.

   ▸ 데이터
     content/about.json 의 history 는 main.js 가 이미 받아 왔습니다.
     여기서 다시 fetch 하지 않고 SEN.data 를 그대로 씁니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  /* ====== 조정값 ==================================================== */
  var PAD_LEFT    = 90;      // 왼쪽 여백 (창립 항목이 놓이는 지점)
  var HOLD        = 1100;    // 1973 에서 멈춰 있는 시간(ms)
  var SWEEP_MIN   = 900;     // 훑는 데 걸리는 최소 시간(ms)
  var SWEEP_MAX   = 2200;    // 최대 시간
  var DEFAULT_ERA = '2020년대';   // 처음에 선택돼 있을 연대
  /* ================================================================== */

  var t, esc;
  var elRoot, elTl, elTrack, elAxis, elArrow, elWalker, elEras;
  var history = null;
  var eraX = {};          // 연대 이름 → 그 연대가 시작하는 x좌표(px)
  var selected = null;    // 지금 선택된 연대 이름
  var pan = { raf: 0, taken: false };
  var started = false;

  function cssPx(name) {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
  }
  function when(it) {
    return [t(it.year), t(it.month)].filter(Boolean).join('. ');
  }
  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- 그리기 ----------
     창립 + 모든 연대의 모든 항목을 항상 한 번에 그립니다(선이 항상
     끝까지 존재). 연대 버튼은 이제 이 중 어디로 스크롤해 이동할지만
     고릅니다 — 그리는 내용 자체는 바뀌지 않으므로 버튼을 눌러도
     다시 그릴 필요가 없습니다. */
  function draw() {
    if (!history) return;

    [].slice.call(elTrack.querySelectorAll('.tml__node, .tml__band'))
      .forEach(function (n) { n.remove(); });

    var GAP  = cssPx('--tml-gap');
    var ERA  = cssPx('--tml-era-gap');
    var TAIL = cssPx('--tml-tail');

    var x = PAD_LEFT, i = 0;
    var frag = document.createDocumentFragment();
    eraX = {};

    function addNode(it, extra) {
      var side = (i % 2 === 0) ? 'up' : 'down';
      var el = document.createElement('div');
      el.className = 'tml__node tml__node--' + side + (extra ? ' ' + extra : '');
      el.style.left = x + 'px';
      el.innerHTML =
        '<span class="tml__dot"></span>' +
        '<span class="tml__tick"></span>' +
        '<div class="tml__card">' +
          '<p class="tml__when">' + esc(when(it)) + '</p>' +
          '<p class="tml__title">' + esc(t(it.title)) + '</p>' +
        '</div>';
      frag.appendChild(el);
      x += GAP; i++;
    }

    (history.pinned || []).forEach(function (it) { addNode(it, 'tml__node--origin'); });

    (history.groups || []).forEach(function (g) {
      var label = t(g.label);

      x += ERA;
      var bandLeft = x - GAP * 0.5;
      eraX[label] = bandLeft;
      var band = document.createElement('div');
      band.className = 'tml__band';
      band.style.left = bandLeft + 'px';
      band.textContent = label;
      frag.appendChild(band);

      (g.items || []).forEach(function (it) { addNode(it, null); });
    });

    elTrack.appendChild(frag);

    /* 축은 마지막 항목보다 TAIL 만큼 더 뻗습니다. 그 앞에 사람이 섭니다. */
    var lastX = x - GAP;
    var axisEnd = lastX + TAIL;
    elTrack.style.width = (axisEnd + 120) + 'px';
    elAxis.style.width = axisEnd + 'px';
    elArrow.style.left = axisEnd + 'px';

    /* 마지막 글상자는 항목 중심에서 좌우로 GAP/2 씩 퍼져 있습니다.
       그 오른쪽 끝을 지난 지점에 둬야 글자와 겹치지 않습니다. */
    elWalker.style.left = Math.min(lastX + GAP / 2 + 26, axisEnd - 26) + 'px';

    requestAnimationFrame(function () {
      [].slice.call(elTrack.querySelectorAll('.tml__node')).forEach(function (n, k) {
        setTimeout(function () { n.classList.add('is-on'); }, k * 45);
      });
      [].slice.call(elTrack.querySelectorAll('.tml__band')).forEach(function (n) {
        n.classList.add('is-on');
      });
      elWalker.classList.add('is-on');
    });
  }

  /* ---------- 연대 버튼 ----------
     이제 여닫는 버튼이 아니라 "그 연대로 이동" 버튼입니다.
     선택된 연대만 강조 표시됩니다(파란 배경, .tml-era[aria-pressed]). */
  function buildButtons() {
    elEras.innerHTML = '';
    (history.groups || []).forEach(function (g) {
      var label = t(g.label);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tml-era';
      b.setAttribute('aria-pressed', selected === label ? 'true' : 'false');
      b.innerHTML = '<span>' + esc(label) + '</span>' +
                    '<span class="tml-era__n">' + (g.items || []).length + '</span>';
      b.addEventListener('click', function () { selectEra(label); });
      elEras.appendChild(b);
    });
  }

  /** 연대를 선택 상태로 표시하고 그 지점으로 스크롤해 이동합니다 */
  function selectEra(label) {
    if (eraX[label] == null) return;
    selected = label;
    buildButtons();
    goToEra(label, true);
  }

  /** elTl 을 label 연대가 시작하는 지점으로 스크롤합니다.
      animate=false 면 즉시 이동(초기 자동 훑기 도착점 계산용으로도 씀). */
  function goToEra(label, animate) {
    if (!elTl) return;
    var max = elTl.scrollWidth - elTl.clientWidth;
    if (max <= 0) return;
    var target = Math.max(0, Math.min(eraX[label] - 60, max));

    pan.taken = true;                 // 진행 중이던 자동 훑기가 있으면 중단
    cancelAnimationFrame(pan.raf);

    if (animate && !reduceMotion()) {
      elTl.scrollTo({ left: target, behavior: 'smooth' });
    } else {
      elTl.scrollLeft = target;
    }
  }

  /* ---------- 자동 훑기 ----------
     1973 에서 멈췄다가 가속 → 감속하며 기본 선택 연대(DEFAULT_ERA)가
     시작하는 지점까지 미끄러집니다 — 버튼을 눌렀을 때와 같은 도착점이라
     처음 진입 결과와 "2020년대 버튼을 누른 결과"가 항상 일치합니다.
     scroll 이벤트로 위치를 재지 않고 우리가 쓰기만 하므로 스크롤이 끊기지 않습니다. */
  function ease(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  function startPan() {
    cancelAnimationFrame(pan.raf);
    pan.taken = false;

    var dest = eraX[selected] != null
      ? Math.max(0, eraX[selected] - 60)
      : null;

    if (reduceMotion()) {
      if (dest != null) elTl.scrollLeft = Math.min(dest, elTl.scrollWidth - elTl.clientWidth);
      return;
    }

    requestAnimationFrame(function () {
      elTl.scrollLeft = 0;
      var max = elTl.scrollWidth - elTl.clientWidth;
      if (max <= 4) return;
      var end = dest != null ? Math.min(dest, max) : max;
      if (end <= 4) return;

      var dur = Math.max(SWEEP_MIN, Math.min(SWEEP_MAX, end * 0.35));
      var t0 = null;

      function step(ts) {
        if (pan.taken) return;                  // 사용자가 잡거나 버튼을 누르면 손을 뗍니다
        if (t0 === null) t0 = ts;
        var e = ts - t0;
        if (e < HOLD) { pan.raf = requestAnimationFrame(step); return; }
        var p = Math.min(1, (e - HOLD) / dur);
        elTl.scrollLeft = end * ease(p);
        if (p < 1) pan.raf = requestAnimationFrame(step);
      }
      pan.raf = requestAnimationFrame(step);
    });
  }

  /* 섹션이 화면에 들어왔을 때 한 번만 훑습니다 */
  function watchSection() {
    if (!('IntersectionObserver' in window)) { startPan(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || started) return;
        started = true;
        io.disconnect();
        startPan();
      });
    }, { threshold: 0.25 });
    io.observe(elRoot);
  }

  /* ---------- 마우스로 끌기 ---------- */
  function initDrag() {
    var down = false, startX = 0, startScroll = 0;

    elTl.addEventListener('pointerdown', function (e) {
      pan.taken = true;                          // 사용자가 잡으면 자동 훑기 중단
      if (e.pointerType === 'touch') return;     // 터치는 브라우저 기본 스크롤에 맡깁니다
      down = true;
      startX = e.clientX;
      startScroll = elTl.scrollLeft;
      elTl.classList.add('is-drag');
      elTl.setPointerCapture(e.pointerId);
    });

    elTl.addEventListener('pointermove', function (e) {
      if (!down) return;
      elTl.scrollLeft = startScroll - (e.clientX - startX);
    });

    function end(e) {
      if (!down) return;
      down = false;
      elTl.classList.remove('is-drag');
      try { elTl.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    elTl.addEventListener('pointerup', end);
    elTl.addEventListener('pointercancel', end);

    /* 세로 휠을 가로 이동으로. 단 끝에 닿으면 페이지가 계속 세로로
       스크롤되도록 놓아 줍니다 — 안 그러면 이 구간에서 페이지가 잠깁니다. */
    elTl.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      var max = elTl.scrollWidth - elTl.clientWidth;
      if (max <= 0) return;
      var next = elTl.scrollLeft + e.deltaY;
      if ((next <= 0 && e.deltaY < 0) || (next >= max && e.deltaY > 0)) return;
      e.preventDefault();
      pan.taken = true;
      elTl.scrollLeft = next;
    }, { passive: false });
  }

  /* ---------- 진입점 ---------- */
  function init(data) {
    var host = document.querySelector('[data-timeline]');
    if (!host) return;

    /* 버튼(.tml)은 .scene__inner 안에, 스크롤 칸(.tml-stage)은 그 밖에 있습니다.
       (선이 화면 양 끝까지 뻗어야 해서 폭 제한을 안 받게 뺐습니다)
       그래서 조회 기준은 둘을 모두 품는 섹션이어야 합니다. */
    elRoot = host.closest('.scene') || document.body;

    t = SEN.i18n.t;
    esc = SEN.util.esc;

    history = SEN.util.pick(data, 'about.history');
    if (!history) return;

    elTl     = elRoot.querySelector('[data-tml-scroll]');
    elTrack  = elRoot.querySelector('[data-tml-track]');
    elAxis   = elRoot.querySelector('[data-tml-axis]');
    elArrow  = elRoot.querySelector('[data-tml-arrow]');
    elWalker = elRoot.querySelector('[data-tml-walker]');
    elEras   = host.querySelector('[data-tml-eras]');
    if (!elTl || !elTrack || !elEras) return;

    var labels = (history.groups || []).map(function (g) { return t(g.label); });
    selected = labels.indexOf(DEFAULT_ERA) > -1 ? DEFAULT_ERA : labels[labels.length - 1];

    draw();
    buildButtons();
    initDrag();
    watchSection();
    addEventListener('resize', draw);
  }

  /** 언어를 바꾸면 라벨·제목이 달라지므로 다시 그립니다 */
  function refresh(data) {
    if (!elRoot || !data) return;
    history = SEN.util.pick(data, 'about.history');
    draw();
    buildButtons();
  }

  SEN.timeline = { init: init, refresh: refresh };
})(window.SEN);
