/* ==========================================================================
   controls.js — 목록 조작

   · 채용공고 아코디언 열고 닫기
   · 홈 뉴스 스포트라이트(한 번에 기사 하나, 자동 전환) / "더 보기"
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
     보여주고, 팝업 안의 "메일 보내기" 가 실제 메일 작성 화면을 엽니다.
     PC는 기본 메일 앱이 아예 없는 경우가 흔해서(Windows) mailto: 를
     눌러도 아무 반응이 없는 문제가 있었습니다 — PC는 Gmail 웹 작성
     화면을 새 탭으로 열고, 모바일은(기기에 메일 앱이 있는 게 보통이라)
     그대로 mailto: 를 씁니다. */
  function initApplyModal() {
    var modal = document.querySelector('[data-apply-modal]');
    if (!modal) return;

    function isMobile() { return !!(window.matchMedia && matchMedia('(max-width: 760px)').matches); }

    function gmailComposeURL(email, subject, body) {
      if (!email) return '#';
      var q = ['view=cm', 'fs=1', 'to=' + encodeURIComponent(email)];
      if (subject) q.push('su=' + encodeURIComponent(subject));
      if (body) q.push('body=' + encodeURIComponent(body));
      return 'https://mail.google.com/mail/?' + q.join('&');
    }

    function open(btn) {
      var email = btn.getAttribute('data-apply-email') || '';
      modal.querySelector('[data-apply-job]').textContent = btn.getAttribute('data-apply-title') || '';
      modal.querySelector('[data-apply-to]').textContent = email;

      var sendA = modal.querySelector('[data-apply-send]');
      if (isMobile()) {
        sendA.setAttribute('href', btn.getAttribute('data-apply-mailto') || '#');
        sendA.removeAttribute('target');
        sendA.removeAttribute('rel');
      } else {
        sendA.setAttribute('href', gmailComposeURL(
          email, btn.getAttribute('data-apply-subject') || '', btn.getAttribute('data-apply-body') || ''
        ));
        sendA.setAttribute('target', '_blank');
        sendA.setAttribute('rel', 'noopener');
      }

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

  /* ---------- 홈 뉴스 스포트라이트 ----------
     기사를 한 번에 2장씩, 가로로 나란히 보여주는 슬라이드 캐러셀입니다.
     화살표(또는 5초마다 자동)를 누르면 1장씩 밀리며 넘어가는데, "다음"은
     왼쪽으로, "이전"은 오른쪽으로 — 방향에 따라 반대로 밀립니다.
     render.js가 맨 앞뒤에 처음/마지막 몇 장을 복제해 두었으므로(순환에
     필요한 만큼만), 끝에 닿으면 트랜지션이 끝난 뒤(transitionend) 티
     안 나게 반대쪽 같은 위치로 순간 이동시켜 무한히 순환하는 것처럼
     보이게 합니다. */
  var NEWS_VISIBLE = 2;
  var newsPos = 0;         // 지금 왼쪽에 보이는 카드의 렌더링상 위치
  var newsRealCount = 0;   // 복제본을 뺀 실제 기사 수
  var newsLooping = false; // 실제 기사가 2장보다 많아 복제본이 있는지
  var newsAnimating = false;
  var newsSnapTimer = null;
  var newsPaused = false;
  var newsResumeTimer = null;
  var newsTickStarted = false;

  function newsTrack() { return document.querySelector('[data-news-track]'); }
  function newsCardEls() {
    var track = newsTrack();
    return track ? Array.prototype.slice.call(track.children) : [];
  }

  /* 카드 사이 gap(var(--sp-3))이 있어서 "칸 폭의 몇 %" 로 계산하면
     한 칸씩 밀 때마다 gap만큼 오차가 쌓입니다 — 실제로 렌더링된 카드
     폭 + gap을 픽셀 단위로 재서 그만큼 밉니다. */
  function newsStepPx() {
    var track = newsTrack();
    var first = track && track.firstElementChild;
    if (!first) return 0;
    var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return first.getBoundingClientRect().width + gap;
  }

  function placeNews(pos, animate) {
    var track = newsTrack();
    if (!track) return;
    if (!animate) track.style.transition = 'none';
    track.style.transform = 'translateX(-' + (pos * newsStepPx()) + 'px)';
    if (!animate) {
      void track.offsetWidth; // 강제 리플로우 후 트랜지션을 되살립니다
      track.style.transition = '';
    }
  }

  /* render.js가 news.items 를 다시 그릴 때마다(최초 로드·언어 전환) 부릅니다. */
  function refreshNewsSpotlight() {
    clearTimeout(newsSnapTimer);
    var cards = newsCardEls();
    newsRealCount = cards.filter(function (c) { return !c.hasAttribute('data-clone-of'); }).length;
    newsLooping = cards.length > newsRealCount;
    newsAnimating = false;
    newsPos = newsLooping ? NEWS_VISIBLE : 0;
    placeNews(newsPos, false);
  }

  /* dir: 다음이면 +1(왼쪽으로 밀림), 이전이면 -1(오른쪽으로 밀림) */
  function newsGo(dir) {
    var cards = newsCardEls();
    if (newsAnimating || cards.length <= NEWS_VISIBLE) return;
    var next = newsPos + dir;
    if (!newsLooping) {
      var max = cards.length - NEWS_VISIBLE;
      next = Math.max(0, Math.min(max, next));
      if (next === newsPos) return;
    }
    newsAnimating = true;
    newsPos = next;
    placeNews(newsPos, true);
    /* transitionend가 어떤 이유로든(탭이 백그라운드에 있는 동안 등)
       안 오더라도 캐러셀이 영영 멈춰있지 않도록, 트랜지션 시간(.5s)보다
       살짝 긴 안전장치를 같이 걸어둡니다 — 둘 중 먼저 온 쪽이 처리하고
       나머지는 finishNewsMove의 newsAnimating 체크로 조용히 무시됩니다. */
    clearTimeout(newsSnapTimer);
    newsSnapTimer = setTimeout(finishNewsMove, 600);
  }

  function finishNewsMove() {
    if (!newsAnimating) return;
    clearTimeout(newsSnapTimer);
    newsAnimating = false;
    if (!newsLooping) return;
    if (newsPos >= newsRealCount + NEWS_VISIBLE) {
      newsPos -= newsRealCount;
      placeNews(newsPos, false);
    } else if (newsPos < NEWS_VISIBLE) {
      newsPos += newsRealCount;
      placeNews(newsPos, false);
    }
  }

  function onNewsTransitionEnd(e) {
    if (e.target === newsTrack() && e.propertyName === 'transform') finishNewsMove();
  }

  function initNewsSpotlight() {
    var host = document.querySelector('.news-spotlight');
    if (host) {
      host.addEventListener('mouseenter', function () { newsPaused = true; });
      host.addEventListener('mouseleave', function () { newsPaused = false; });
    }
    var track = newsTrack();
    if (track) track.addEventListener('transitionend', onNewsTransitionEnd);

    document.addEventListener('click', function (e) {
      var arrow = e.target.closest('[data-news-arrow]');
      if (!arrow) return;
      newsGo(arrow.getAttribute('data-news-arrow') === 'prev' ? -1 : 1);
      /* 화살표를 누른 직후엔 자동 전환이 곧바로 다시 넘기지 않도록 잠깐 멈춤 */
      newsPaused = true;
      clearTimeout(newsResumeTimer);
      newsResumeTimer = setTimeout(function () { newsPaused = false; }, 4000);
    });

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || newsTickStarted) return;   // 모션 최소화 설정이면 자동 전환은 아예 시작하지 않음
    newsTickStarted = true;

    setInterval(function () {
      if (!newsPaused && !document.hidden) newsGo(1);
    }, 5000);
  }

  /* ---------- 프로젝트 국내/국외 탭 ---------- */
  function initProjTabs() {
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-proj-tab]');
      if (!tab || !SEN.renderProjectPanel) return;
      SEN.renderProjectPanel(tab.getAttribute('data-proj-tab'));
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
      initProjTabs(); initNewsSpotlight();
    },
    refreshNewsSpotlight: refreshNewsSpotlight
  };
})(window.SEN);
