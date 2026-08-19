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

  /* ---------- 홈 뉴스 스포트라이트 (2개, 가로로 나란히) ----------
     카카오톡으로 받은 참고 컴포넌트(reference/news-animated-testimonials-
     reference.txt, Aceternity의 AnimatedTestimonials)의 "사진이 살짝
     겹쳐 쌓여있다가 지금 차례인 것만 정면으로 나오고, 몇 초마다 자동으로
     다음 기사로 넘어가는" 구성은 그대로 두고, 이 스포트라이트를 두 개
     가로로 나란히 배치했습니다(index.html의 data-news-instance="0"/"1").
     실제 카드 목록은 render.js가 첫 번째(0번)에만 그려주므로, 두 번째의
     내용은 첫 번째 것을 그대로 복제해 채웁니다 — 이후로는 두 인스턴스가
     각자 자기 카드들 안에서 독립적으로 .is-active 를 옮겨 다니며 서로
     다른 기사를 보여줍니다(두 번째는 처음부터 한 칸 밀어서 시작). */
  var newsState = {}; // instance id -> { index, paused, resumeTimer, tickStarted }

  function newsHosts() {
    return Array.prototype.slice.call(document.querySelectorAll('.news-spotlight[data-news-instance]'));
  }
  function newsTrackOf(host) { return host.querySelector('[data-news-track]'); }
  function newsCardsOf(host) {
    var track = newsTrackOf(host);
    return track ? Array.prototype.slice.call(track.querySelectorAll('.card')) : [];
  }

  function setNewsIndex(host, i) {
    var cards = newsCardsOf(host);
    if (!cards.length) return;
    var id = host.getAttribute('data-news-instance');
    var idx = ((i % cards.length) + cards.length) % cards.length;
    if (newsState[id]) newsState[id].index = idx;
    cards.forEach(function (card, k) { card.classList.toggle('is-active', k === idx); });
  }

  /* render.js가 첫 번째 인스턴스의 news.items 를 다시 그릴 때마다(최초
     로드·언어 전환) 부릅니다 — 두 번째 인스턴스로 내용을 복제하고,
     두 인스턴스 모두 보여줄 기사를 다시 잡습니다. */
  function refreshNewsSpotlight() {
    var hosts = newsHosts();
    if (!hosts.length) return;
    var sourceTrack = newsTrackOf(hosts[0]);
    hosts.forEach(function (host, i) {
      if (i === 0 || !sourceTrack) return;
      var track = newsTrackOf(host);
      if (track) track.innerHTML = sourceTrack.innerHTML;
    });
    hosts.forEach(function (host, i) {
      var id = host.getAttribute('data-news-instance');
      if (!newsState[id]) newsState[id] = { index: 0, paused: false, resumeTimer: null, tickStarted: false };
      var count = newsCardsOf(host).length;
      setNewsIndex(host, count ? i % count : 0); // 두 번째 인스턴스는 한 칸 밀어서 시작 → 서로 다른 기사
    });
  }

  function initNewsSpotlight() {
    var hosts = newsHosts();
    if (!hosts.length) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    hosts.forEach(function (host) {
      var id = host.getAttribute('data-news-instance');
      if (!newsState[id]) newsState[id] = { index: 0, paused: false, resumeTimer: null, tickStarted: false };
      host.addEventListener('mouseenter', function () { newsState[id].paused = true; });
      host.addEventListener('mouseleave', function () { newsState[id].paused = false; });

      if (!reduceMotion && !newsState[id].tickStarted) {
        newsState[id].tickStarted = true;
        setInterval(function () {
          var st = newsState[id];
          if (!st.paused && !document.hidden && newsCardsOf(host).length > 1) setNewsIndex(host, st.index + 1);
        }, 5000);
      }
    });

    document.addEventListener('click', function (e) {
      var arrow = e.target.closest('[data-news-arrow]');
      if (!arrow) return;
      var host = arrow.closest('[data-news-instance]');
      if (!host) return;
      var id = host.getAttribute('data-news-instance');
      var st = newsState[id];
      setNewsIndex(host, st.index + (arrow.getAttribute('data-news-arrow') === 'prev' ? -1 : 1));
      /* 화살표를 누른 직후엔 자동 전환이 곧바로 다시 넘기지 않도록 잠깐 멈춤 */
      st.paused = true;
      clearTimeout(st.resumeTimer);
      st.resumeTimer = setTimeout(function () { st.paused = false; }, 4000);
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
