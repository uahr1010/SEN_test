/* ==========================================================================
   controls.js — 목록 조작

   · 채용공고 아코디언 열고 닫기
   · 뉴스 분류 필터 칩 / "더 보기"
   · 지원하기 팝업

   전부 document 에 위임해 두었으므로, 다시 렌더링해도 재바인딩이 필요 없습니다.
   (헤더·앵커·언어 토글 같은 화면 이동은 atlas.js 가 맡습니다)
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  function initJobs() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-job-toggle]');
      if (!btn) return;
      var job = btn.closest('[data-job]');
      var open = job.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---------- 지원하기 팝업 ----------
     실제 메일 발송은 서버 없이는 할 수 없어서(공개 저장소에 발송 자격증명을
     둘 수 없음), "지원하기" 를 누르면 이 팝업이 받는사람·공고명을 먼저
     보여주고, 팝업 안의 "메일 보내기" 는 평범한 mailto: 링크입니다 —
     클릭하면 사용자 자신의 메일 앱이 열립니다. */
  function initApplyModal() {
    var modal = document.querySelector('[data-apply-modal]');
    if (!modal) return;

    function open(btn) {
      modal.querySelector('[data-apply-job]').textContent = btn.getAttribute('data-apply-title') || '';
      modal.querySelector('[data-apply-to]').textContent = btn.getAttribute('data-apply-email') || '';
      modal.querySelector('[data-apply-send]').setAttribute('href', btn.getAttribute('data-apply-mailto') || '#');
      modal.hidden = false;
      document.body.classList.add('is-locked');
    }
    function close() {
      modal.hidden = true;
      document.body.classList.remove('is-locked');
    }

    /* mailto: 는 PC에 기본 메일 앱이 아예 설정돼 있지 않으면
       (Windows 에 흔한 상황) 클릭해도 아무 일도 일어나지 않습니다.
       그런 경우를 위한 대안으로 주소를 클립보드에 복사해 줍니다. */
    function copyEmail(btn) {
      var email = modal.querySelector('[data-apply-to]').textContent.trim();
      if (!email) return;
      var original = btn.textContent;
      var copiedLabel = SEN.i18n.t(SEN.util.pick(SEN.data || {}, 'site.ui.applyCopied')) || '복사됨';

      function done() {
        btn.textContent = copiedLabel;
        btn.classList.add('is-copied');
        setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('is-copied');
        }, 1600);
      }
      function legacyCopy() {
        var ta = document.createElement('textarea');
        ta.value = email;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* 조용히 무시 */ }
        document.body.removeChild(ta);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(done, legacyCopy);
      } else {
        legacyCopy();
      }
    }

    document.addEventListener('click', function (e) {
      var applyBtn = e.target.closest('[data-apply]');
      if (applyBtn) { open(applyBtn); return; }

      if (e.target.closest('[data-apply-close]')) { close(); return; }

      if (e.target.closest('[data-apply-send]')) {
        /* ⚠️ 여기서 close() 를 바로 부르지 마세요.
           mailto: 링크는 브라우저가 클릭을 처리하면서 외부 메일 앱으로
           넘기는 과정을 거치는데, 그 처리가 끝나기도 전에 팝업을
           display:none 으로 감춰 버리면 일부 브라우저(특히 Chrome 계열)가
           그 넘기는 동작 자체를 취소해 버립니다 — 메일 앱이 안 열리던
           원인이 바로 이것이었습니다. 다음 이벤트 루프로 미뤄서
           브라우저가 mailto: 처리를 먼저 끝내게 합니다. */
        setTimeout(close, 300);
        return;
      }

      if (e.target.closest('[data-apply-copy]')) {
        copyEmail(e.target.closest('[data-apply-copy]'));
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) close();
    });
  }

  /* ---------- 홈 뉴스 캐러셀 — 자동 스크롤 + 화살표 ----------
     카드 목록 뒤에 통째로 한 번 더 복제해 붙여 두고, 원본 폭만큼
     지나가면 그만큼 되돌리는 방식(마퀴 트릭)으로 끊김 없이 계속
     오른쪽으로 흐르게 합니다. 언어 전환/필터로 카드가 다시 그려질
     때마다 render.js 가 refreshNewsLoop() 를 불러 복제본을 새로
     만듭니다 — 애니메이션 루프 자체는 한 번만 시작해 계속 돕니다. */
  var newsLoopStarted = false;
  var newsAutoPaused = false;
  var newsResumeTimer = null;

  function refreshNewsLoop() {
    var track = document.querySelector('[data-news-track]');
    if (!track) return;

    Array.prototype.slice.call(track.querySelectorAll('[data-news-clone]')).forEach(function (el) { el.remove(); });
    var originals = Array.prototype.slice.call(track.children);
    if (!originals.length) return;
    originals.forEach(function (el) {
      var clone = el.cloneNode(true);
      clone.setAttribute('data-news-clone', '1');
      clone.setAttribute('tabindex', '-1');   // 복제본은 탭 이동에서 건너뜀
      track.appendChild(clone);
    });
    track.scrollLeft = 0;

    if (newsLoopStarted) return;
    newsLoopStarted = true;

    track.addEventListener('mouseenter', function () { newsAutoPaused = true; });
    track.addEventListener('mouseleave', function () { newsAutoPaused = false; });

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;   // 모션 최소화 설정이면 자동 스크롤은 아예 시작하지 않음

    /* 초당 24px — 참고 디자인(SEN_homepage.html)의 뉴스 마퀴 속도(v:-24)와 동일.
       프레임 간 시간차(dt)로 계산해 화면 주사율이 달라도 같은 속도로 보입니다
       (참고 파일의 nloop 도 같은 방식: r.x += r.v * dt). */
    var newsSpeed = 24;
    var lastTs = null;
    (function tick(now) {
      var t = document.querySelector('[data-news-track]');
      if (t && t.isConnected) {
        var dt = lastTs ? Math.min(0.05, (now - lastTs) / 1000) : 0;
        lastTs = now;
        if (!newsAutoPaused) {
          t.scrollLeft += newsSpeed * dt;
          var half = t.scrollWidth / 2;
          if (half > 0 && t.scrollLeft >= half) t.scrollLeft -= half;
        }
      } else {
        lastTs = null;
      }
      requestAnimationFrame(tick);
    })(performance.now());
  }

  function initNewsCarousel() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-news-arrow]');
      if (!btn) return;
      var track = document.querySelector('[data-news-track]');
      if (!track) return;
      var card = track.querySelector('.card');
      var step = (card ? card.getBoundingClientRect().width : 300) + 24;
      var dir = btn.getAttribute('data-news-arrow') === 'prev' ? -1 : 1;
      track.scrollBy({ left: dir * step, behavior: 'smooth' });

      /* 화살표를 누른 직후엔 자동 스크롤이 곧바로 되돌리지 않도록 잠깐 멈춤 */
      newsAutoPaused = true;
      clearTimeout(newsResumeTimer);
      newsResumeTimer = setTimeout(function () { newsAutoPaused = false; }, 2000);
    });
  }

  /* ---------- 프로젝트 국내/국외 탭 ---------- */
  function initProjTabs() {
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-proj-tab]');
      if (!tab || !SEN.renderProjectPanel) return;
      SEN.renderProjectPanel(tab.getAttribute('data-proj-tab'));
    });
  }

  /* ---------- 한국 지도 시/도 드릴다운 팝업 닫기 ----------
     여는 쪽(openDrill)은 kmap.js 담당, 닫는 쪽만 여기서 —
     지원하기 팝업과 같은 위임 클릭 패턴입니다. */
  function initKmapDrill() {
    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-kmap-drill-close]')) return;
      var drill = document.querySelector('[data-kmap-drill]');
      if (drill && SEN.kmap) SEN.kmap.closeDrill(drill);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var drill = document.querySelector('[data-kmap-drill]');
      if (drill && !drill.hidden && SEN.kmap) SEN.kmap.closeDrill(drill);
    });
  }

  /* "더 보기"는 이제 news-list.html로 이동하는 평범한 링크라 여기서
     따로 다룰 동작이 없습니다 — 칩 필터만 남았습니다. */
  function initListControls() {
    document.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-chip]');
      if (!chip) return;
      var kind = chip.getAttribute('data-chip');
      SEN.state.filter[kind] = chip.getAttribute('data-value') || null;
      SEN.state.limit[kind] = SEN.state.PAGE;
      SEN.render(SEN.data);
    });
  }

  SEN.controls = {
    init: function () {
      initJobs(); initApplyModal(); initListControls();
      initProjTabs(); initKmapDrill(); initNewsCarousel();
    },
    refreshNewsLoop: refreshNewsLoop
  };
})(window.SEN);
