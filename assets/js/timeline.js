/* ==========================================================================
   timeline.js — 회사연혁 가로 타임라인 (아코디언)

   하나의 수평선 위에 연혁을 왼쪽에서 오른쪽으로 늘어놓습니다.

     · 창립(1973)은 맨 왼쪽에 고정. 접히지 않습니다.
     · 1990 / 2000 / 2010 / 2020년대는 선 위의 연대 이름(.tml__band)을
       눌러 여닫는 아코디언입니다 — 별도 선택 버튼 줄은 없습니다.
       펼치면 그 연대의 항목들이 오른쪽으로 이어붙어 선이 실제로
       길어지고, 접으면 다시 줄어듭니다. 기본으로 2020년대만 펼쳐져
       있습니다.
     · 선을 좌우로 끌어(드래그) 볼 수 있습니다.
     · 오른쪽 끝은 화살표. 마지막 항목보다 조금 더 뻗어 있고
       그 앞에 사람이 서 있습니다 (계속 나아가는 중이라는 표시).

   ▸ 자동 훑기
     섹션이 화면에 들어오면 1973 에서 잠깐 멈췄다가, 지금 펼쳐진
     범위의 끝까지 미끄러진 뒤 멈춥니다.

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
  var elRoot, elTl, elTrack, elAxis, elArrow, elWalker;
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
  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      var count = (g.items || []).length;

      x += ERA;
      var band = document.createElement('button');
      band.type = 'button';
      band.className = 'tml__band';
      band.style.left = (x - GAP * 0.5) + 'px';
      band.setAttribute('aria-expanded', open[label] ? 'true' : 'false');
      band.innerHTML =
        '<span class="tml__band-mark">' + (open[label] ? '−' : '+') + '</span>' +
        esc(label) + ' <span class="tml__band-n">' + count + '</span>';
      band.addEventListener('click', function () { toggleEra(label); });
      frag.appendChild(band);

      if (open[label]) {
        (g.items || []).forEach(function (it) { addNode(it, null); });
      }
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

  /** 연대를 여닫습니다. 펼칠 때는 새로 드러난 구간까지 부드럽게 스크롤합니다. */
  function toggleEra(label) {
    var wasOpen = !!open[label];
    open[label] = !wasOpen;
    draw();
    if (!wasOpen) {
      pan.taken = true;
      cancelAnimationFrame(pan.raf);
      requestAnimationFrame(function () {
        var max = elTl.scrollWidth - elTl.clientWidth;
        if (max <= 0) return;
        if (reduceMotion()) { elTl.scrollLeft = max; return; }
        elTl.scrollTo({ left: max, behavior: 'smooth' });
      });
    }
  }

  /* ---------- 자동 훑기 ----------
     1973 에서 멈췄다가 가속 → 감속하며 지금 펼쳐진 범위의 끝까지 미끄러집니다.
     scroll 이벤트로 위치를 재지 않고 우리가 쓰기만 하므로 스크롤이 끊기지 않습니다. */
  function ease(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  function startPan() {
    cancelAnimationFrame(pan.raf);
    pan.taken = false;

    if (reduceMotion()) {
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
        if (pan.taken) return;                  // 사용자가 잡거나 연대를 펼치면 손을 뗍니다
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

    /* 축 등(.tml-stage)은 .scene__inner 밖에 있습니다(선이 화면 양 끝까지
       뻗어야 해서 폭 제한을 안 받게 뺐습니다). 그래서 조회 기준은 둘을
       모두 품는 섹션이어야 합니다. */
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
    if (!elTl || !elTrack) return;

    (history.groups || []).forEach(function (g) {
      open[t(g.label)] = OPEN_BY_DEFAULT.indexOf(t(g.label)) > -1;
    });

    draw();
    initDrag();
    watchSection();
    addEventListener('resize', draw);
  }

  /** 언어를 바꾸면 라벨·제목이 달라지므로 다시 그립니다 */
  function refresh(data) {
    if (!elRoot || !data) return;
    history = SEN.util.pick(data, 'about.history');
    draw();
  }

  SEN.timeline = { init: init, refresh: refresh };
})(window.SEN);
