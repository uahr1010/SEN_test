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

  /** youtu.be/ID, watch?v=ID, /embed/ID 링크에서 11자리 영상 ID만 뽑아냅니다 */
  function youtubeId(url) {
    if (!url) return '';
    var m = String(url).match(/(?:youtu\.be\/|[?&]v=|\/embed\/)([\w-]{11})/);
    return m ? m[1] : '';
  }

  /* 뉴스는 한국어(content/news.json, 평문 문자열)와 번역
     (content/news-i18n.json, id로 연결된 {en,zh,ja})이 서로 다른 파일에
     나뉘어 있습니다 — Pages CMS는 폼에 없는 필드는 저장할 때 통째로
     지워버려서, "② 뉴스" 탭을 한국어 전용으로 두려면 번역을 아예 다른
     파일(다른 탭)에 둘 수밖에 없었습니다.

     불러온 직후 이 함수로 한 번 합쳐서 title/excerpt 를 기존 {ko,en,zh,ja}
     모양으로 되돌려 두면, 그 뒤로는 render.js/news-detail.js 어디서도
     이 둘이 원래 한 파일이었던 것처럼 SEN.i18n.t() 로 그대로 씁니다. */
  function mergeNewsI18n(newsData, i18nData) {
    var map = {};
    ((i18nData && i18nData.items) || []).forEach(function (r) { map[r.id] = r; });
    ((newsData && newsData.items) || []).forEach(function (it) {
      var tr = map[it.id];
      var merged = { ko: it.title };
      if (tr && tr.title) {
        if (tr.title.en) merged.en = tr.title.en;
        if (tr.title.zh) merged.zh = tr.title.zh;
        if (tr.title.ja) merged.ja = tr.title.ja;
      }
      it.title = merged;

      merged = { ko: it.excerpt };
      if (tr && tr.excerpt) {
        if (tr.excerpt.en) merged.en = tr.excerpt.en;
        if (tr.excerpt.zh) merged.zh = tr.excerpt.zh;
        if (tr.excerpt.ja) merged.ja = tr.excerpt.ja;
      }
      it.excerpt = merged;
    });
    return newsData;
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

    /* 센코어테크 연도별 매출 막대그래프 — 값이 가장 큰 해를 100%로 두고
       나머지는 그 비율로 막대 높이를 정합니다(디자인용 상대 비교이지
       절대 축은 아닙니다). Pages CMS의 [⑤ 센코어테크 역량]에서 연도·
       금액을 입력하면 그대로 반영됩니다. */
    'sencoretech.yearly': function (items, ctx) {
      if (!items.length) return '';
      var unit = t(pick(ctx, 'sencoretech.yearlyUnit'));
      var max = items.reduce(function (m, it) { return Math.max(m, Number(it.value) || 0); }, 0);
      return items.map(function (it) {
        var v = Number(it.value) || 0;
        var h = max > 0 ? Math.max(4, Math.round((v / max) * 100)) : 4;
        return '' +
          '<div class="sct-bar">' +
            '<span class="sct-bar__value">' + esc(v.toLocaleString()) + (unit ? ' ' + esc(unit) : '') + '</span>' +
            '<span class="sct-bar__col" style="height:' + h + '%"></span>' +
            '<span class="sct-bar__year">' + esc(t(it.year)) + '</span>' +
          '</div>';
      }).join('');
    },


    /* 주요공법 — 사진 자리에 소개 영상의 유튜브 썸네일을 넣고, 카드
       전체를 눌러 그 영상으로 이동합니다. 개별 공법 PDF는 없고,
       전체를 아우르는 브로슈어는 섹션 제목 옆의 언어 선택 박스
       (index.html에 고정 마크업)로 받습니다. */
    'about.methods.items': function (items) {
      return items.map(function (it, i) {
        var points = tList(it.points).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
        var video = it.video || '';
        var tag = video ? 'a' : 'div';
        var attrs = video ? ' href="' + esc(video) + '" target="_blank" rel="noopener"' : '';

        return '' +
          '<' + tag + ' class="method reveal" data-delay="' + (i % 4) + '"' + attrs + '>' +
            '<div class="method__thumb">' + imgTag(it.image, t(it.name)) +
              (video ? '<span class="method__play" aria-hidden="true"></span>' : '') +
            '</div>' +
            '<div class="method__body">' +
              (it.code ? '<span class="method__code">' + esc(it.code) + '</span>' : '') +
              '<h4 class="method__name">' + esc(t(it.name)) + '</h4>' +
              (t(it.summary) ? '<p class="method__summary">' + esc(t(it.summary)) + '</p>' : '') +
              (points ? '<ul class="method__points">' + points + '</ul>' : '') +
            '</div>' +
          '</' + tag + '>';
      }).join('');
    },

    /* 국내외 사업장 — 국내 3곳은 그대로 항상 펼쳐진 카드.
       해외 지사는 국내 카드 3개를 합친 폭 그대로(grid-column:1/-1) 세로로
       길게 쌓은 줄들이고, 하나씩 눌러서 폅니다(<details>, 네이티브 접힘 —
       base.css 의 details:not([open]) 규칙이 보강해 둠). */
    'about.contact.offices': function (items) {
      function officeMeta(it) {
        var meta = [];
        if (it.tel)   meta.push('<span>TEL <a href="tel:' + esc(String(it.tel).replace(/[^\d+]/g, '')) + '">' + esc(it.tel) + '</a></span>');
        if (it.fax)   meta.push('<span>FAX ' + esc(it.fax) + '</span>');
        if (it.email) meta.push('<span><a href="' + esc(mailto(it.email)) + '">' + esc(it.email) + '</a></span>');
        return meta.length ? '<div class="office__meta">' + meta.join('') + '</div>' : '';
      }

      var domestic = items.filter(function (it) { return !it.overseas; });
      var overseas = items.filter(function (it) { return it.overseas; });

      var domesticHtml = domestic.map(function (it, i) {
        return '' +
          '<div class="office reveal" data-delay="' + (i % 4) + '">' +
            (t(it.tag) ? '<p class="office__tag">' + esc(t(it.tag)) + '</p>' : '') +
            '<h4 class="office__name">' + esc(t(it.name)) + '</h4>' +
            '<p class="office__addr">' + esc(t(it.address)) + '</p>' +
            officeMeta(it) +
          '</div>';
      }).join('');

      var overseasHtml = '';
      if (overseas.length) {
        var rows = overseas.map(function (it) {
          return '' +
            '<details class="office-overseas__row">' +
              '<summary class="office-overseas__row-head">' + esc(t(it.tag) || t(it.name)) + '</summary>' +
              '<div class="office-overseas__row-body">' +
                '<h4 class="office__name">' + esc(t(it.name)) + '</h4>' +
                '<p class="office__addr">' + esc(t(it.address)) + '</p>' +
                officeMeta(it) +
              '</div>' +
            '</details>';
        }).join('');

        overseasHtml = '<div class="office-overseas reveal" data-office-overseas>' + rows + '</div>';
      }

      /* 국내 3곳은 별도 칸(.offices__domestic)에 묶어서, 모바일에서만
         그 칸을 가로 드래그 캐러셀로 바꿀 수 있게 합니다(atlas.css 참고).
         해외지사(office-overseas)는 그 바깥에 그대로 둬 항상 아래 한 줄
         전체 폭으로 나옵니다. */
      return '<div class="offices__domestic">' + domesticHtml + '</div>' + overseasHtml;
    },

    /* 뉴스 카드 — 클릭하면 news.html?id=... 상세 페이지로 이동합니다.
       (외부 원문 링크가 있어도 카드 자체는 내부 상세 페이지를 열고,
       원문은 상세 페이지 안의 "원문 보기" 버튼으로 뺍니다)
       메인 페이지는 한 번에 기사 하나만 보여주는 스포트라이트 방식이라
       (controls.js의 initNewsSpotlight), 사진이 있으면 카드 위쪽을
       채웁니다. 사진이 없는 기사는 카카오톡으로 받은 기본 이미지
       (assets/img/news-placeholder.svg, 지구본+NEWS 아이콘)를 대신
       씁니다 — --ph 그라디언트로만 비워 두지 않습니다. */
    'news.items': function (items, ctx) {
      var readMore = t(pick(ctx, 'site.ui.readMore')) || '자세히 보기';
      if (!items.length) return '<p class="state">' + esc(t(pick(ctx, 'site.ui.empty')) || '등록된 글이 없습니다.') + '</p>';

      return items.map(function (it, i) {
        var href = 'news.html?id=' + encodeURIComponent(it.id || '');
        var img = it.image || 'assets/img/news-placeholder.svg';
        var cat = categoryLabel(it.category, ctx);
        return '' +
          '<a class="card news-spotlight__card reveal" data-delay="' + (i % 4) + '" href="' + esc(href) + '">' +
            '<div class="card__media' + (it.image ? '' : ' card__media--placeholder') + '">' + imgTag(img, '', '') + '</div>' +
            '<div class="card__body">' +
              '<div class="card__meta">' +
                (cat ? '<span class="card__cat">' + esc(cat) + '</span><span>·</span>' : '') +
                '<time datetime="' + esc(it.date || '') + '">' + esc(fmtDate(it.date)) + '</time>' +
              '</div>' +
              '<h3 class="card__title">' + esc(t(it.title)) + '</h3>' +
              '<p class="card__excerpt">' + esc(t(it.excerpt)) + '</p>' +
              '<span class="card__foot">' + esc(readMore) + '</span>' +
            '</div>' +
          '</a>';
      }).join('');
    },

    /* 채용 - 공고 아코디언 (지원하기 → mailto) */
    'careers.jobs': function (items, ctx) {
      var careers = ctx.careers || {};
      /* section/라벨류는 site.json 의 site.careers 에 있습니다(관리자
         "③ 채용공고" 폼에는 없는 값이라, careers.json 에 뒀다간 그 폼을
         저장할 때마다 통째로 사라집니다 — 뉴스에서 겪은 것과 같은 문제라
         아예 CMS가 손대지 않는 파일로 옮겼습니다). applyEmail·jobs 만
         실제로 관리자에서 입력하는 값이라 careers.json 에 남습니다. */
      var siteCareers = (ctx.site && ctx.site.careers) || {};
      var ui = (ctx.site && ctx.site.ui) || {};
      var applyLabel = t(ui.apply) || '지원하기';
      var reqLabel = t(siteCareers.requirementsLabel) || '자격 요건';
      var prefLabel = t(siteCareers.preferredLabel) || '우대 사항';
      var dueLabel = t(siteCareers.deadlineLabel) || '마감';
      var mailBody = t(siteCareers.applyMailBody) || '';

      if (!items.length) return '<p class="state">' + esc(t(ui.empty) || '진행 중인 채용이 없습니다.') + '</p>';

      return items.map(function (it, i) {
        var email = it.email || careers.applyEmail;
        var subject = (t(siteCareers.applyMailSubject) || '[입사지원] {job}').replace('{job}', t(it.title));

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
                ' data-apply-mailto="' + esc(mailto(email, subject, mailBody)) + '"' +
                ' data-apply-subject="' + esc(subject) + '"' +
                ' data-apply-body="' + esc(mailBody) + '">' +
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

    // 5) CEO 인사말 위 소개 영상 — video URL이 비어 있으면 안 보이고,
    //    있으면 이 영상 자리가 실제로 화면에 들어오는 순간 iframe을
    //    만들어 자동재생·무한반복으로 채웁니다. 페이지를 열자마자 화면
    //    밖(스크롤 훨씬 아래)에 미리 만들어 두면 브라우저·유튜브가
    //    자동재생을 안 시켜 주는 경우가 있어서, 보일 때 비로소 만드는
    //    방식으로 바꿨습니다 — "그 구간에 도달하면 재생"이 보장됩니다.
    //    이미 만들어졌으면 다시 안 건드려 언어 전환마다 처음부터 다시
    //    시작되지 않게 함. 자동재생 정책상 소리는 기본 음소거(mute=1)로
    //    시작하고, 자막도 기본은 꺼진 채로 시작합니다(cc_load_policy=0
    //    — 시청자가 원하면 CC 버튼으로 직접 켤 수는 있습니다).
    //    playsinline=1 이 없으면 모바일(특히 iOS Safari)에서는 자동재생
    //    자체가 아예 안 되거나 전체화면으로 튀어서 이 영상 자리 안에서
    //    조용히 재생되지 않습니다 — 데스크톱에는 영향 없는 값입니다.
    var videoHost = document.querySelector('[data-ceo-video]');
    if (videoHost && !videoHost.querySelector('iframe') && !videoHost._videoWatching) {
      var vid = youtubeId(t(pick(ctx, 'about.ceo.video')));
      videoHost.hidden = !vid;
      if (vid) {
        var loadCeoVideo = function () {
          videoHost.innerHTML = '<iframe src="https://www.youtube.com/embed/' + vid +
            '?autoplay=1&mute=1&loop=1&playlist=' + vid + '&rel=0&cc_load_policy=0&playsinline=1" title="CEO" ' +
            'allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
        };
        if ('IntersectionObserver' in window) {
          videoHost._videoWatching = true;
          var videoIo = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
              if (!e.isIntersecting) return;
              videoIo.disconnect();
              loadCeoVideo();
            });
          }, { threshold: 0.25 });
          videoIo.observe(videoHost);
        } else {
          loadCeoVideo();
        }
      }
    }

    /* 센코어테크 순위 라벨 — "{year}년 기준 강구조시공능력 순위"처럼
       기준 연도가 문구 중간에 들어가서 data-bind 하나로 못 채웁니다.
       {job} 을 실제 값으로 바꿔치는 site.json의 지원 메일 제목과 같은
       방식(단순 문자열 치환)입니다. */
    var rankLabelHost = document.querySelector('[data-sct-rank-label]');
    if (rankLabelHost) {
      var rk = pick(ctx, 'sencoretech.rank') || {};
      var rankLabel = t(rk.label).replace('{year}', t(rk.year));
      if (rankLabel) rankLabelHost.textContent = rankLabel;
    }


    // 6) 목록 렌더링
    Object.keys(RENDERERS).forEach(function (key) {
      var host = document.querySelector('[data-list="' + key + '"]');
      if (!host) return;
      var raw = pick(ctx, key);
      var items = Array.isArray(raw) ? raw : [];

      // 뉴스/프로젝트는 필터 + 더보기 상태를 적용
      if (key === 'news.items')     items = SEN.state.applyList('news', items);

      host.innerHTML = RENDERERS[key](items, ctx);

      // 홈 뉴스 스포트라이트 — 카드가 다시 그려질 때마다(언어 전환 등)
      // 몇 번째를 보고 있었는지 등 상태를 다시 잡음
      // (news.html/news-list.html 에는 이 위젯이 없고 controls.js 도 안 실어서 가드함)
      if (key === 'news.items' && SEN.controls && SEN.controls.refreshNewsSpotlight) {
        SEN.controls.refreshNewsSpotlight();
      }
    });
  }

  /* 지역별 실적 순위 등에서 화면에 보여줄 때만 손보는 이름입니다.
     매칭에 쓰는 원본 키(geo.json/kmap.json)는 건드리지 않습니다.

     1) "성남시분당구" 처럼 공백 없이 붙어 있는 "OO시XX구(군)" 형태를
        "OO시 XX구"로 띄어 씁니다.
     2) 맨 앞 시/도가 "서울"·"경기"처럼 줄임말이면 "서울특별시"·
        "경기도"같은 정식 명칭으로 풀어 씁니다(예: "경기 시흥시" →
        "경기도 시흥시"). geo.json은 매칭용으로 줄임말을 키로 쓰므로
        여기서 표시용으로만 되돌립니다. */
  var SIDO_FULL = {
    '서울': '서울특별시', '경기': '경기도', '인천': '인천광역시', '부산': '부산광역시',
    '대구': '대구광역시', '광주': '광주광역시', '대전': '대전광역시', '울산': '울산광역시',
    '세종': '세종특별자치시', '강원': '강원특별자치도', '충북': '충청북도', '충남': '충청남도',
    '전북': '전북특별자치도', '전남': '전라남도', '경북': '경상북도', '경남': '경상남도',
    '제주': '제주특별자치도'
  };
  function regionName(s) {
    s = String(s || '').replace(/([가-힣]+시)([가-힣]+[구군])$/, '$1 $2');
    var sp = s.indexOf(' ');
    var head = sp > -1 ? s.slice(0, sp) : s;
    if (SIDO_FULL[head]) s = SIDO_FULL[head] + s.slice(head.length);
    return s;
  }

  /* news.json 의 category 는 "언론보도"처럼 한국어 원문 문자열 그대로
     저장돼 있습니다(기사마다 4개 언어를 중복해서 넣지 않으려고) — 화면에
     보여줄 다국어 표기는 site.json 의 news.categories(같은 값의
     {ko,en,zh,ja} 목록)에서 찾아옵니다. 목록에 없는 값(오타 등)이면
     한국어 원문을 그대로 보여줍니다. */
  function categoryLabel(ko, ctx) {
    if (!ko) return '';
    var list = pick(ctx, 'site.news.categories') || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].ko === ko) return t(list[i]);
    }
    return ko;
  }

  SEN.render = render;
  SEN.util = { pick: pick, esc: esc, asset: asset, mailto: mailto, regionName: regionName, mergeNewsI18n: mergeNewsI18n, categoryLabel: categoryLabel };
})(window.SEN);
