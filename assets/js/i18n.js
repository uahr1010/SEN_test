/* ==========================================================================
   i18n.js — 다국어 처리 (한국어 / English / 中文 / 日本語)
   - 콘텐츠 JSON 안의 {ko, en, zh, ja} 객체에서 현재 언어 값을 꺼냅니다.
   - 번역이 비어 있으면 한국어로 자동 대체(fallback)합니다.
   - 선택한 언어는 localStorage 에 저장되고 ?lang=en 파라미터로도 지정 가능합니다.
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  var LANGS = ['ko', 'en', 'zh', 'ja'];
  var FALLBACK = 'ko';
  var STORAGE_KEY = 'sen.lang';

  // <html lang="..."> 에 넣을 값
  var HTML_LANG = { ko: 'ko', en: 'en', zh: 'zh-Hans', ja: 'ja' };

  var current = FALLBACK;
  var listeners = [];

  function detect() {
    // 1순위: URL 파라미터  2순위: 저장값  3순위: 브라우저 언어
    var qs = new URLSearchParams(location.search).get('lang');
    if (qs && LANGS.indexOf(qs) > -1) return qs;

    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LANGS.indexOf(saved) > -1) return saved;
    } catch (e) { /* 사생활 보호 모드 등 */ }

    var nav = (navigator.language || '').toLowerCase();
    if (nav.indexOf('ko') === 0) return 'ko';
    if (nav.indexOf('zh') === 0) return 'zh';
    if (nav.indexOf('ja') === 0) return 'ja';
    if (nav.indexOf('en') === 0) return 'en';
    return FALLBACK;
  }

  /**
   * 다국어 값을 현재 언어의 문자열로 변환.
   *  - 문자열이면 그대로 반환 (번역이 필요 없는 값: 날짜, 이메일 등)
   *  - {ko:'', en:''} 형태면 현재 언어 → 한국어 → 첫 번째 값 순으로 반환
   */
  function t(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(t).join(', ');

    if (typeof value === 'object') {
      if (value[current]) return String(value[current]);
      if (value[FALLBACK]) return String(value[FALLBACK]);
      for (var k in value) { if (value[k]) return String(value[k]); }
    }
    return '';
  }

  /** 다국어 배열 값을 현재 언어의 문자열 배열로 변환 */
  function tList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(t).filter(Boolean);
    // {ko:[...], en:[...]} 형태도 허용
    if (typeof value === 'object') {
      var arr = value[current] || value[FALLBACK];
      return Array.isArray(arr) ? arr.slice() : [];
    }
    return [];
  }

  function get() { return current; }

  function set(lang) {
    if (LANGS.indexOf(lang) === -1 || lang === current) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    document.documentElement.lang = HTML_LANG[lang] || lang;

    // 주소창에도 반영 (새로고침/공유 시 언어 유지). URL 객체가 해시까지 보존합니다.
    var url = new URL(location.href);
    if (lang === FALLBACK) url.searchParams.delete('lang');
    else url.searchParams.set('lang', lang);
    history.replaceState(null, '', url.toString());

    listeners.forEach(function (fn) { fn(lang); });
  }

  /** 언어가 바뀔 때 실행할 콜백 등록 */
  function onChange(fn) { listeners.push(fn); }

  function init() {
    current = detect();
    document.documentElement.lang = HTML_LANG[current] || current;
  }

  /** 날짜 문자열(YYYY-MM-DD)을 현재 언어 형식으로 포맷 */
  function formatDate(str) {
    if (!str) return '';
    var d = new Date(str);
    if (isNaN(d.getTime())) return String(str);
    var locale = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' }[current] || 'ko-KR';
    try {
      return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return String(str);
    }
  }

  SEN.i18n = {
    LANGS: LANGS, FALLBACK: FALLBACK,
    init: init, get: get, set: set, onChange: onChange,
    t: t, tList: tList, formatDate: formatDate
  };
})(window.SEN);
