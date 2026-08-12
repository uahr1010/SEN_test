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

    document.addEventListener('click', function (e) {
      var applyBtn = e.target.closest('[data-apply]');
      if (applyBtn) { open(applyBtn); return; }

      if (e.target.closest('[data-apply-close]')) { close(); return; }

      // 메일 앱으로 넘어간 뒤에는 팝업을 닫아 둡니다
      if (e.target.closest('[data-apply-send]')) { close(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) close();
    });
  }

  function initListControls() {
    document.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-chip]');
      if (chip) {
        var kind = chip.getAttribute('data-chip');
        SEN.state.filter[kind] = chip.getAttribute('data-value') || null;
        SEN.state.limit[kind] = SEN.state.PAGE;
        SEN.render(SEN.data);
        return;
      }
      var more = e.target.closest('[data-more]');
      if (more) {
        var k = more.getAttribute('data-more');
        SEN.state.limit[k] += SEN.state.PAGE;
        SEN.render(SEN.data);
      }
    });
  }

  SEN.controls = { init: function () { initJobs(); initApplyModal(); initListControls(); } };
})(window.SEN);
