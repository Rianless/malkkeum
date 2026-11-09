// 유튜브 페이지 안(MAIN world)에서 동작하는 핵심 스크립트.
// 1) 전체 차단 모드: 영상 데이터에서 광고 정보(adPlacements 등)를 미리 지워 광고가 아예 안 붙게 함
// 2) 그래도 광고가 재생되면: 광고 정보를 읽어 분석 → 차단 대상이면 음소거·고속재생·건너뛰기
// 3) 피드/검색/사이드의 배너형 광고도 분석해 숨김
(() => {
  'use strict';
  if (window.__YTAB_LOADED__) return;
  window.__YTAB_LOADED__ = true;

  const C = window.YTAB_CLASSIFIER;
  const origParse = JSON.parse;
  const DEFAULTS = { enabled: true, mode: 'all', blockedCategories: [], blockedAdvertisers: [] };

  // ---------- 설정 읽기 (content.js가 html 태그 속성/로컬스토리지에 넣어줌) ----------
  function settings() {
    try {
      const raw = document.documentElement?.getAttribute('data-ytab-settings') || localStorage.getItem('ytab_settings');
      if (raw) return Object.assign({}, DEFAULTS, origParse(raw));
    } catch (e) { /* 무시 */ }
    return DEFAULTS;
  }
  const shouldStrip = () => { const s = settings(); return s.enabled && s.mode === 'all'; };

  function report(payload) {
    window.postMessage({ __ytab: true, ...payload }, location.origin);
  }

  // ---------- 1. 데이터 단계에서 광고 제거 ----------
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  let pendingStripped = 0;

  function strip(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 3) return;
    if (Array.isArray(obj)) { obj.forEach(o => strip(o, depth + 1)); return; }
    // 영상 재생 데이터에서 광고를 지우면 유튜브가 눈치채고 광고 길이만큼 까만 화면으로 기다리게 함.
    // 그래서 영상 광고는 지우지 않고, 재생되자마자 아래 2번에서 바로 건너뜀. (피드·검색 광고만 미리 지움)
    const isPlayer = obj.videoDetails || obj.playabilityStatus || obj.streamingData;
    if (isPlayer) return;
    for (const k of AD_KEYS) {
      if (k in obj) {
        if (Array.isArray(obj[k])) pendingStripped += obj[k].length;
        else pendingStripped += 1;
        delete obj[k];
      }
    }
    if (obj.playerResponse) strip(obj.playerResponse, depth + 1);
    if (Array.isArray(obj)) obj.forEach(o => strip(o, depth + 1));
  }

  setInterval(() => {
    if (pendingStripped > 0) {
      report({ type: 'stripped', count: pendingStripped });
      pendingStripped = 0;
    }
  }, 2000);

  JSON.parse = function (...args) {
    const r = origParse.apply(this, args);
    try { if (shouldStrip()) strip(r); } catch (e) { /* 무시 */ }
    return r;
  };

  const origJson = Response.prototype.json;
  Response.prototype.json = async function (...args) {
    const r = await origJson.apply(this, args);
    try { if (shouldStrip()) strip(r); } catch (e) { /* 무시 */ }
    return r;
  };

  for (const name of ['ytInitialPlayerResponse', 'ytInitialData']) {
    let value = window[name];
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get() { return value; },
        set(v) { try { if (shouldStrip()) strip(v); } catch (e) { /* 무시 */ } value = v; }
      });
    } catch (e) { /* 무시 */ }
  }

  // ---------- 2. 재생 중 광고 감지·분석·건너뛰기 ----------
  const text = sel => {
    for (const s of sel.split(',')) {
      const el = document.querySelector(s.trim());
      const t = el?.textContent?.trim();
      if (t) return t;
    }
    return '';
  };

  function readAdInfo() {
    const player = document.getElementById('movie_player');
    let vd = {};
    try { vd = player?.getVideoData?.() || {}; } catch (e) { /* 무시 */ }
    let domain = '';
    const a = document.querySelector('.ytp-ad-player-overlay a[href], .ytp-ad-overlay-container a[href], .ytp-ad-module a[href]');
    if (a) { try { domain = new URL(a.href).hostname.replace(/^www\./, ''); } catch (e) { /* 무시 */ } }
    return {
      videoId: vd.video_id || '',
      title: vd.title || '',
      author: vd.author || '',
      advertiser: text('.ytp-visit-advertiser-link__text, .ytp-ad-visit-advertiser-button .ytp-ad-button-text, .ytp-ad-player-overlay-layout__ad-info-container, .ytp-ad-button-text'),
      domain
    };
  }

  function decide(info, category) {
    const s = settings();
    if (!s.enabled) return false;
    if (s.mode === 'all') return true;
    const adv = (info.advertiser || info.author || '').toLowerCase();
    if (adv && s.blockedAdvertisers.some(b => adv.includes(b.toLowerCase()))) return true;
    return s.blockedCategories.includes(category.id);
  }

  let current = null; // 지금 재생 중인 광고 상태

  // 광고 영상을 끝으로 강제로 넘기면(seek) 플레이어가 꼬여 본 영상 전에 까만 화면이 생김.
  // 그래서 넘기지 않고, 소리 끄고 16배속으로 흘려보내면서 건너뛰기 버튼이 뜨면 바로 누름.
  function skipAd(video) {
    document.querySelectorAll('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button, .ytm-skip-ad-button')
      .forEach(b => b.click());
    if (!video) return;
    if (!video.muted) video.muted = true;
    try { if (video.playbackRate !== 16) video.playbackRate = 16; } catch (e) { /* 무시 */ }
    if (video.paused) { try { video.play(); } catch (e) { /* 무시 */ } }
  }

  function tick() {
    const player = document.querySelector('.html5-video-player.ad-showing, #movie_player.ad-showing, .ad-showing');
    const video = (player || document).querySelector('video');

    if (!player) {
      if (current) {
        // 광고 종료 → 원래 상태로 복원
        if (current.blocked && video) {
          video.muted = current.prevMuted;
          try { video.playbackRate = current.prevRate; } catch (e) { /* 무시 */ }
          // 광고가 끝났는데 본 영상이 멈춰 있으면 바로 재생
          setTimeout(() => { if (video.paused && !document.querySelector('.ad-showing')) { try { video.play(); } catch (e) { /* 무시 */ } } }, 300);
        }
        current = null;
        syncCoverMode();
      }
      return;
    }

    if (!current) {
      current = {
        start: Date.now(),
        decided: false,
        blocked: false,
        prevMuted: video ? video.muted : false,
        prevRate: video && video.playbackRate <= 4 ? video.playbackRate : 1
      };
    }

    // 전체 차단 모드는 바로 결정, 선택 모드는 광고주 정보가 뜰 때까지(최대 0.8초) 잠깐 기다림
    if (!current.decided) {
      const info = readAdInfo();
      const s = settings();
      const ready = s.mode === 'all' || info.advertiser || info.title || Date.now() - current.start > 800;
      if (ready) {
        const category = C.classify(info);
        current.decided = true;
        current.blocked = decide(info, category);
        report({ type: 'ad', kind: '영상 광고', info, category, blocked: current.blocked, at: Date.now() });
      }
    }

    if (current.blocked) skipAd(video);
    syncCoverMode();
  }

  setInterval(tick, 250);

  // ---------- 광고가 번쩍이지 않게 가림막 ----------
  // 전체 차단 모드: 플레이어에 광고 표시(class)가 붙는 순간 CSS가 즉시 덮음 (자바스크립트 대기 없음)
  // 선택 차단 모드: 차단하기로 결정된 광고만 덮음 (허용한 광고는 그대로 보임)
  const COVER_CSS = `
    html[data-ytab-hide="1"] .ad-showing video,
    .html5-video-player[data-ytab-cover] video { opacity: 0 !important; }
    html[data-ytab-hide="1"] #movie_player.ad-showing::after,
    html[data-ytab-hide="1"] .html5-video-player.ad-showing::after,
    .html5-video-player[data-ytab-cover]::after {
      content: "광고 건너뛰는 중";
      position: absolute; inset: 0; z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      background: #000; color: rgba(255,255,255,.55);
      font: 13px/1 system-ui, sans-serif; letter-spacing: .02em;
      pointer-events: none;
    }`;
  function installCoverStyle() {
    if (document.getElementById('ytab-cover-style')) return;
    const st = document.createElement('style');
    st.id = 'ytab-cover-style';
    st.textContent = COVER_CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function syncCoverMode() {
    installCoverStyle();
    const s = settings();
    const on = s.enabled && s.mode === 'all';
    const root = document.documentElement;
    if (on && root.getAttribute('data-ytab-hide') !== '1') root.setAttribute('data-ytab-hide', '1');
    if (!on && root.hasAttribute('data-ytab-hide')) root.removeAttribute('data-ytab-hide');
    // 선택 차단 모드에서 차단 결정된 광고만 덮기
    const p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (p) {
      const cover = !!(current && current.blocked);
      if (cover && !p.hasAttribute('data-ytab-cover')) p.setAttribute('data-ytab-cover', '');
      if (!cover && p.hasAttribute('data-ytab-cover')) p.removeAttribute('data-ytab-cover');
    }
  }
  syncCoverMode();
  setInterval(syncCoverMode, 300);

  // 0.25초를 기다리지 않고, 광고가 붙는 순간(플레이어 class 변경)과
  // 광고 영상 길이가 정해지는 순간(durationchange 등)에 바로 건너뛰기 실행
  const playerObserver = new MutationObserver(() => tick());
  const VIDEO_EVENTS = ['loadedmetadata', 'durationchange', 'playing', 'timeupdate'];
  function hookPlayer() {
    const p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (p && !p.__ytabHooked) {
      p.__ytabHooked = true;
      playerObserver.observe(p, { attributes: true, attributeFilter: ['class'] });
    }
    const v = (p || document).querySelector('video');
    if (v && !v.__ytabHooked) {
      v.__ytabHooked = true;
      VIDEO_EVENTS.forEach(ev => v.addEventListener(ev, () => { if (current || document.querySelector('.ad-showing')) tick(); }));
    }
  }
  setInterval(hookPlayer, 500);
  document.addEventListener('DOMContentLoaded', hookPlayer);

  // ---------- 3. 배너형/피드 광고 ----------
  const BANNER_SEL = [
    'ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer', 'ytd-promoted-sparkles-web-renderer',
    'ytd-display-ad-renderer', 'ytd-promoted-video-renderer', 'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer', 'ytd-search-pyv-renderer', '#player-ads', '#masthead-ad',
    'ytm-promoted-sparkles-web-renderer', 'ytm-companion-ad-renderer', 'ad-slot-renderer'
  ].join(',');

  function scanBanners() {
    const s = settings();
    if (!s.enabled) return;
    document.querySelectorAll(BANNER_SEL).forEach(el => {
      if (el.dataset.ytabDone) return;
      el.dataset.ytabDone = '1';
      const raw = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const lines = (el.innerText || '').split('\n').map(t => t.trim()).filter(Boolean);
      let domain = '';
      const a = el.querySelector('a[href^="http"]');
      if (a) { try { domain = new URL(a.href).hostname.replace(/^www\./, ''); } catch (e) { /* 무시 */ } }
      const info = { title: lines[0] || '', advertiser: lines.slice(1).find(l => !/^(광고|스폰서|sponsored|ad)\b/i.test(l)) || '', domain, extra: raw.slice(0, 300) };
      const category = C.classify(info);
      const blocked = decide(info, category);
      if (blocked) {
        // 피드 한 칸 전체를 숨김
        const box = el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytm-rich-item-renderer, ytm-item-section-renderer') || el;
        box.style.setProperty('display', 'none', 'important');
      }
      if (raw) report({ type: 'ad', kind: '배너 광고', info: { title: info.title, advertiser: info.advertiser, domain }, category, blocked, at: Date.now() });
    });
  }

  setInterval(scanBanners, 1000);
})();
