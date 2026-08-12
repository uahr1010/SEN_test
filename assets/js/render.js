/* ==========================================================================
   render.js — content/*.json → DOM
   - data-bind      : 텍스트 한 개 바인딩
   - data-prose     : 줄바꿈 2번(\n\n)을 <p>로 쪼개서 바인딩
   - data-src       : 이미지 경로 바인딩
   - data-list      : 반복 목록 렌더링 (아래 RENDERERS 참고)
   - data-mail      : mailto: 링크 바인딩
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var t, tList, fmtDate;

  /* ---------- 유틸 ---------- */

  /** 'about.ceo.name' 같은 경로로 데이터를 꺼냅니다 */
  function pick(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o === null || o === undefined) ? undefined : o[k];
    }, obj);
  }

  /** XSS 방지용 이스케이프 */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * 자산 경로 정규화.
   * Pages CMS 는 '/uploads/images/a.jpg' 처럼 앞에 / 가 붙은 경로를 저장합니다.
   * GitHub Pages 프로젝트 페이지(user.github.io/repo/)에서도 깨지지 않도록
   * 사이트 기준 경로로 바꿔 줍니다.
   */
  function asset(p) {
    if (!p) return '';
    var s = String(p).trim();
    if (/^(https?:)?\/\//i.test(s) || s.indexOf('data:') === 0) return s;   // 외부 URL
    return s.replace(/^\/+/, '');                                          // 앞의 / 제거 → 상대경로
  }

  /** mailto: 링크 생성 */
  function mailto(email, subject, body) {
    if (!email) return '#';
    var q = [];
    if (subject) q.push('subject=' + encodeURIComponent(subject));
    if (body) q.push('body=' + encodeURIComponent(body));
    return 'mailto:' + email + (q.length ? '?' + q.join('&') : '');
  }

  /** 이미지 태그. 경로가 없으면 아무것도 넣지 않고
      컨테이너의 --ph 그라디언트 배경이 그대로 보이게 둡니다. */
  function imgTag(src, alt, cls) {
    if (!src) return '';
    return '<img src="' + esc(asset(src)) + '" alt="' + esc(alt || '') + '" loading="lazy"' +
           (cls ? ' class="' + cls + '"' : '') + '>';
  }

  /* ---------- 목록 렌더러 ---------- */
  /* key = index.html 의 data-list 값 */
  var RENDERERS = {

    /* 히어로 숫자 지표 */
    'site.hero.stats': function (items) {
      return items.map(function (it) {
        return '<li><b>' + esc(t(it.value)) + '</b><span>' + esc(t(it.label)) + '</span></li>';
      }).join('');
    },

    /* CEO 약력 */
    'about.ceo.career': function (items) {
      return items.map(function (it) { return '<li>' + esc(t(it)) + '</li>'; }).join('');
    },

    /* 회사연혁 타임라인 */
    'about.history.items': function (items) {
      return items.map(function (it, i) {
        return '' +
          '<li class="timeline__item reveal" data-delay="' + (i % 4) + '">' +
            '<div class="timeline__year">' + esc(t(it.year)) + '</div>' +
            '<div class="timeline__body">' +
              '<p class="timeline__title">' + esc(t(it.title)) + '</p>' +
              (t(it.desc) ? '<p class="timeline__desc">' + esc(t(it.desc)) + '</p>' : '') +
            '</div>' +
          '</li>';
      }).join('');
    },

    /* 주요공법 — 공법별 PDF 다운로드 버튼 포함 */
    'about.methods.items': function (items, ctx) {
      var label = t(pick(ctx, 'site.ui.downloadPdf')) || 'PDF 다운로드';
      var noPdf = t(pick(ctx, 'site.ui.pdfSoon')) || '자료 준비중';

      return items.map(function (it, i) {
        var points = tList(it.points).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
        var pdf = asset(it.pdf);
        var btn = pdf
          ? '<a class="btn btn--primary btn--sm" href="' + esc(pdf) + '" download>' +
              '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 15.5h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              esc(label) + '</a>'
          : '<span class="btn btn--ghost btn--sm" aria-disabled="true">' + esc(noPdf) + '</span>';

        return '' +
          '<article class="method reveal" data-delay="' + (i % 4) + '">' +
            '<div class="method__thumb">' + imgTag(it.image, t(it.name)) + '</div>' +
            '<div class="method__body">' +
              (it.code ? '<span class="method__code">' + esc(it.code) + '</span>' : '') +
              '<h4 class="method__name">' + esc(t(it.name)) + '</h4>' +
              (t(it.summary) ? '<p class="method__summary">' + esc(t(it.summary)) + '</p>' : '') +
              (points ? '<ul class="method__points">' + points + '</ul>' : '') +
              '<div class="method__foot">' + btn + '</div>' +
            '</div>' +
          '</article>';
      }).join('');
    },

    /* 국내외 사업장 */
    'about.contact.offices': function (items) {
      return items.map(function (it, i) {
        var meta = [];
        if (it.tel)   meta.push('<span>TEL <a href="tel:' + esc(String(it.tel).replace(/[^\d+]/g, '')) + '">' + esc(it.tel) + '</a></span>');
        if (it.fax)   meta.push('<span>FAX ' + esc(it.fax) + '</span>');
        if (it.email) meta.push('<span><a href="' + esc(mailto(it.email)) + '">' + esc(it.email) + '</a></span>');

        return '' +
          '<div class="office reveal" data-delay="' + (i % 4) + '">' +
            (t(it.tag) ? '<p class="office__tag">' + esc(t(it.tag)) + '</p>' : '') +
            '<h4 class="office__name">' + esc(t(it.name)) + '</h4>' +
            '<p class="office__addr">' + esc(t(it.address)) + '</p>' +
            (meta.length ? '<div class="office__meta">' + meta.join('') + '</div>' : '') +
          '</div>';
      }).join('');
    },

    /* 뉴스 카드 — 클릭하면 news.html?id=... 상세 페이지로 이동합니다.
       (외부 원문 링크가 있어도 카드 자체는 내부 상세 페이지를 열고,
       원문은 상세 페이지 안의 "원문 보기" 버튼으로 뺍니다) */
    'news.items': function (items, ctx) {
      var readMore = t(pick(ctx, 'site.ui.readMore')) || '자세히 보기';
      if (!items.length) return '<p class="state">' + esc(t(pick(ctx, 'site.ui.empty')) || '등록된 글이 없습니다.') + '</p>';

      return items.map(function (it, i) {
        var href = 'news.html?id=' + encodeURIComponent(it.id || '');
        return '' +
          '<a class="card reveal" data-delay="' + (i % 4) + '" href="' + esc(href) + '">' +
            '<div class="card__thumb">' + imgTag(it.image, t(it.title)) + '</div>' +
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
      }).join('');
    },

    /* 채용 - 인재상 */
    'careers.values': function (items) {
      return items.map(function (it, i) {
        return '' +
          '<div class="value reveal" data-delay="' + (i % 4) + '">' +
            '<span class="value__num">0' + (i + 1) + '</span>' +
            '<h4 class="value__title">' + esc(t(it.title)) + '</h4>' +
            '<p class="value__desc">' + esc(t(it.desc)) + '</p>' +
          '</div>';
      }).join('');
    },

    /* 채용 - 공고 아코디언 (지원하기 → mailto) */
    'careers.jobs': function (items, ctx) {
      var careers = ctx.careers || {};
      var ui = (ctx.site && ctx.site.ui) || {};
      var applyLabel = t(ui.apply) || '지원하기';
      var reqLabel = t(careers.requirementsLabel) || '자격 요건';
      var prefLabel = t(careers.preferredLabel) || '우대 사항';
      var dueLabel = t(careers.deadlineLabel) || '마감';
      var mailBody = t(careers.applyMailBody) || '';

      if (!items.length) return '<p class="state">' + esc(t(ui.empty) || '진행 중인 채용이 없습니다.') + '</p>';

      return items.map(function (it, i) {
        var email = it.email || careers.applyEmail;
        var subject = (t(careers.applyMailSubject) || '[입사지원] {job}').replace('{job}', t(it.title));

        var badges = [];
        if (t(it.team))     badges.push('<span class="job__badge">' + esc(t(it.team)) + '</span>');
        if (t(it.type))     badges.push('<span class="job__badge">' + esc(t(it.type)) + '</span>');
        if (t(it.location)) badges.push('<span class="job__badge">' + esc(t(it.location)) + '</span>');
        if (it.deadline)    badges.push('<span class="job__badge job__badge--due">' + esc(dueLabel) + ' ' + esc(fmtDate(it.deadline)) + '</span>');

        var req = tList(it.requirements).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
        var pref = tList(it.preferred).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');

        return '' +
          '<article class="job reveal" data-delay="' + (i % 4) + '" data-job>' +
            '<button class="job__head" type="button" aria-expanded="false" data-job-toggle>' +
              '<span class="job__title">' + esc(t(it.title)) + '</span>' +
              '<span class="job__badges">' + badges.join('') + '</span>' +
              '<span class="job__toggle" aria-hidden="true"></span>' +
            '</button>' +
            '<div class="job__panel"><div><div class="job__inner">' +
              (t(it.description) ? '<p class="job__desc">' + esc(t(it.description)) + '</p>' : '') +
              '<div class="job__cols">' +
                (req  ? '<div><p class="job__coltitle">' + esc(reqLabel)  + '</p><ul class="job__list">' + req  + '</ul></div>' : '') +
                (pref ? '<div><p class="job__coltitle">' + esc(prefLabel) + '</p><ul class="job__list">' + pref + '</ul></div>' : '') +
              '</div>' +
              '<a class="btn btn--primary" href="' + esc(mailto(email, subject, mailBody)) + '">' +
                '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 5.5h15v9h-15z" stroke="currentColor" stroke-width="1.5"/><path d="m2.5 6 7.5 5 7.5-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
                esc(applyLabel) + '</a>' +
            '</div></div></div>' +
          '</article>';
      }).join('');
    },

    /* 채용 - 전형 절차 */
    'careers.process': function (items) {
      return items.map(function (it, i) {
        return '' +
          '<li class="process__item reveal" data-delay="' + (i % 4) + '">' +
            '<p class="process__title">' + esc(t(it.title)) + '</p>' +
            '<p class="process__desc">' + esc(t(it.desc)) + '</p>' +
          '</li>';
      }).join('');
    }
  };

  /* ---------- 메인 렌더 ---------- */
  function render(ctx) {
    t = SEN.i18n.t; tList = SEN.i18n.tList; fmtDate = SEN.i18n.formatDate;

    // 1) 단일 텍스트 바인딩
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      var v = pick(ctx, el.getAttribute('data-bind'));
      var s = t(v);
      if (s) el.textContent = s;
    });

    // 2) 문단 바인딩 (\n\n → <p>)
    document.querySelectorAll('[data-prose]').forEach(function (el) {
      var s = t(pick(ctx, el.getAttribute('data-prose')));
      el.innerHTML = s.split(/\n{2,}/).filter(Boolean)
        .map(function (p) { return '<p>' + esc(p.trim()) + '</p>'; }).join('');
    });

    // 3) 이미지 바인딩
    document.querySelectorAll('[data-src]').forEach(function (el) {
      var src = asset(t(pick(ctx, el.getAttribute('data-src'))));
      if (src) { el.src = src; el.removeAttribute('hidden'); }
      else { el.style.display = 'none'; }
    });

    // 4) mailto 바인딩
    document.querySelectorAll('[data-mail]').forEach(function (el) {
      var email = t(pick(ctx, el.getAttribute('data-mail')));
      el.setAttribute('href', mailto(email, t(pick(ctx, 'site.ui.mailSubject'))));
    });
    document.querySelectorAll('[data-mailtext]').forEach(function (el) {
      el.textContent = t(pick(ctx, el.getAttribute('data-mailtext')));
    });

    // 5) 목록 렌더링
    Object.keys(RENDERERS).forEach(function (key) {
      var host = document.querySelector('[data-list="' + key + '"]');
      if (!host) return;
      var raw = pick(ctx, key);
      var items = Array.isArray(raw) ? raw : [];

      // 뉴스/프로젝트는 필터 + 더보기 상태를 적용
      if (key === 'news.items')     items = SEN.state.applyList('news', items);

      host.innerHTML = RENDERERS[key](items, ctx);
    });

    // 6) 뉴스/프로젝트 필터 칩
    buildChips(ctx, 'news', '[data-newsfilter]', function (it) { return t(it.category); });

    // 7) 더보기 버튼 표시 여부
    ['news'].forEach(function (kind) {
      var btn = document.querySelector('[data-more="' + kind + '"]');
      if (!btn) return;
      btn.parentElement.hidden = !SEN.state.hasMore(kind, pick(ctx, kind + '.items') || []);
    });
  }

  function buildChips(ctx, kind, selector, getLabel) {
    var host = document.querySelector(selector);
    if (!host) return;
    var all = pick(ctx, kind + '.items') || [];
    var labels = [];
    all.forEach(function (it) {
      var l = getLabel(it);
      if (l && labels.indexOf(l) === -1) labels.push(l);
    });
    if (labels.length < 2) { host.innerHTML = ''; return; }

    var allLabel = t(pick(ctx, 'site.ui.all')) || '전체';
    var active = SEN.state.filter[kind];
    var html = '<button type="button" class="chip' + (!active ? ' is-on' : '') +
               '" data-chip="' + kind + '" data-value="">' + esc(allLabel) + '</button>';
    html += labels.map(function (l) {
      return '<button type="button" class="chip' + (active === l ? ' is-on' : '') +
             '" data-chip="' + kind + '" data-value="' + esc(l) + '">' + esc(l) + '</button>';
    }).join('');
    host.innerHTML = html;
  }

  SEN.render = render;
  SEN.util = { pick: pick, esc: esc, asset: asset, mailto: mailto };
})(window.SEN);
