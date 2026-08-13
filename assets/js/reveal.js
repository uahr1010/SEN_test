/* ==========================================================================
   reveal.js — 스크롤로 화면에 들어오면 내용이 아래에서 떠오르는 등장 효과

   [data-reveal] 이 붙은 요소가 화면에 들어오면 .is-in 을 붙입니다.
   실제 움직임은 components.css 의 [data-reveal] 규칙이 담당합니다.

   ▸ 왜 IntersectionObserver 인가
     scroll 이벤트로 매 프레임 위치를 재면 스크롤이 끊깁니다.
     브라우저가 대신 감시해 주는 IntersectionObserver 를 씁니다.

   ▸ 다시 내려오면 다시 재생 (REPLAY)
     맨 밑까지 갔다가 위로 올라와 다시 내려오면 또 떠오릅니다.
     되살리는 시점이 중요합니다 — 요소가 "화면 아래로 완전히 빠졌을 때"만
     원위치로 되돌립니다. 화면에 조금이라도 걸쳐 있을 때 되돌리면
     보고 있는 글자가 눈앞에서 사라져 고장난 것처럼 보입니다.

     위로 스크롤할 때는 되돌리지 않습니다. 이미 읽은 내용이 위에서
     사라졌다 나타나면 산만하기만 합니다.

   ▸ 같은 묶음 안에서는 차례로
     한 섹션 안의 여러 요소가 동시에 튀어나오면 부자연스럽습니다.
     같은 섹션끼리 순서대로 지연을 줘서 줄줄이 따라 들어오게 합니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var STEP = 90;      // 같은 섹션 안에서 다음 요소가 늦게 나오는 간격(ms)
  var MAX_STEP = 4;   // 지연 단계 상한. 더 늘리면 마지막 요소가 너무 늦게 뜹니다
  var REPLAY = true;  // false 로 두면 처음 한 번만 나타나고 다시 재생되지 않습니다

  function init() {
    var items = [].slice.call(document.querySelectorAll('[data-reveal]'));
    if (!items.length) return;

    /* 여기까지 왔다는 건 스크립트가 살아 있다는 뜻입니다. 이때만 숨김을 켭니다.
       (components.css 의 숨김 규칙이 .js-reveal 에 걸려 있습니다)
       스크립트가 죽으면 플래그가 안 붙어 내용이 그냥 보입니다. */
    document.documentElement.classList.add('js-reveal');

    /* 모션을 줄이는 설정이거나, 관찰 기능이 없는 낡은 브라우저에서는
       애니메이션 없이 바로 보여 줍니다. 안 그러면 내용이 영영 안 보입니다. */
    var reduce = window.matchMedia &&
                 window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    // 섹션별로 몇 번째 요소인지 세어 지연 단계를 매깁니다
    var seen = {};
    items.forEach(function (el) {
      var sec = el.closest('.scene');
      var key = sec ? (sec.id || 'x') : 'root';
      var n = seen[key] = (seen[key] || 0);
      seen[key] = n + 1;
      el.style.transitionDelay = (Math.min(n, MAX_STEP) * STEP) + 'ms';
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); return; }

        /* 여기부터는 화면 밖으로 나간 경우입니다.
           boundingClientRect 는 "진짜 화면" 기준이라, 아래 rootMargin 으로
           줄여 놓은 관찰 범위와 무관하게 실제 위치를 판단할 수 있습니다. */
        if (REPLAY && e.boundingClientRect.top >= innerHeight) {
          /* 화면 아래로 완전히 빠졌을 때만 원위치. 다시 내려오면 또 떠오릅니다.
             조금이라도 걸쳐 있을 때 되돌리면 보고 있는 글자가 사라져 보입니다. */
          e.target.classList.remove('is-in');
          return;
        }

        /* 위로 지나가 버린 경우 — 켠 상태로 둡니다.
           앵커 이동이나 빠른 스크롤로 "보이는 상태"를 한 번도 안 거치고
           건너뛰면, 지나친 요소가 숨은 채 남기 때문입니다. */
        if (e.boundingClientRect.top < 0) e.target.classList.add('is-in');
      });
    }, {
      /* 아래에서 12% 정도 올라왔을 때 시작 — 화면 맨 밑에서 터지면
         사용자가 못 보고 지나칩니다. */
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.05
    });

    /* REPLAY 를 켜면 계속 감시해야 하므로 unobserve 하지 않습니다.
       요소가 20개 남짓이라 성능에는 영향이 없습니다. */
    items.forEach(function (el) { io.observe(el); });

    /* 첫 화면에 이미 들어와 있는 요소는 관찰을 기다리지 않고 바로 켭니다
       (관찰 콜백이 한 박자 늦게 와서 깜빡이는 것을 막습니다) */
    requestAnimationFrame(function () {
      items.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in');
      });
    });
  }

  SEN.reveal = { init: init };
})(window.SEN);
