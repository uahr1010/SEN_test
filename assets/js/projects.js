/* ==========================================================================
   projects.js — 실적 데이터 집계

   content/projects.json 의 projects 배열(공개 위치만 담긴 목록)을
   assets/data/geo.json 좌표 사전과 대조해 지역별로 묶습니다.
   원본 fetch 는 main.js 가 다른 content/*.json 과 함께 한 번에 하고,
   그 결과 배열을 여기 load() 에 그대로 넘겨줍니다 (중복 fetch 방지).

   ⚠️ 여기에 정확한 주소·담당자·엑셀 업로드 코드를 다시 넣지 마세요.
     이 사이트는 public GitHub 저장소로 운영되므로, 그런 정보는
     Git 이력에 한 번이라도 올라가면 지워도 과거 커밋에 남습니다.
     content/projects.json 에는 "서울특별시 강남구" 처럼 시/군/구 수준의
     공개 위치만 넣습니다 — 정확한 번지수는 절대 넣지 않습니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var GEO_URL = 'assets/data/geo.json';
  var TOKEN = /[가-힣]+[시군구]/g;
  var geo = null;

  /* ---------- 주소 정규화 ---------- */
  function norm(s) {
    return String(s).replace(/[(),·\-–—/]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function tokens(s) {
    TOKEN.lastIndex = 0;
    return s.match(TOKEN) || [];
  }

  /** 시도 이름이 겹치는 후보들 중 물량이 많은 시도를 먼저 고릅니다 */
  function byPriority(a, b) {
    var pa = geo.sidoPriority.indexOf(a.split(' ')[0]);
    var pb = geo.sidoPriority.indexOf(b.split(' ')[0]);
    if (pa < 0) pa = 99;
    if (pb < 0) pb = 99;
    return pa - pb || a.length - b.length;
  }

  /**
   * 공개 위치 한 줄 → { key, lat, lng, acc }
   * acc: exact(시군구) | city(시 이름) | sido(시도 중심) | oversea | none
   */
  function matchAddress(addr) {
    var a = norm(addr), low = a.toLowerCase(), i, n, key, m;

    /* 이미 정규 지역명이면 그대로 인정합니다.
       projects.json 에 저장되는 값이 바로 이 형식이라, 이 단계가 없으면
       "광주 남구" 가 시도 별칭에 없는 '광주' 때문에 토큰 역검색으로 넘어가
       "인천 남구" 로 잘못 붙습니다. (광주광역시 / 경기 광주시 가 겹쳐서
       '광주' 를 시도 별칭에 넣을 수 없기 때문입니다) */
    if (geo.regions[a]) {
      return { key: a, lat: geo.regions[a][0], lng: geo.regions[a][1], acc: 'exact' };
    }
    for (i = 0; i < geo.overseas.length; i++) {
      if (geo.overseas[i].name === a) {
        return { key: a, lat: geo.overseas[i].lat, lng: geo.overseas[i].lng, acc: 'oversea' };
      }
    }

    for (i = 0; i < geo.overseas.length; i++) {
      var o = geo.overseas[i];
      if (low.indexOf(o.kw) > -1) return { key: o.name, lat: o.lat, lng: o.lng, acc: 'oversea' };
    }

    /* 시도 찾기 — 앞에서 시작하는 경우가 우선, 없으면 문자열 어디든 */
    var sido = null, rest = a;
    for (i = 0; i < geo.sidoAlias.length; i++) {
      if (a.indexOf(geo.sidoAlias[i][0]) === 0) {
        sido = geo.sidoAlias[i][1];
        rest = a.slice(geo.sidoAlias[i][0].length);
        break;
      }
    }
    if (sido === null) {
      for (i = 0; i < geo.sidoAlias.length; i++) {
        var at = a.indexOf(geo.sidoAlias[i][0]);
        if (at > -1) {
          sido = geo.sidoAlias[i][1];
          rest = a.slice(at + geo.sidoAlias[i][0].length);
          break;
        }
      }
    }

    var toks = tokens(rest);

    if (sido) {
      for (n = 2; n >= 1; n--) {
        if (toks.length >= n) {
          key = sido + ' ' + toks.slice(0, n).join('');
          if (geo.regions[key]) {
            return { key: key, lat: geo.regions[key][0], lng: geo.regions[key][1], acc: 'exact' };
          }
        }
      }
      /* "경북 포항 남구" 처럼 시 이름에 접미사가 없는 표기 */
      m = rest.match(/^\s*([가-힣]{2,4})/);
      if (m && geo.city[m[1]]) {
        return { key: sido + ' ' + m[1], lat: geo.city[m[1]][0], lng: geo.city[m[1]][1], acc: 'city' };
      }
      if (geo.sido[sido]) {
        return { key: sido, lat: geo.sido[sido][0], lng: geo.sido[sido][1], acc: 'sido' };
      }
    }

    /* 시도 없이 시군구만 적힌 경우.
       앞에서부터 자르지 않고 모든 토큰을 후보로 봅니다 —
       앞이 오타여도 뒤의 구 이름으로 찾아내기 위함입니다. */
    var cands = [];
    for (i = 0; i < toks.length; i++) {
      if (i + 1 < toks.length) cands.push(toks[i] + toks[i + 1]);
      cands.push(toks[i]);
    }
    for (i = 0; i < cands.length; i++) {
      var c = cands[i], hits = [];
      for (key in geo.regions) {
        if (tail(key) === c) hits.push(key);
      }
      if (!hits.length && c.length >= 3) {
        for (key in geo.regions) {
          if (tail(key).slice(-c.length) === c) hits.push(key);
        }
      }
      if (hits.length) {
        hits.sort(byPriority);
        return { key: hits[0], lat: geo.regions[hits[0]][0], lng: geo.regions[hits[0]][1], acc: 'exact' };
      }
    }

    /* 시 이름만 적힌 경우("수원", "용인"처럼 시/군/구 표시 없이 이름만).
       뒤에 "시"를 붙여 geo.regions 에서 찾아봅니다 — "경기 수원시"처럼
       시/도가 붙은 정확한 지역으로 잡힙니다. 이 단계 없이 곧장 geo.city
       로 넘어가면 시/도 정보가 없는 채로("수원"만) 저장되어, 시/도별
       집계(지역 목록의 "경기"/"기타" 구분 등)에서 그 시/도가 아니라
       엉뚱하게 따로 떨어진 항목으로 잡히는 문제가 있었습니다. */
    m = a.match(/^([가-힣]{2,4})/);
    if (m) {
      var withSi = m[1] + '시', hits2 = [];
      for (key in geo.regions) {
        if (tail(key) === withSi) hits2.push(key);
      }
      if (hits2.length) {
        hits2.sort(byPriority);
        return { key: hits2[0], lat: geo.regions[hits2[0]][0], lng: geo.regions[hits2[0]][1], acc: 'exact' };
      }
      if (geo.city[m[1]]) {
        return { key: m[1], lat: geo.city[m[1]][0], lng: geo.city[m[1]][1], acc: 'city' };
      }
    }
    return { key: null, lat: null, lng: null, acc: 'none' };
  }

  function tail(key) {
    var i = key.indexOf(' ');
    return i < 0 ? key : key.slice(i + 1);
  }

  /* "필리핀 마닐라"/"필리핀 라구나"/"필리핀" 처럼 국외는 도시별로 갈라져
     들어오는데, 지구본/목록에서는 나라 단위로만 보여 달라는 요청이 있어
     이름의 첫 단어(나라)로 다시 묶습니다. 좌표는 나라 단위 항목(예: "필리핀")이
     있으면 그 좌표를, 없으면 처음 만난 도시의 좌표를 그대로 씁니다. */
  function groupByCountry(list) {
    var byC = {}, order = [];
    list.forEach(function (r) {
      var country = r.name.split(' ')[0];
      if (!byC[country]) {
        byC[country] = { name: country, lat: r.lat, lng: r.lng, n: 0, overseas: true };
        order.push(country);
      }
      byC[country].n += r.n;
      if (r.name === country) { byC[country].lat = r.lat; byC[country].lng = r.lng; }
    });
    return order.map(function (c) { return byC[c]; })
      .sort(function (a, b) { return b.n - a.n; });
  }

  /* ---------- 지역별 집계 ---------- */
  function aggregate(projects) {
    var map = {}, stat = { exact: 0, city: 0, sido: 0, oversea: 0, none: 0 }, total = 0;

    projects.forEach(function (p) {
      if (!p || p.visible === false) return;
      var addr = p.address || '';
      if (!addr) return;
      total++;

      var r = matchAddress(addr);
      stat[r.acc]++;
      if (!r.key) return;
      if (!map[r.key]) map[r.key] = { name: r.key, lat: r.lat, lng: r.lng, n: 0, overseas: r.acc === 'oversea' };
      map[r.key].n++;
    });

    var regions = Object.keys(map).map(function (k) { return map[k]; });
    regions.sort(function (a, b) { return b.n - a.n; });

    var domestic = regions.filter(function (r) { return !r.overseas; });
    var abroad = groupByCountry(regions.filter(function (r) { return r.overseas; }));

    /* 시도별 합계 — 지구본 위 라벨, 한국 지도 색칠에 씁니다 */
    var byProv = {};
    domestic.forEach(function (r) {
      var p = r.name.split(' ')[0];
      byProv[p] = (byProv[p] || 0) + r.n;
    });

    var sumN = function (list) { return list.reduce(function (s, r) { return s + r.n; }, 0); };

    return {
      regions: regions, byProv: byProv, stat: stat, total: total, placed: total - stat.none,
      domestic: { regions: domestic, total: sumN(domestic) },
      overseas: { regions: abroad, total: sumN(abroad) }
    };
  }

  /* ---------- 진입점 ----------
     projects : content/projects.json 의 projects 배열 (main.js 가 이미 fetch 해 옵니다) */
  function load(projects) {
    return fetch(GEO_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('geo.json (' + r.status + ')');
        return r.json();
      })
      .then(function (g) {
        geo = g;
        var out = aggregate(projects || []);
        out.source = 'json';
        return out;
      });
  }

  SEN.projects = { load: load, matchAddress: matchAddress };
})(window.SEN);
