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

  /** +,− 로 여닫는 묶음 하나. CEO 약력과 회사연혁이 같은 모양을 씁니다.
      g.open 이 true 면 펼친 채로 시작합니다. */
  function accordion(g, inner) {
    var head = '<b class="acc__label">' + esc(t(g.label)) + '</b>' +
               (t(g.headline) ? '<span class="acc__headline">' + esc(t(g.headline)) + '</span>' : '');
    return '<details class="acc__group"' + (g.open ? ' open' : '') + '>' +
             '<summary>' + head + '</summary>' + inner +
           '</details>';
  }

  /* ---------- 연혁 가로 타임라인(hline) ----------
     수평선 하나 위에 항목을 왼쪽→오른쪽으로 놓고, 선의 위·아래에 번갈아 답니다.

     ▸ 칸은 항목 수만큼 등분(--n)하고, 카드는 자기 칸의 2배 폭을 씁니다.
       위·아래가 번갈아 붙으므로 같은 쪽 이웃은 두 칸 떨어져 있고,
       따라서 카드가 칸을 넘어 옆으로 퍼져도 서로 겹치지 않습니다.
       (칸 하나 폭 그대로 쓰면 11건짜리 연대에서 제목이 예닐곱 줄로 쪼개집니다)

     ▸ <li> 는 display:contents 라 카드와 점이 격자에 직접 놓입니다.
       카드는 1행(위) 또는 3행(아래), 점은 2행(선 위)에 들어갑니다. */
  function hline(items) {
    var n = items.length;
    if (!n) return '';

    var cells = items.map(function (it, i) {
      var side = (i % 2 === 0) ? 'up' : 'down';
      var when = [t(it.year), t(it.month)].filter(Boolean).join(' · ');
      var col = ' style="grid-column:' + (i + 1) + '"';
      /* 양 끝 카드는 2칸 폭이면 격자 밖으로 삐져나갑니다.
         1.5칸으로 줄여 안쪽에 붙이면 같은 쪽 이웃과도 여전히 안 겹칩니다. */
      var edge = (n === 1) ? ' hline__item--solo'
               : (i === 0) ? ' hline__item--first'
               : (i === n - 1) ? ' hline__item--last' : '';
      return '' +
        '<li class="hline__item hline__item--' + side + edge + '">' +
          '<div class="hline__card"' + col + '>' +
            '<p class="hline__when">' + esc(when) + '</p>' +
            '<p class="hline__title">' + esc(t(it.title)) + '</p>' +
            (t(it.desc) ? '<p class="hline__desc">' + esc(t(it.desc)) + '</p>' : '') +
          '</div>' +
          '<span class="hline__dot"' + col + ' aria-hidden="true"></span>' +
        '</li>';
    }).join('');

    return '<div class="hline"><ol class="hline__track" style="--n:' + n + '">' +
             '<span class="hline__axis" aria-hidden="true"></span>' + cells +
           '</ol></div>';
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

    /* CEO 약력 — 약력 / 자격 / 주요 수상경력 / 저서 를 각각 +,− 로 여닫습니다.
       처음에는 모두 접혀 있습니다 (JSON 에서 "open": true 로 두면 펼친 채로 시작). */
    'about.ceo.careerGroups': function (groups) {
      return groups.map(function (g) {
        var lis = tList(g.items).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
        return accordion(g, '<ul class="acc__list">' + lis + '</ul>');
      }).join('');
    },

    /* 회사연혁 — 항상 보이는 창립 한 줄.
       연대 모듈과 같은 모양을 쓰되 펼칠 내용이 없으므로 +,− 는 달지 않습니다. */
    'about.history.pinned': function (items) {
      return items.map(function (it) {
        var sub = [t(it.month), t(it.title)].filter(Boolean).join(' · ');
        /* label 을 적어 두면 그대로 씁니다 ("1973년"처럼 언어별 표기가 필요할 때).
           없으면 year 를 그대로 보여 줍니다. */
        return '' +
          '<div class="era era--origin">' +
            '<div class="era__head">' +
              '<b class="era__label">' + esc(t(it.label) || t(it.year)) + '</b>' +
              '<span class="era__headline">' + esc(sub) + '</span>' +
            '</div>' +
          '</div>';
      }).join('');
    },

    /* 회사연혁 — 연대 하나가 가로 타임라인 하나.
       연대 이름은 모두 왼쪽에 크게, 열면 그 연대의 수평선이 펼쳐집니다. */
    'about.history.groups': function (groups) {
      return groups.map(function (g) {
        return '' +
          '<details class="era"' + (g.open ? ' open' : '') + '>' +
            '<summary class="era__head">' +
              '<b class="era__label">' + esc(t(g.label)) + '</b>' +
              (t(g.headline) ? '<span class="era__headline">' + esc(t(g.headline)) + '</span>' : '') +
            '</summary>' +
            hline(g.items || []) +
          '</details>';
      }).join('');
    },

    /* 주요공법 — 개별 공법 PDF는 없고, 전체를 아우르는 브로슈어는
       섹션 제목 옆의 언어 선택 박스(index.html에 고정 마크업)로 받습니다. */
    'about.methods.items': function (items) {
      return items.map(function (it, i) {
        var points = tList(it.points).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');

        return '' +
          '<article class="method reveal" data-delay="' + (i % 4) + '">' +
            '<div class="method__thumb">' + imgTag(it.image, t(it.name)) + '</div>' +
            '<div class="method__body">' +
              (it.code ? '<span class="method__code">' + esc(it.code) + '</span>' : '') +
              '<h4 class="method__name">' + esc(t(it.name)) + '</h4>' +
              (t(it.summary) ? '<p class="method__summary">' + esc(t(it.summary)) + '</p>' : '') +
              (points ? '<ul class="method__points">' + points + '</ul>' : '') +
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
              '<button type="button" class="btn btn--primary" data-apply' +
                ' data-apply-title="' + esc(t(it.title)) + '"' +
                ' data-apply-email="' + esc(email || '') + '"' +
                ' data-apply-mailto="' + esc(mailto(email, subject, mailBody)) + '">' +
                '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 5.5h15v9h-15z" stroke="currentColor" stroke-width="1.5"/><path d="m2.5 6 7.5 5 7.5-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
                esc(applyLabel) + '</button>' +
            '</div></div></div>' +
          '</article>';
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

  /* "성남시분당구" 처럼 시/도 GeoJSON 원본에 공백 없이 붙어 있는
     "OO시XX구(군)" 형태의 지역명을 화면에 보여줄 때만 "OO시 XX구"로
     띄어 씁니다. 매칭에 쓰는 원본 키(geo.json/kmap.json)는 건드리지 않고,
     화면에 표시하는 문자열에만 적용하세요. */
  function regionName(s) {
    return String(s || '').replace(/([가-힣]+시)([가-힣]+[구군])$/, '$1 $2');
  }

  SEN.render = render;
  SEN.util = { pick: pick, esc: esc, asset: asset, mailto: mailto, regionName: regionName };
})(window.SEN);
