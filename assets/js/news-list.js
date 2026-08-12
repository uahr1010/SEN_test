/* ==========================================================================
   news-list.js — news-list.html 전용 진입점

   홈페이지 뉴스 섹션의 "더 보기"를 누르면 오는 페이지입니다.
   전체 뉴스를 이미지 없는 카드(썸네일 영역 자체를 안 넣음 — 홈 목록과
   동일한 폼)로 보여주고, 분류 필터·쪽번호는 전부 ?cat=...&page=... 쿼리로 다루는
   평범한 <a> 링크입니다 (새로고침해도, 링크를 그대로 공유해도 같은 화면).
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var PAGE_SIZE = 9;

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

  function currentCat() {
    return new URLSearchParams(location.search).get('cat') || '';
  }
  function currentPage() {
    var n = parseInt(new URLSearchParams(location.search).get('page'), 10);
    return (n && n > 0) ? n : 1;
  }
  function pageHref(cat, page) {
    var q = [];
    if (cat) q.push('cat=' + encodeURIComponent(cat));
    if (page > 1) q.push('page=' + page);
    return 'news-list.html' + (q.length ? '?' + q.join('&') : '');
  }

  function cardHtml(it, t, esc, fmtDate, readMore) {
    var href = 'news.html?id=' + encodeURIComponent(it.id || '');
    return '' +
      '<a class="card reveal is-in" href="' + esc(href) + '">' +
        '<div class="card__body">' +
          '<div class="card__meta">' +
            (t(it.category) ? '<span class="card__cat">' + esc(t(it.category)) + '</span><span>·</span>' : '') +
            '<time datetime="' + esc(it.date || '') + '">' + esc(fmtDate(it.date)) + '</time>' +
          '</div>' +
          '<h3 class="card__title">' + esc(t(it.title)) + '</h3>' +
          '<p class="card__excerpt">' + esc(t(it.excerpt)) + '</p>' +
          '<span class="card__foot">' + esc(readMore) + '</span>' +
        '</div>' +
      '</a>';
  }

  function renderList(data) {
    var t = SEN.i18n.t, esc = SEN.util.esc, fmtDate = SEN.i18n.formatDate, pick = SEN.util.pick;

    var all = ((data.news && data.news.items) || []).slice()
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });

    // 분류 칩 — 홈페이지 칩과 달리 클릭이 아니라 링크입니다 (?cat=...)
    var labels = [];
    all.forEach(function (it) {
      var l = t(it.category);
      if (l && labels.indexOf(l) === -1) labels.push(l);
    });
    var cat = currentCat();
    var chipsHost = document.querySelector('[data-news-list-filter]');
    if (chipsHost) {
      if (labels.length < 2) {
        chipsHost.innerHTML = '';
      } else {
        var allLabel = esc(t(pick(data, 'site.ui.all')) || '전체');
        var chipsHtml = '<a class="chip' + (!cat ? ' is-on' : '') + '" href="' + pageHref('', 1) + '">' + allLabel + '</a>';
        chipsHtml += labels.map(function (l) {
          return '<a class="chip' + (cat === l ? ' is-on' : '') + '" href="' + esc(pageHref(l, 1)) + '">' + esc(l) + '</a>';
        }).join('');
        chipsHost.innerHTML = chipsHtml;
      }
    }

    var filtered = cat ? all.filter(function (it) { return t(it.category) === cat; }) : all;
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    var page = Math.min(currentPage(), totalPages);
    var pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    var readMore = t(pick(data, 'site.ui.readMore')) || '자세히 보기';
    var listHost = document.querySelector('[data-news-list]');
    if (listHost) {
      listHost.innerHTML = pageItems.length
        ? pageItems.map(function (it) { return cardHtml(it, t, esc, fmtDate, readMore); }).join('')
        : '<p class="state">' + esc(t(pick(data, 'site.ui.empty')) || '등록된 글이 없습니다.') + '</p>';
    }

    // 쪽번호
    var pagerHost = document.querySelector('[data-news-pager]');
    if (pagerHost) {
      if (totalPages <= 1) {
        pagerHost.innerHTML = '';
      } else {
        var items = [];
        for (var i = 1; i <= totalPages; i++) {
          items.push('<a class="pager__page' + (i === page ? ' is-on' : '') +
            '" href="' + esc(pageHref(cat, i)) + '"' +
            (i === page ? ' aria-current="page"' : '') + '>' + i + '</a>');
        }
        pagerHost.innerHTML = items.join('');
      }
    }
  }

  function boot() {
    SEN.i18n.init();

    loadContent().then(function (data) {
      SEN.util.mergeNewsI18n(data.news, data['news-i18n']);
      SEN.render(data);   // 헤더·네비·언어 스위처·푸터 등 공용 바인딩
      SEN.atlas.initLang();
      renderList(data);

      SEN.i18n.onChange(function () {
        SEN.render(data);
        renderList(data);
      });
    }).catch(function (err) {
      console.error('[SEN] 뉴스 목록을 불러오지 못했습니다:', err);
      var host = document.querySelector('[data-news-list]');
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
