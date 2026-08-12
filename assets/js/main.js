/* ==========================================================================
   main.js — 진입점
   content/*.json 을 불러온 뒤 i18n → 렌더 → 네비 → 애니메이션 순으로 초기화합니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var FILES = ['site', 'about', 'news', 'projects', 'careers'];

  /* ---------- 목록 상태 (필터 · 더보기) ---------- */
  SEN.state = {
    PAGE: 6,
    limit:  { news: 6, projects: 6 },
    filter: { news: null, projects: null },

    /** 필터와 개수 제한을 적용한 목록을 돌려줍니다 */
    applyList: function (kind, items) {
      var f = this.filter[kind];
      var out = items.slice();

      if (f) {
        out = out.filter(function (it) {
          if (kind === 'news') return SEN.i18n.t(it.category) === f;
          return (it.methods || []).indexOf(f) > -1;
        });
      }
      if (kind === 'news') {
        out.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      }
      return out.slice(0, this.limit[kind]);
    },

    hasMore: function (kind, items) {
      var f = this.filter[kind];
      var total = f
        ? items.filter(function (it) {
            if (kind === 'news') return SEN.i18n.t(it.category) === f;
            return (it.methods || []).indexOf(f) > -1;
          }).length
        : items.length;
      return total > this.limit[kind];
    }
  };

  /* ---------- 콘텐츠 로딩 ---------- */
  function loadContent() {
    return Promise.all(FILES.map(function (name) {
      return fetch('content/' + name + '.json', { cache: 'no-cache' })
        .then(function (res) {
          if (!res.ok) throw new Error(name + '.json (' + res.status + ')');
          return res.json();
        })
        .then(function (json) { return [name, json]; });
    })).then(function (pairs) {
      var data = {};
      pairs.forEach(function (p) { data[p[0]] = p[1]; });
      return data;
    });
  }

  /* ---------- SEO/메타 갱신 ---------- */
  function applyMeta(data) {
    var t = SEN.i18n.t;
    var title = t(SEN.util.pick(data, 'site.seo.title'));
    var desc = t(SEN.util.pick(data, 'site.seo.description'));
    if (title) {
      document.title = title;
      var ogt = document.querySelector('meta[property="og:title"]');
      if (ogt) ogt.setAttribute('content', title);
    }
    if (desc) {
      var m = document.querySelector('meta[name="description"]');
      if (m) m.setAttribute('content', desc);
      var ogd = document.querySelector('meta[property="og:description"]');
      if (ogd) ogd.setAttribute('content', desc);
    }
  }

  /* ---------- 오류 안내 ---------- */
  function showError(err) {
    var box = document.createElement('div');
    box.className = 'site-error';
    box.innerHTML =
      '<strong>콘텐츠를 불러오지 못했습니다.</strong><br>' +
      '파일을 브라우저로 직접 열면(file://) JSON을 읽을 수 없습니다. ' +
      '터미널에서 <code>python -m http.server 8000</code> 을 실행한 뒤 ' +
      '<code>http://localhost:8000</code> 으로 접속해 주세요.<br>' +
      '<small>' + SEN.util.esc(err && err.message ? err.message : err) + '</small>';
    document.body.appendChild(box);
    console.error('[SEN] content load failed:', err);
  }

  /* ---------- 최초 진입 시 해시 위치 보정 ---------- */
  function scrollToHash() {
    if (!location.hash) return;
    var el = document.querySelector(location.hash);
    if (!el) return;
    var header = document.querySelector('[data-header]');
    requestAnimationFrame(function () {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight - 1 : 0),
        behavior: 'auto'
      });
    });
  }

  /* ---------- 이미지 로드 실패 처리 ----------
     사진이 아직 업로드되지 않았을 때 깨진 아이콘 대신
     컨테이너의 블루 그라디언트 배경이 보이도록 감춥니다.
     (error 이벤트는 버블링되지 않으므로 캡처 단계에서 받습니다) */
  function initImageFallback() {
    document.addEventListener('error', function (e) {
      var el = e.target;
      if (el && el.tagName === 'IMG') el.classList.add('is-missing');
    }, true);
  }

  /* ---------- 실적 지구본 ----------
     content/projects.json 은 이미 loadContent() 가 한 번에 받아 왔습니다.
     그 안의 projects 배열(공개 위치만 담긴 목록)을 그대로 넘기기만 하고,
     여기서 다시 fetch 하지 않습니다 (중복 요청 방지).
     주소 → 좌표 변환과 집계는 projects.js, 그리기는 globe.js 가 맡습니다.
     여기서는 둘을 잇고, 지구본이 못 뜨더라도 남아야 할 숫자·목록을 그립니다. */
  function initGlobe(data) {
    var stage = document.querySelector('[data-globe]');
    if (!stage || !SEN.projects) return;

    var t = SEN.i18n.t;
    var ui = SEN.util.pick(data, 'projects.ui') || {};
    var elStats = document.querySelector('[data-globe-stats]');
    var elList = document.querySelector('[data-region-list]');
    var elHint = document.querySelector('[data-globe-hint]');

    SEN.projects.load(SEN.util.pick(data, 'projects.projects') || []).then(function (res) {
      SEN.projectData = res;

      if (elHint) elHint.textContent = t(ui.dragHint) || '';

      if (elStats) {
        elStats.innerHTML = [
          [t(ui.totalLabel) || '누적 실적', res.placed.toLocaleString() + (t(ui.unit) || '건')],
          [t(ui.regionLabel) || '수행 지역', res.regions.length + (t(ui.regionUnit) || '곳')]
        ].map(function (r) {
          return '<div><dt>' + SEN.util.esc(r[0]) + '</dt><dd>' + SEN.util.esc(r[1]) + '</dd></div>';
        }).join('');
      }

      if (elList) {
        elList.innerHTML = res.regions.slice(0, 12).map(function (r) {
          return '<li><span class="regions__name">' + SEN.util.esc(r.name) + '</span>' +
                 '<span class="regions__bar"><i style="width:' +
                 Math.max(4, Math.round(r.n / res.regions[0].n * 100)) + '%"></i></span>' +
                 '<span class="regions__n">' + r.n + '</span></li>';
        }).join('');
      }

      return SEN.globe.init(res, {
        wrap: stage,
        pills: stage.querySelector('[data-globe-pills]'),
        tip: stage.querySelector('[data-globe-tip]')
      });
    }).catch(function (err) {
      console.warn('[SEN] 실적 데이터를 불러오지 못했습니다:', err && err.message);
      if (elHint) elHint.textContent = '';
    });
  }

  /* ---------- 부팅 ---------- */
  function boot() {
    SEN.i18n.init();
    initImageFallback();

    loadContent().then(function (data) {
      SEN.data = data;

      SEN.render(data);
      applyMeta(data);

      SEN.controls.init();
      SEN.atlas.init();
      initGlobe(data);

      // 언어 변경 시 전체 다시 렌더
      SEN.i18n.onChange(function () {
        SEN.render(SEN.data);
        applyMeta(SEN.data);
      });

      scrollToHash();
    }).catch(function (err) {
      // 콘텐츠 없이도 네비게이션은 동작하도록
      SEN.data = {};
      SEN.controls.init();
      SEN.atlas.init();
      showError(err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.SEN);
