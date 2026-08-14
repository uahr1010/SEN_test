/* ==========================================================================
   timeline.js — 회사연혁 가로 타임라인

   하나의 수평선 위에 연혁을 왼쪽에서 오른쪽으로 늘어놓습니다. 연도를
   고르거나 접고 펼치는 버튼은 없고, 모든 항목이 처음부터 다 보입니다.

     · 창립(1973)은 맨 왼쪽에 고정.
     · 1990 / 2000 / 2010 / 2020년대 경계마다 축을 가로지르는 세로선
       (.tml__decade)만 놓입니다 — 글자·개수 없는 장식용 구분자입니다.
       그 뒤로 그 연대의 항목들이 전부 이어붙습니다.
     · 선을 좌우로 끌어(드래그) 볼 수 있습니다.
     · 오른쪽 끝은 화살표. 마지막 항목보다 조금 더 뻗어 있고
       그 앞에 사람이 서 있습니다 (계속 나아가는 중이라는 표시).

   ▸ 자동 훑기
     섹션이 화면에 들어오면 1973 에서 잠깐 멈췄다가, 맨 끝까지
     미끄러진 뒤 멈춥니다. PC·모바일 모두 항상 펼쳐져 있어(접기/펼치기
     없음) 이 동작도 공통입니다.

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
  /* ================================================================== */

  var t, esc;
  var elRoot, elTl, elTrack, elAxis, elArrow, elWalker;
  var history = null;
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

    [].slice.call(elTrack.querySelectorAll('.tml__node, .tml__decade'))
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
      x += ERA;
      var decade = document.createElement('span');
      decade.className = 'tml__decade';
      decade.style.left = (x - GAP * 0.5) + 'px';
      frag.appendChild(decade);

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
      [].slice.call(elTrack.querySelectorAll('.tml__decade')).forEach(function (n) {
        n.classList.add('is-on');
      });
      elWalker.classList.add('is-on');
    });
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

    /* 휠(스크롤)로는 움직이지 않습니다 — 마우스 드래그로만 좌우로
       조절합니다. 세로 휠은 그대로 페이지를 내리도록 놓아 두되(막지
       않음), 트랙패드 가로 스와이프처럼 가로 방향 휠 입력만 막아서
       타임라인이 스크롤로 밀리지 않게 합니다. */
    elTl.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
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
