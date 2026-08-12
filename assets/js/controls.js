/* ==========================================================================
   controls.js — 목록 조작

   · 채용공고 아코디언 열고 닫기
   · 뉴스 분류 필터 칩 / "더 보기"

   둘 다 document 에 위임해 두었으므로, 다시 렌더링해도 재바인딩이 필요 없습니다.
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

  SEN.controls = { init: function () { initJobs(); initListControls(); } };
})(window.SEN);
