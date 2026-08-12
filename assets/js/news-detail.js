/* ==========================================================================
   news-detail.js — news.html 전용 진입점

   ?id=... 로 넘어온 값으로 content/news.json 에서 해당 기사를 찾아 그립니다.
   헤더·푸터 문구는 index.html 과 똑같이 render.js 의 render() 로 그리므로,
   문구를 바꾸려면 content/site.json 하나만 고치면 두 페이지가 같이 바뀝니다.

   본문은 카드 목록에서 3줄로 잘려 보이는 news.items[].excerpt 를
   자르지 않고 그대로 보여주는 것입니다 — 별도의 "본문" 필드가 따로 있는 게
   아니라, excerpt 자체가 전체 글입니다. 카드에서는 CSS(line-clamp)로만
   3줄까지 잘라 보이고, 데이터는 항상 전체가 들어 있습니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  function loadContent() {
    return Promise.all(['site', 'news'].map(function (name) {
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

  function findItem(data) {
    var id = new URLSearchParams(location.search).get('id');
    var items = (data.news && data.news.items) || [];
    return items.filter(function (it) { return it.id === id; })[0] || null;
  }

  function renderArticle(item, data) {
    var host = document.querySelector('[data-article]');
    if (!host) return;
    var t = SEN.i18n.t, esc = SEN.util.esc, asset = SEN.util.asset;
    var pick = SEN.util.pick, fmtDate = SEN.i18n.formatDate;

    if (!item) {
      host.innerHTML = '<p class="article__empty">' +
        esc(t(pick(data, 'site.ui.notFound')) || '요청하신 뉴스를 찾을 수 없습니다.') + '</p>';
      document.title = 'SEN Engineering Group';
      return;
    }

    var title = t(item.title);
    var company = t(pick(data, 'site.company.name'));
    document.title = company ? title + ' — ' + company : title;

    var descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute('content', t(item.excerpt).slice(0, 140));
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);

    var body = t(item.excerpt).split(/\n{2,}/).filter(Boolean)
      .map(function (p) { return '<p>' + esc(p.trim()) + '</p>'; }).join('');

    var hero = item.image
      ? '<div class="article__hero"><img src="' + esc(asset(item.image)) + '" alt="' + esc(title) + '" loading="lazy"></div>'
      : '';

    var original = item.link
      ? '<a class="btn btn--ghost article__link" href="' + esc(item.link) + '" target="_blank" rel="noopener">' +
          esc(t(pick(data, 'site.ui.viewOriginal')) || '원문 보기') +
        '</a>'
      : '';

    host.innerHTML =
      '<div class="article__meta">' +
        (t(item.category) ? '<span class="article__cat">' + esc(t(item.category)) + '</span><span>·</span>' : '') +
        '<time datetime="' + esc(item.date || '') + '">' + esc(fmtDate(item.date)) + '</time>' +
      '</div>' +
      '<h1 class="article__title">' + esc(title) + '</h1>' +
      hero +
      '<div class="article__body">' + (body || '') + '</div>' +
      original;
  }

  /* 사진이 아직 업로드되지 않았거나 경로가 잘못됐을 때, 깨진 이미지 아이콘 대신
     .article__hero 의 --ph 그라디언트 배경이 보이도록 감춥니다.
     (index.html 의 main.js 에 있는 것과 같은 처리입니다. error 이벤트는
     버블링되지 않으므로 캡처 단계에서 받습니다) */
  function initImageFallback() {
    document.addEventListener('error', function (e) {
      var el = e.target;
      if (el && el.tagName === 'IMG') el.classList.add('is-missing');
    }, true);
  }

  function boot() {
    SEN.i18n.init();
    initImageFallback();

    loadContent().then(function (data) {
      SEN.render(data);
      SEN.atlas.initLang();

      var item = findItem(data);
      renderArticle(item, data);

      SEN.i18n.onChange(function () {
        SEN.render(data);
        renderArticle(item, data);
      });
    }).catch(function (err) {
      console.error('[SEN] 뉴스를 불러오지 못했습니다:', err);
      var host = document.querySelector('[data-article]');
      if (host) {
        host.innerHTML = '<p class="article__empty">콘텐츠를 불러오지 못했습니다. ' +
          '<code>python -m http.server 8000</code> 으로 접속했는지 확인해 주세요.</p>';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.SEN);
