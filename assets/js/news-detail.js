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
    return Promise.all(['site', 'news', 'news-i18n'].map(function (name) {
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

    /* 탭 제목 뒤에 붙는 사이트명은 site.company.name 이 아니라 site.seo.title 을
       씁니다. index.html 의 탭 제목과 같은 값 하나를 공유해, 문구를 바꿀 때
       site.json 한 곳만 고치면 두 페이지가 같이 바뀌도록 하기 위함입니다. */
    var siteName = t(pick(data, 'site.seo.title')) || 'Senkuzo / SEN Engineering Group';

    if (!item) {
      host.innerHTML = '<p class="article__empty">' +
        esc(t(pick(data, 'site.ui.notFound')) || '요청하신 뉴스를 찾을 수 없습니다.') + '</p>';
      document.title = siteName;
      return;
    }

    var title = t(item.title);
    document.title = title + ' — ' + siteName;

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

    var shareLabel = esc(t(pick(data, 'site.ui.share')) || '공유하기');
    var shareCopiedLabel = esc(t(pick(data, 'site.ui.shareCopied')) || '링크가 복사되었습니다');
    var share =
      '<div class="article__share-wrap">' +
        '<button type="button" class="article__share" data-share aria-label="' + shareLabel + '">' +
          '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
            '<circle cx="15" cy="5" r="2.2" stroke="currentColor" stroke-width="1.4"/>' +
            '<circle cx="15" cy="15" r="2.2" stroke="currentColor" stroke-width="1.4"/>' +
            '<circle cx="5" cy="10" r="2.2" stroke="currentColor" stroke-width="1.4"/>' +
            '<path d="M7 8.8 13 5.8M7 11.2 13 14.2" stroke="currentColor" stroke-width="1.4"/>' +
          '</svg>' +
        '</button>' +
        '<span class="article__share-toast" data-share-toast hidden>' + shareCopiedLabel + '</span>' +
      '</div>';

    var catLabel = SEN.util.categoryLabel(item.category, data);
    host.innerHTML =
      '<div class="article__meta">' +
        (catLabel ? '<span class="article__cat">' + esc(catLabel) + '</span><span>·</span>' : '') +
        '<time datetime="' + esc(item.date || '') + '">' + esc(fmtDate(item.date)) + '</time>' +
        share +
      '</div>' +
      '<h1 class="article__title">' + esc(title) + '</h1>' +
      hero +
      '<div class="article__body">' + (body || '') + '</div>' +
      original;
  }

  /* 공유 버튼 — 모바일처럼 navigator.share 를 지원하는 브라우저는
     OS 공유시트(카톡·메시지 등 앱으로 바로 전달)를 띄우고, 그렇지 않은
     대부분의 데스크톱 브라우저는 링크를 클립보드에 복사합니다.
     .article__meta 가 언어 전환마다 통째로 다시 그려지므로(innerHTML 교체),
     버튼에 직접 붙이지 않고 document 에 위임해 재바인딩이 필요 없게 합니다. */
  function initShare() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-share]');
      if (!btn) return;

      var url = location.href;

      /* PC는 navigator.share 를 지원해도 그냥 링크만 복사합니다 —
         터치 기반 기기(pointer: coarse)일 때만 OS 공유시트(앱으로 전달)를 씁니다.
         창 너비가 아니라 실제 입력 방식으로 판단해, 데스크톱 창을 좁혀도
         공유시트가 뜨지 않습니다. */
      var isMobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (isMobile && navigator.share) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
        return;
      }

      var toast = btn.parentElement.querySelector('[data-share-toast]');
      function done() {
        if (!toast) return;
        toast.hidden = false;
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(function () { toast.hidden = true; }, 1800);
      }
      function legacyCopy() {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* 조용히 무시 */ }
        document.body.removeChild(ta);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, legacyCopy);
      } else {
        legacyCopy();
      }
    });
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
    initShare();

    loadContent().then(function (data) {
      SEN.util.mergeNewsI18n(data.news, data['news-i18n']);
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
