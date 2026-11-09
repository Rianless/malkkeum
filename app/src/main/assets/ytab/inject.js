// 유튜브 페이지 안(MAIN world)에서 동작하는 핵심 스크립트.
// 1) 전체 차단 모드: 유튜브 데이터에서 광고 정보를 미리 지워 광고가 아예 안 붙게 함 ('미리 제거' 방식)
// 2) 그래도 광고가 재생되면: 광고 정보를 읽어 분석 → 차단 대상이면 음소거·고속재생·건너뛰기
// 3) 피드/검색/사이드의 배너형 광고도 분석해 숨김
(() => {
  'use strict';
  if (window.__YTAB_LOADED__) return;
  window.__YTAB_LOADED__ = true;

  const C = window.YTAB_CLASSIFIER;
  const origParse = JSON.parse;
  const DEFAULTS = { enabled: true, mode: 'all', method: 'strip', blockedCategories: [], blockedAdvertisers: [] };

  // ---------- 설정 읽기 (content.js가 html 태그 속성/로컬스토리지에 넣어줌) ----------
  function settings() {
    try {
      const raw = document.documentElement?.getAttribute('data-ytab-settings') || localStorage.getItem('ytab_settings');
      if (raw) return Object.assign({}, DEFAULTS, origParse(raw));
    } catch (e) { /* 무시 */ }
    return DEFAULTS;
  }
  // 피드·검색 광고 데이터 제거: 전체 차단 모드면 항상
  const shouldStrip = () => { const s = settings(); return s.enabled && s.mode === 'all'; };
  // 영상 광고 데이터 제거: '미리 제거' 방식일 때만 ('빨리 넘기기' 방식이면 영상 데이터는 그대로 두고 재생 중 건너뜀)
  const shouldStripPlayer = () => { const s = settings(); return shouldStrip() && s.method !== 'skip'; };

  function report(payload) {
    window.postMessage({ __ytab: true, ...payload }, location.origin);
  }

  // ---------- 진단 기록: 영상을 열고 재생되기까지 무슨 일이 언제 일어나는지 ----------
  let navAt = performance.now();
  let diagBuf = [];
  function diag(e, d) {
    diagBuf.push({ t: Math.round(performance.now() - navAt), e, d: d || '' });
  }
  setInterval(() => {
    if (diagBuf.length) { report({ type: 'diag', items: diagBuf }); diagBuf = []; }
  }, 1000);
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      navAt = performance.now();
      nudged = false;
      diag('nav', location.pathname + location.search.slice(0, 20));
    }
  }, 100);
  let nudged = false;
  let foundKeys = [];
  function describe(obj, where) {
    try {
      const pr = obj && (obj.playabilityStatus ? obj : obj.playerResponse);
      const parts = [where];
      if (foundKeys.length) parts.push('광고데이터:' + [...new Set(foundKeys)].join('/'));
      if (pr && pr.playabilityStatus) parts.push('상태:' + pr.playabilityStatus.status);
      if (pr && pr.streamingData) parts.push(pr.streamingData.serverAbrStreamingUrl ? 'SABR' : 'stream');
      return parts.join(' ');
    } catch (e) { return where; }
  }

  // ---------- 0. 유튜브의 '5초 지연' 없애기 ----------
  // 광고 차단을 눈치채면 유튜브가 영상 시작 전에 5초짜리 대기 타이머를 거는데,
  // 그 타이머(5초 근처 + resolve 호출)를 찾아 바로 끝나게 바꿈.
  const origSetTimeout = window.setTimeout;
  window.setTimeout = function (fn, delay, ...rest) {
    try {
      if (typeof fn === 'function' && delay >= 4000 && delay <= 6000 && shouldStrip()) {
        const src = Function.prototype.toString.call(fn);
        if (/resolve\(1\)|\.resolve\(|resolve\(\)/.test(src) && src.length < 400) {
          if (typeof diag === 'function') diag('5초지연제거', String(delay));
          return origSetTimeout.call(this, fn, 1, ...rest);
        }
        // 못 잡은 5초 타이머도 진단에 남겨서 다음에 패턴을 고칠 수 있게
        if (typeof diag === 'function') diag('5초타이머(그대로)', src.replace(/\s+/g, ' ').slice(0, 90));
      }
    } catch (e) { /* 무시 */ }
    return origSetTimeout.call(this, fn, delay, ...rest);
  };

  // ---------- 1. 데이터 단계에서 광고 제거 (강화판) ----------
  // 광고 정보가 데이터 깊숙이 들어 있어도 전부 찾아 지움. 일부만 남으면 플레이어가 광고를 기다리며 멈추기 때문.
  // enforcementMessageViewModel = "광고 차단기 사용 중" 경고창
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adBreakParams', 'enforcementMessageViewModel'];
  const AD_RE = /"(adPlacements|playerAds|adSlots|adBreakHeartbeatParams|adBreakParams|enforcementMessageViewModel)"/;
  let pendingStripped = 0;

  const isPlayerObj = o => !!(o.videoDetails || o.playabilityStatus || o.streamingData);

  function strip(obj, depth = 0, inPlayer = false) {
    if (!obj || typeof obj !== 'object' || depth > 24) return;
    if (Array.isArray(obj)) {
      for (const o of obj) if (o && typeof o === 'object') strip(o, depth + 1, inPlayer);
      return;
    }
    const player = inPlayer || isPlayerObj(obj);
    const allowed = player ? shouldStripPlayer() : true;
    if (allowed) {
      for (const k of AD_KEYS) {
        if (k in obj) {
          pendingStripped += Array.isArray(obj[k]) ? obj[k].length : 1;
          foundKeys.push(k);
          delete obj[k];
        }
      }
    }
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === 'object') strip(v, depth + 1, player);
    }
  }

  function stripText(txt) {
    if (typeof txt !== 'string' || !AD_RE.test(txt)) return txt;
    try {
      const o = origParse(txt);
      strip(o);
      return JSON.stringify(o);
    } catch (e) { return txt; }
  }

  const API_RE = /\/youtubei\/v1\/(player|next|browse|search|reel|guide)/;

  setInterval(() => {
    if (pendingStripped > 0) {
      report({ type: 'stripped', count: pendingStripped });
      pendingStripped = 0;
    }
  }, 2000);

  // (1) 페이지가 JSON 글자를 객체로 바꿀 때
  JSON.parse = function (...args) {
    const r = origParse.apply(this, args);
    try {
      if (shouldStrip() && typeof args[0] === 'string' && AD_RE.test(args[0])) strip(r);
    } catch (e) { /* 무시 */ }
    return r;
  };

  // (2) fetch 응답을 json()/text()로 읽을 때
  const origJson = Response.prototype.json;
  Response.prototype.json = async function (...args) {
    const r = await origJson.apply(this, args);
    try {
      const api = API_RE.exec(this.url || '');
      foundKeys = [];
      if (shouldStrip()) strip(r);
      if (api) diag('응답', describe(r, 'fetch.json ' + api[1]));
    } catch (e) { /* 무시 */ }
    return r;
  };
  const origText = Response.prototype.text;
  Response.prototype.text = async function (...args) {
    const t = await origText.apply(this, args);
    try {
      const api = API_RE.exec(this.url || '');
      if (api) {
        foundKeys = [];
        const out = shouldStrip() ? stripText(t) : t;
        diag('응답', 'fetch.text ' + api[1] + (foundKeys.length ? ' 광고데이터:' + [...new Set(foundKeys)].join('/') : '') + (t.includes('serverAbrStreamingUrl') ? ' SABR' : ''));
        return out;
      }
    } catch (e) { /* 무시 */ }
    return t;
  };

  // (3) 옛날 방식 통신(XMLHttpRequest)으로 받을 때
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try { this.__ytabApi = API_RE.test(String(url)); } catch (e) { /* 무시 */ }
    return origOpen.call(this, method, url, ...rest);
  };
  const rtDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
  const rDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
  if (rtDesc && rtDesc.get) {
    Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
      configurable: true,
      get() {
        const t = rtDesc.get.call(this);
        if (this.__ytabApi && this.readyState === 4 && shouldStrip()) {
          if (this.__ytabCache === undefined) {
            foundKeys = [];
            this.__ytabCache = stripText(t);
            diag('응답', 'xhr' + (foundKeys.length ? ' 광고데이터:' + [...new Set(foundKeys)].join('/') : ''));
          }
          return this.__ytabCache;
        }
        return t;
      }
    });
  }
  if (rDesc && rDesc.get) {
    Object.defineProperty(XMLHttpRequest.prototype, 'response', {
      configurable: true,
      get() {
        const r = rDesc.get.call(this);
        if (!this.__ytabApi || this.readyState !== 4 || !shouldStrip()) return r;
        if (typeof r === 'string') return this.responseText;
        if (r && typeof r === 'object' && !(r instanceof ArrayBuffer) && !(r instanceof Blob)) { try { strip(r); } catch (e) { /* 무시 */ } }
        return r;
      }
    });
  }

  // (4) 페이지에 처음부터 박혀 오는 데이터
  for (const name of ['ytInitialPlayerResponse', 'ytInitialData', 'ytInitialReelWatchSequenceResponse']) {
    let value = window[name];
    try { if (value && shouldStrip()) { foundKeys = []; strip(value); diag('초기데이터', describe(value, name)); } } catch (e) { /* 무시 */ }
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get() { return value; },
        set(v) {
          try {
            foundKeys = [];
            if (shouldStrip()) strip(v);
            if (name !== 'ytInitialData') diag('초기데이터', describe(v, name));
          } catch (e) { /* 무시 */ }
          value = v;
        }
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
      ['loadstart', 'loadedmetadata', 'canplay', 'waiting', 'stalled', 'playing', 'pause', 'emptied'].forEach(ev =>
        v.addEventListener(ev, () => diag('영상:' + ev, 'rs' + v.readyState + ' t' + v.currentTime.toFixed(1) + (document.querySelector('.ad-showing') ? ' 광고표시중' : ''))));
    }
  }
  setInterval(hookPlayer, 500);

  // ---------- 재생 밀어주기: 데이터는 도착했는데 영상이 멈춰 있으면 바로 재생 ----------
  setInterval(() => {
    if (nudged || !shouldStrip() || !/\/watch|\/shorts/.test(location.pathname)) return;
    if (document.querySelector('.ad-showing')) return;
    const p = document.getElementById('movie_player');
    const v = (p || document).querySelector('video');
    if (!v) return;
    const since = performance.now() - navAt;
    if (since < 700) return;
    if (v.readyState >= 3 && v.currentTime < 0.2 && (v.paused || since > 1500)) {
      nudged = true;
      diag('밀어주기', 'rs' + v.readyState + ' paused=' + v.paused);
      try { p && p.playVideo && p.playVideo(); } catch (e) { /* 무시 */ }
      try { v.play(); } catch (e) { /* 무시 */ }
      if (v.currentTime < 0.2) { try { v.currentTime = Math.max(v.currentTime, 0.01); } catch (e) { /* 무시 */ } }
    }
  }, 250);
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
