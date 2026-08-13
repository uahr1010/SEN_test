/* ==========================================================================
   timeline.js — 회사연혁 가로 타임라인

   하나의 수평선 위에 연혁을 왼쪽에서 오른쪽으로 늘어놓습니다.

     · 창립(1973)은 맨 왼쪽에 고정. 접히지 않습니다.
     · 1990 / 2000 / 2010 / 2020년대는 버튼으로 여닫습니다.
       펼치면 그 연대의 항목들이 오른쪽으로 이어붙어 선이 실제로 길어집니다.
     · 선을 좌우로 끌어(드래그) 볼 수 있습니다.
     · 오른쪽 끝은 화살표. 마지막 항목보다 조금 더 뻗어 있고
       그 앞에 사람이 서 있습니다 (계속 나아가는 중이라는 표시).

   ▸ 자동 훑기
     섹션이 화면에 들어오면 1973 에서 잠깐 멈췄다가, 빠르게 미끄러져
     현재(맨 오른쪽)까지 이동한 뒤 멈춥니다.
     페이지를 열자마자 돌리면 사용자가 위쪽에 있어서 못 보고 지나칩니다.

   ▸ 데이터
     content/about.json 의 history 는 main.js 가 이미 받아 왔습니다.
     여기서 다시 fetch 하지 않고 SEN.data 를 그대로 씁니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  /* ====== 조정값 ==================================================== */
  var PAD_LEFT  = 90;      // 왼쪽 여백 (창립 항목이 놓이는 지점)
  var HOLD      = 1100;    // 1973 에서 멈춰 있는 시간(ms)
  var SWEEP_MIN = 900;     // 훑는 데 걸리는 최소 시간(ms)
  var SWEEP_MAX = 2200;    // 최대 시간. 전부 펼쳐도 이 안에 도착합니다
  var OPEN_BY_DEFAULT = ['2020년대'];   // 처음부터 펼쳐 둘 연대
  /* ================================================================== */

  var t, esc;
  var elRoot, elTl, elTrack, elAxis, elArrow, elWalker, elEras;
  var history = null;
  var open = {};
  var pan = { raf: 0, taken: false };
  var started = false;

  function cssPx(name) {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
  }
  function when(it) {
    return [t(it.year), t(it.month)].filter(Boolean).join('. ');
  }

  /* ---------- 그리기 ---------- */
  function draw() {
    if (!history) return;

    [].slice.call(elTrack.querySelectorAll('.tml__node, .tml__band'))
      .forEach(function (n) { n.remove(); });

    var GAP  = cssPx('--tml-gap');
    var ERA  = cssPx('--tml-era-gap');
    var TAIL = cssPx('--tml-tail');

    var x = PAD_LEFT, i = 0;
    var frag = document.createDocumentFragment();

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
      if (!open[label]) return;                 // 접혀 있으면 통째로 건너뜀

      x += ERA;
      var band = document.createElement('div');
      band.className = 'tml__band';
      band.style.left = (x - GAP * 0.5) + 'px';
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

  /* ---------- 연대 버튼 ---------- */
  function buildButtons() {
    elEras.innerHTML = '';
    (history.groups || []).forEach(function (g) {
      var label = t(g.label);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tml-era';
      b.setAttribute('aria-pressed', open[label] ? 'true' : 'false');
      b.innerHTML = '<span class="tml-era__mark">' + (open[label] ? '−' : '+') + '</span>' +
                    '<span>' + esc(label) + '</span>' +
                    '<span class="tml-era__n">' + (g.items || []).length + '</span>';
      b.addEventListener('click', function () {
        open[label] = !open[label];
        buildButtons();
        draw();
        startPan();     // 길이가 달라졌으니 처음부터 다시 훑습니다
      });
      elEras.appendChild(b);
    });
  }

  /* ---------- 자동 훑기 ----------
     1973 에서 멈췄다가 가속 → 감속하며 끝까지 미끄러집니다.
     scroll 이벤트로 위치를 재지 않고 우리가 쓰기만 하므로 스크롤이 끊기지 않습니다. */
  function ease(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  function startPan() {
    cancelAnimationFrame(pan.raf);
    pan.taken = false;

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elTl.scrollLeft = 0;
      return;
    }

    requestAnimationFrame(function () {
      elTl.scrollLeft = 0;
      var max = elTl.scrollWidth - elTl.clientWidth;
      if (max <= 4) return;

      var dur = Math.max(SWEEP_MIN, Math.min(SWEEP_MAX, max * 0.35));
      var t0 = null;

      function step(ts) {
        if (pan.taken) return;                  // 사용자가 잡으면 손을 뗍니다
        if (t0 === null) t0 = ts;
        var e = ts - t0;
        if (e < HOLD) { pan.raf = requestAnimationFrame(step); return; }
        var p = Math.min(1, (e - HOLD) / dur);
        elTl.scrollLeft = max * ease(p);
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

    (history.groups || []).forEach(function (g) {
      open[t(g.label)] = OPEN_BY_DEFAULT.indexOf(t(g.label)) > -1;
    });

    buildButtons();
    draw();
    initDrag();
    watchSection();
    addEventListener('resize', draw);
  }

  /** 언어를 바꾸면 라벨·제목이 달라지므로 다시 그립니다 */
  function refresh(data) {
    if (!elRoot || !data) return;
    history = SEN.util.pick(data, 'about.history');
    buildButtons();
    draw();
  }

  SEN.timeline = { init: init, refresh: refresh };
})(window.SEN);
