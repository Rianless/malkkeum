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

  function skipAd(video) {
    if (!video) return;
    video.muted = true;
    try { video.playbackRate = 16; } catch (e) { /* 무시 */ }
    if (isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.2) {
      try { video.currentTime = video.duration - 0.1; } catch (e) { /* 무시 */ }
    }
    document.querySelectorAll('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button, .ytm-skip-ad-button')
      .forEach(b => b.click());
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
        }
        current = null;
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
  }

  setInterval(tick, 250);

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
