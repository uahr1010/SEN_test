/* ==========================================================================
   timeline.js — 회사연혁 가로 타임라인

   하나의 수평선 위에 연혁을 왼쪽에서 오른쪽으로 늘어놓습니다.

     · 창립(1973)은 맨 왼쪽에 고정.
     · 1990 / 2000 / 2010 / 2020년대 경계마다 연대 글자(예: "1990년대")와
       크고 진한 동그라미(.tml__decade)가 트랙 맨 위쪽에 놓입니다. 이
       동그라미를 누르면 그 연대의 항목들을 접고 펼 수 있습니다(펼치면
       동그라미가 파랗게 채워집니다). 개수는 표시하지 않습니다.
     · 선을 좌우로 끌어(드래그) 볼 수 있습니다.
     · 오른쪽 끝은 화살표. 마지막 항목보다 조금 더 뻗어 있고
       그 앞에 사람이 서 있습니다 (계속 나아가는 중이라는 표시).

   ▸ 접기는 그 연대 것만
     동그라미를 누르면 딱 그 연대의 항목만 접히거나 펼쳐집니다. 다른
     연대(동그라미 포함)에는 전혀 영향이 없습니다 — 동그라미 자체는
     접히든 펼치든 항상 그 자리에 그대로 있고, 접으면 그 연대 항목이
     차지하던 만큼만 선이 짧아집니다. 단, 가장 마지막(최근) 연대는
     접혀 있어도 그 연대의 마지막(=가장 최신) 항목 하나는 계속 보여
     줍니다 — 접자마자 최신 소식까지 안 보이면 허전해서입니다.

   ▸ 기본 펼침 상태
     PC는 모든 연대가 펼쳐진 채로 시작합니다. 좁은 화면(760px 이하)은
     전부 접힌 채로 시작합니다 — 접힌 연대끼리는 화면 폭만큼씩 떨어뜨려
     둬서, 오른쪽 끝으로 스크롤하면 가장 최근 연대의 동그라미 하나만
     화면에 보입니다(다른 동그라미는 존재하지만 스크롤해야 나옵니다).

   ▸ 자동 훑기
     섹션이 화면에 들어오면 1973 에서 잠깐 멈췄다가, 지금 펼쳐진 범위의
     끝까지 미끄러진 뒤 멈춥니다.

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
  var DECADE_TOP    = 6;   // 연대 글자가 시작하는 위치 (트랙 맨 위 쪽 — 위로 뻗는 항목 글과 안 겹치도록)
  var DECADE_LABEL_H = 20; // 연대 글자 한 줄이 차지하는 대략의 높이
  var DECADE_GAP     = 8;  // 글자와 세로선 사이 간격 (CSS .tml__decade-line 의 margin-top 과 같은 값)
  var NARROW_LEAD = 1.2;   // 좁은 화면에서 접힌 채 시작할 때, 맨 앞에 화면 너비의 이만큼을 여백으로 둬서 오른쪽 끝만 보이게 함
  var NARROW_ERA_EXTRA = 0.8; // 좁은 화면에서 접힌 연대끼리 화면 너비의 이만큼씩 떨어뜨려, 한 화면엔 하나만 보이게 함
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
  function isNarrow() {
    return window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
  }

  /* ---------- 그리기 ---------- */
  function draw() {
    if (!history) return;

    [].slice.call(elTrack.querySelectorAll('.tml__node, .tml__decade'))
      .forEach(function (n) { n.remove(); });

    var GAP   = cssPx('--tml-gap');
    var ERA   = cssPx('--tml-era-gap');
    var TAIL  = cssPx('--tml-tail');
    var AXISY = cssPx('--tml-axis-y');
    /* 동그라미는 음수 margin-top으로 세로선 끝에 겹쳐 중심을 맞추므로
       (자기 지름은 서로 상쇄되어) 계산에 지름 값 자체는 필요 없습니다 —
       라벨 높이 + 간격 + 이 세로선 길이 = 축까지의 거리만 맞추면 됩니다. */
    var DECADE_LINE_H = Math.max(0, AXISY - DECADE_TOP - DECADE_LABEL_H - DECADE_GAP);

    var groups = history.groups || [];
    var narrow = isNarrow();
    var lead = narrow ? Math.round(elTl.clientWidth * NARROW_LEAD) : 0;
    var eraExtra = narrow ? Math.round(elTl.clientWidth * NARROW_ERA_EXTRA) : 0;

    var x = PAD_LEFT + lead, i = 0;
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

    groups.forEach(function (g, gi) {
      var label = t(g.label);
      var isLastGroup = gi === groups.length - 1;

      x += ERA;
      if (narrow && !open[label]) x += eraExtra;   // 접힌 연대끼리는 화면 폭만큼 떨어뜨립니다
      var decade = document.createElement('button');
      decade.type = 'button';
      decade.className = 'tml__decade';
      decade.style.left = (x - GAP * 0.5) + 'px';
      decade.setAttribute('aria-expanded', open[label] ? 'true' : 'false');
      decade.innerHTML =
        '<span class="tml__decade-label">' + esc(label) + '</span>' +
        '<span class="tml__decade-line" style="height:' + DECADE_LINE_H + 'px"></span>' +
        '<span class="tml__decade-dot"></span>';
      decade.addEventListener('click', function () { toggleEra(label); });
      frag.appendChild(decade);

      if (open[label]) {
        (g.items || []).forEach(function (it) { addNode(it, null); });
      } else if (isLastGroup && g.items && g.items.length) {
        /* 가장 마지막 연대는 접혀 있어도 최신 소식 하나(마지막 항목)는
           계속 보여 줍니다 — 접자마자 최신 소식까지 안 보이면 허전합니다. */
        addNode(g.items[g.items.length - 1], null);
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
      [].slice.call(elTrack.querySelectorAll('.tml__decade')).forEach(function (n) {
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
      elTl.scrollLeft = elTl.scrollWidth - elTl.clientWidth;
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
      if (e.target.closest('.tml__decade')) return;   // 동그라미 클릭은 드래그로 취급하지 않습니다(클릭이 먹히도록)
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

    /* PC는 전부 펼친 채로 시작하고, 좁은 화면은 전부 접은 채로 시작합니다
       (동그라미는 접혀도 항상 존재 — draw()가 접힌 연대끼리 화면 폭만큼
       떨어뜨려서, 오른쪽 끝으로 스크롤하면 결과적으로 맨 오른쪽 하나만
       보이게 됩니다). */
    var startOpen = !isNarrow();
    (history.groups || []).forEach(function (g) {
      open[t(g.label)] = startOpen;
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
