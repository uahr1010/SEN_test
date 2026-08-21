/* ==========================================================================
   main.js — 진입점
   content/*.json 을 불러온 뒤 i18n → 렌더 → 네비 → 애니메이션 순으로 초기화합니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var FILES = ['site', 'about', 'news', 'news-i18n', 'projects', 'careers', 'sencoretech', 'sencoretech-data'];

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
          if (kind === 'news') return it.category === f;
          return (it.methods || []).indexOf(f) > -1;
        });
      }
      if (kind === 'news') {
        out.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      }
      return out.slice(0, this.limit[kind]);
    }
  };

  /* ---------- 콘텐츠 로딩 ----------
     projects 만 content/downloads/projects.json 에 따로 둡니다 — 4,575건이라
     Pages CMS의 구조화된 목록 폼으로 편집하기엔 너무 많아서, 관리자 화면에서는
     "다운로드해서 통째로 교체" 방식(미디어 라이브러리)으로 다루기로 했습니다.
     content/*.json 폴더 안의 다른 파일과 섞이지 않도록 별도 폴더에 둬서,
     그 미디어 항목에서 실수로 다른(구조화 폼으로 관리하는) 파일을 건드릴
     위험도 없앴습니다. */
  var FILE_PATHS = { projects: 'content/downloads/projects.json' };

  function loadContent() {
    return Promise.all(FILES.map(function (name) {
      var path = FILE_PATHS[name] || ('content/' + name + '.json');
      return fetch(path, { cache: 'no-cache' })
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

  /* ---------- 실적 지도 / 지구본 ----------
     content/projects.json(시/군/구 단위 익명화 목록)은 이미 loadContent()가
     한 번에 받아 왔습니다. 그 안의 projects 배열을 그대로 넘기기만 하고,
     여기서 다시 fetch 하지 않습니다(중복 요청 방지) — projects.js가
     좌우 통계 패널(.globe__stats/.regions)에 쓸 지역별 집계를 만듭니다.

     지도 자체(오른쪽 시각화)는 이 집계와 무관하게 자기 데이터를 따로
     불러옵니다: 국내 탭은 projectmap.js(MapLibre, assets/data/
     project_points.json — 번지 단위 정밀 좌표), 국외 탭은 globe.js(집계
     결과의 overseas.regions). 둘 다 한 번씩만 그리고, "국내/국외" 탭
     전환은 이미 그려진 두 시각화 중 하나를 숨기고 보이는 것뿐입니다
     (다시 그리지 않음) — renderProjectPanel() 이 그 일을 합니다. */
  SEN.projectPanel = { tab: 'domestic', data: null, ctx: null };

  function renderProjectPanel(tab) {
    var p = SEN.projectPanel;
    if (!p.data) return;
    p.tab = tab;

    var t = SEN.i18n.t;
    var ui = SEN.util.pick(p.ctx, 'projects.ui') || {};
    var elStats = document.querySelector('[data-globe-stats]');
    var elList = document.querySelector('[data-region-list]');
    var elHint = document.querySelector('[data-globe-hint]');
    var group = tab === 'overseas' ? p.data.overseas : p.data.domestic;

    if (elHint) {
      elHint.textContent = tab === 'overseas' ? (t(ui.dragHint) || '') : (t(ui.mapHint) || '');
    }
    if (elStats) {
      if (tab === 'domestic') {
        /* 국내 탭은 _전달_프로젝트지도 참고본과 같은 문구를 씁니다 —
           "1973년부터"는 회사 연혁상의 고정된 소개 문구이고, 뒤의 건수는
           projectmap.js가 project_points.json을 다 읽은 뒤 채워 넣습니다
           (data-pmap-count). 탭을 오갈 때마다 이 innerHTML을 다시 쓰므로,
           최초 채워지기 전이거나 이미 알고 있으면 SEN.projectMap.refresh()
           가 곧바로 다시 채웁니다. */
        elStats.innerHTML =
          '<div><dt>' + SEN.util.esc(t(ui.domesticAllTimeLabel) || '1973년부터 수행된 프로젝트') + '</dt><dd>' + SEN.util.esc(t(ui.domesticAllTimeValue) || '약 1만 1천건') + '</dd></div>' +
          '<div><dt>' + SEN.util.esc(t(ui.domesticRecentLabel) || '2016년~2026년간 수행된 프로젝트') + '</dt><dd data-pmap-count>—</dd></div>';
      } else {
        elStats.innerHTML = [
          [t(ui.totalLabel) || '누적 실적', group.total.toLocaleString() + (t(ui.unit) || '건')],
          [t(ui.regionLabel) || '수행 지역', group.regions.length + (t(ui.regionUnit) || '곳')]
        ].map(function (r) {
          return '<div><dt>' + SEN.util.esc(r[0]) + '</dt><dd>' + SEN.util.esc(r[1]) + '</dd></div>';
        }).join('');
      }
    }
    if (elList && tab === 'overseas') {
      /* 국내 탭의 오른쪽 칸은 이제 projectmap.js가 그리는 시/도 카드 →
         시/군/구 → 프로젝트 목록 패널([data-pmap-side])이 맡습니다. 이
         목록(.regions)은 국외 탭 전용입니다. */
      var shown = group.regions.slice(0, 12);
      var maxN = shown.reduce(function (m, r) { return Math.max(m, r.n); }, 1);
      elList.innerHTML = !shown.length ? '' : shown.map(function (r) {
        return '<li><span class="regions__name">' + SEN.util.esc(SEN.util.regionName(r.name)) + '</span>' +
               '<span class="regions__bar"><i style="width:' +
               Math.max(4, Math.round(r.n / maxN * 100)) + '%"></i></span>' +
               '<span class="regions__n">' + r.n + '</span></li>';
      }).join('');
    }

    document.querySelectorAll('[data-kmap-tab]').forEach(function (el) {
      el.hidden = el.getAttribute('data-kmap-tab') !== tab;
    });
    document.querySelectorAll('[data-proj-tab]').forEach(function (btn) {
      var on = btn.getAttribute('data-proj-tab') === tab;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', String(on));
    });

    /* 지도·지구본은 국내/국외 탭 중 하나에 가려진 채로 처음 그려지는데,
       가려진 상태로 초기화되면 크기를 못 잡아 텅 비어 보입니다. 그 탭이
       열릴 때마다 직접 알려줘서 다시 맞추게 합니다. */
    if (tab === 'overseas' && SEN.globe) SEN.globe.refresh();
    if (tab === 'domestic' && SEN.projectMap) SEN.projectMap.refresh();
  }
  SEN.renderProjectPanel = renderProjectPanel;

  function initProjects(data) {
    var kmapStage = document.querySelector('[data-pmap]');
    var globeStage = document.querySelector('[data-kmap-tab="overseas"]');
    if ((!kmapStage && !globeStage) || !SEN.projects) return;

    SEN.projects.load(SEN.util.pick(data, 'projects.projects') || []).then(function (res) {
      SEN.projectData = res;
      SEN.projectPanel.data = res;
      SEN.projectPanel.ctx = data;
      renderProjectPanel(SEN.projectPanel.tab);

      if (kmapStage && SEN.projectMap) {
        SEN.projectMap.init({
          wrap: kmapStage,
          canvas: kmapStage.querySelector('[data-pmap-canvas]'),
          back: kmapStage.querySelector('[data-pmap-back]'),
          legendMax: document.querySelector('[data-pmap-legend-max]'),
          side: document.querySelector('[data-pmap-side]')
        });
      }

      if (globeStage && SEN.globe) {
        /* 지구본은 국외 실적만 보여줍니다. res.regions 를 그대로 넘기면
           국내 지역까지 점으로 찍히므로, res.overseas 만 골라 넘깁니다
           (byProv 는 globe.js 가 더 이상 쓰지 않습니다 — 라벨을
           regions 에서 직접 만듭니다). */
        SEN.globe.init({ regions: res.overseas.regions }, {
          wrap: globeStage,
          pills: globeStage.querySelector('[data-globe-pills]'),
          tip: globeStage.querySelector('[data-globe-tip]')
        });
      }
    }).catch(function (err) {
      console.warn('[SEN] 실적 데이터를 불러오지 못했습니다:', err && err.message);
    });
  }

  /* ---------- 부팅 ---------- */
  function boot() {
    SEN.i18n.init();
    initImageFallback();

    loadContent().then(function (data) {
      SEN.data = data;
      SEN.util.mergeNewsI18n(data.news, data['news-i18n']);
      /* 센코어테크 순위·매출은 Pages CMS에서 편집할 수 있어야 해서
         고정 문구(content/sencoretech.json)와 값(content/
         sencoretech-data.json)을 서로 다른 파일로 나눠 뒀습니다 — 한
         파일에 같이 두면, CMS 폼을 저장할 때 폼에 없는 고정 문구
         필드까지 통째로 지워지는 사고가 나기 때문입니다(채용공고에서
         한 번 겪은 문제라 같은 방식을 피했습니다). 여기서 두 파일을
         하나로 합쳐 render.js는 늘 data.sencoretech 하나만 봅니다. */
      var scData = data['sencoretech-data'];
      if (data.sencoretech && scData) {
        data.sencoretech.rank = data.sencoretech.rank || {};
        if (scData.rank) {
          data.sencoretech.rank.current = scData.rank.current;
          data.sencoretech.rank.year = scData.rank.year;
        }
        if (scData.headcount) {
          data.sencoretech.headcount = data.sencoretech.headcount || {};
          data.sencoretech.headcount.total = scData.headcount.total;
          data.sencoretech.headcount.own = scData.headcount.own;
          data.sencoretech.headcount.partner = scData.headcount.partner;
        }
        data.sencoretech.yearly = scData.yearly || [];
      }

      SEN.render(data);
      applyMeta(data);

      SEN.controls.init();
      SEN.atlas.init();
      initProjects(data);
      if (SEN.hero) SEN.hero.init(data);
      if (SEN.timeline) SEN.timeline.init(data);   // 회사연혁 가로 타임라인
      // 등장 효과는 내용이 다 채워진 뒤에 켜야 높이 계산이 맞습니다
      if (SEN.reveal) SEN.reveal.init();

      // 언어 변경 시 전체 다시 렌더
      SEN.i18n.onChange(function () {
        SEN.render(SEN.data);
        applyMeta(SEN.data);
        renderProjectPanel(SEN.projectPanel.tab);   // 통계·지역 목록 라벨은 render() 대상이 아님
        if (SEN.timeline) SEN.timeline.refresh(SEN.data);   // 연혁도 render() 대상이 아님
      });

      scrollToHash();
    }).catch(function (err) {
      // 콘텐츠 없이도 네비게이션은 동작하도록
      SEN.data = {};
      SEN.controls.init();
      SEN.atlas.init();
      if (SEN.reveal) SEN.reveal.init();   // 실패해도 숨겨진 채로 남지 않도록
      showError(err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.SEN);
