/* ==========================================================================
   hero.js — 인트로의 텍스트 플립 애니메이션 + 채용/뉴스 배지

   원본은 카카오톡으로 받은 LayoutTextFlip 미리보기(Aceternity UI를 순수
   HTML/CSS/JS로 옮긴 것)입니다. 여기서는 그 동작은 그대로 두고,
     · 단어 목록을 site.json(site.hero.flipWords)에서 가져오고
     · "We are hiring" 배지는 content/careers.json 의 채용공고 개수로
       실제 채용중 여부를 판단하고(0건이면 스위치가 꺼짐)
     · "Latest news" 배지는 뉴스가 하나라도 있을 때만 보이도록
   데이터에 연결했습니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 상태 배지 (채용중 / 새 소식) ---------- */
  function renderFlags(data) {
    var host = document.querySelector('[data-flags]');
    if (!host) return;

    var jobs = (data.careers && data.careers.jobs) || [];
    var hiring = jobs.length > 0;
    var newsItems = (data.news && data.news.items) || [];
    var hasNews = newsItems.length > 0;

    var html = '';

    // 채용 배지는 채용중이 아닐 때도 보여 줍니다(스위치만 꺼짐 — 지원자가 상황을 알 수 있도록)
    html += '<a class="flag flag--hiring ' + (hiring ? 'flag--on' : 'flag--off') + '"' +
              ' href="#scene-careers"' +
              ' aria-label="' + (hiring ? '채용 진행중 — 채용 공고 보기' : '현재 진행 중인 채용 없음') + '">' +
              '<span>We are hiring</span>' +
              '<span class="flag__switch" aria-hidden="true"><i></i></span>' +
            '</a>';

    if (hasNews) {
      html += '<a class="flag flag--news" href="#scene-news" aria-label="새 소식 보기">' +
                '<span>Latest news</span>' +
                '<img class="flag__icon" src="assets/img/mail-icon.png" alt="" data-news-icon>' +
              '</a>';
    }

    host.innerHTML = html;

    /* 이 배지들의 href="#scene-..."를 그냥 두면 브라우저 기본 앵커 점프가
       일어나서, 오른쪽 진행 점(atlas.goTo)이 고정 헤더 높이를 빼고
       이동하는 것과 도착 위치가 살짝 어긋납니다. 같은 보정을 타도록
       클릭을 가로채 atlas.goToId()로 이동합니다. */
    host.querySelectorAll('a.flag').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (!SEN.atlas || !SEN.atlas.goToId) return;
        e.preventDefault();
        SEN.atlas.goToId(a.getAttribute('href').slice(1));
      });
    });

    /* 아이콘 그림이 없거나 깨졌으면 이모지로 대체 */
    var icon = host.querySelector('[data-news-icon]');
    if (icon) {
      icon.addEventListener('error', function () {
        var span = document.createElement('span');
        span.className = 'flag__emoji';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = '✉️';
        if (icon.parentNode) icon.parentNode.replaceChild(span, icon);
      });
    }
  }

  /* ---------- 텍스트 플립 ---------- */
  function initFlip(data) {
    var box = document.querySelector('[data-ltf-box]');
    var sizer = document.querySelector('[data-ltf-sizer]');
    if (!box || !sizer || box._ltfStarted) return;
    box._ltfStarted = true;

    var WORDS = (data.site && data.site.hero && data.site.hero.flipWords) || ['센구조연구소'];
    var INTERVAL = 2000;
    var current = null;
    /* 첫 화면은 항상 "센구조연구소"로 띄웁니다 — site.json 에서
       flipWords 순서가 나중에 바뀌어도(관리 실수 등) 이 값이 배열 어디에
       있든 첫 표시만큼은 이걸로 고정되도록, 인덱스를 찾아서 거기서
       시작합니다(없으면 그냥 0번째). */
    var FIRST_WORD = '센구조연구소';
    var firstIdx = WORDS.indexOf(FIRST_WORD);
    var index = firstIdx > -1 ? firstIdx : 0;

    /* 화면 폭보다 넓은 계열사 이름("SEN STRUCTURAL ENGINEERING CO., LTD."
       처럼 긴 것)이 있어도 절대 줄바꿈하지 않습니다 — 줄바꿈은 칸 높이가
       단어마다 들쭉날쭉 바뀌면서(1줄→여러 줄) 전환이 버벅이는 것처럼
       보였습니다. 대신 칸이 실제로 넘칠 때만 그 단어의 글자 크기를
       살짝 줄여 한 줄 안에 맞춥니다(sizer가 box의 자식이라 font-size를
       box에 주면 같이 작아지는 것을 이용). */
    function availWidth() {
      var hero = box.closest('.hero');
      return (hero || box.parentElement).getBoundingClientRect().width;
    }
    function fitBox(word) {
      if (word != null) sizer.textContent = word;
      box.style.fontSize = '';   // 먼저 CSS 기본 크기로 되돌리고 다시 잽니다
      var w = sizer.getBoundingClientRect().width;
      if (!w) return;
      var cs = getComputedStyle(box);
      var pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      var avail = availWidth();
      if (avail && w + pad > avail) {
        var baseSize = parseFloat(cs.fontSize);
        var targetW = Math.max(avail - pad, 10);
        box.style.fontSize = Math.max(10, Math.floor(baseSize * targetW / w)) + 'px';
        w = sizer.getBoundingClientRect().width;   // 줄어든 크기로 다시 측정
      }
      box.style.width = Math.ceil(w + pad) + 'px';
    }

    function show(word, animate) {
      var next = document.createElement('span');
      next.className = 'ltf__word' + (animate ? ' ltf__word--in' : '');
      next.textContent = word;

      if (current) {
        var prev = current;
        prev.classList.remove('ltf__word--in');
        prev.classList.add('ltf__word--out');
        var drop = function () { if (prev.parentNode) prev.parentNode.removeChild(prev); };
        prev.addEventListener('animationend', drop, { once: true });
        setTimeout(drop, 700);
      }

      box.appendChild(next);
      current = next;
      fitBox(word);
    }

    show(WORDS[index], false);

    /* 첫 단어를 고정해도, 화면 밖(표지를 보는 동안)에서부터 타이머가
       미리 돌고 있으면 사용자가 스크롤해서 실제로 도착했을 땐 이미
       몇 번 바뀐 뒤일 수 있습니다. CEO 영상과 같은 방식으로, 이 구간이
       실제로 화면에 들어온 뒤에야 단어 전환을 시작합니다. */
    function startCycle() {
      if (WORDS.length <= 1 || reduce) return;
      setInterval(function () {
        index = (index + 1) % WORDS.length;
        show(WORDS[index], true);
      }, INTERVAL);
    }

    var scene = box.closest('.scene') || box;
    if ('IntersectionObserver' in window) {
      var flipIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          flipIo.disconnect();
          startCycle();
        });
      }, { threshold: 0.25 });
      flipIo.observe(scene);
    } else {
      startCycle();
    }

    if (window.ResizeObserver) {
      new ResizeObserver(function () { fitBox(null); }).observe(sizer);
    } else {
      addEventListener('resize', function () { fitBox(null); });
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { fitBox(null); });
      }
    }
  }

  /* ---------- "Welcome to SEN ENGINEERING GROUP" 고정 제목 ----------
     이 문구도 줄바꿈 없이 한 줄로 둡니다. 위 플립 단어와 같은 방식 —
     기준 폭보다 넓으면 그만큼만 글자 크기를 줄입니다.
     기준 폭은 .hero의 실제 폭(리드문·배지 등과 함께 쓰는 760px 칸)이
     아니라 이 제목만을 위한 더 넓은 값을 씁니다 — 그래야 .hero 폭을
     그대로 둔 채 제목만 더 크게 키울 수 있습니다(다른 요소는 영향
     없음). 사이트의 "넓은 섹션" 기준(.scene__inner의 1180px)보다
     살짝 좁게 잡아 여유를 둡니다. */
  function fitFixedText() {
    var el = document.querySelector('.ltf__text');
    if (!el) return;
    el.style.fontSize = '';
    var avail = Math.min(1120, window.innerWidth * 0.92);
    var w = el.scrollWidth;
    if (avail && w > avail) {
      var baseSize = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = Math.max(10, Math.floor(baseSize * avail / w)) + 'px';
    }
  }

  function init(data) {
    renderFlags(data);
    initFlip(data);
    fitFixedText();
    addEventListener('resize', fitFixedText);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitFixedText);
    }
    /* 웹폰트 로딩·표지 레이아웃이 자리 잡는 타이밍 등으로 init() 시점엔
       .hero 폭이 아직 최종값이 아닐 수 있습니다 — 그 뒤로도 폭이 실제로
       바뀔 때마다(resize 이벤트가 못 잡는 경우 포함) 다시 재 봅니다. */
    var heroEl = document.querySelector('.hero');
    if (heroEl && window.ResizeObserver) {
      new ResizeObserver(fitFixedText).observe(heroEl);
    }
  }

  SEN.hero = { init: init };
})(window.SEN);
