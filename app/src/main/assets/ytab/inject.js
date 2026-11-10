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
  const PLAYER_KEYS_ALL = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  const DEFAULTS = { enabled: true, mode: 'all', method: 'strip', stripKeys: PLAYER_KEYS_ALL, blockedCategories: [], blockedAdvertisers: [] };

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
  // 이번 영상에서: 요청 바꾸기가 적용됐는지 / 바꾸지 못한 데이터에 광고 흔적이 있었는지
  let editedSinceNav = false;
  let guardLogged = false;
  let adDataSinceNav = false;
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
      editedSinceNav = false;
      adDataSinceNav = false;
      variant = 0;
      guardLogged = false;
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

  // ---------- 0. 흔적 숨기기 ----------
  // 유튜브는 페이지 기본 기능(JSON.parse, fetch 응답 등)이 바꿔치기됐는지 검사해서
  // 차단을 눈치채면 영상 시작을 약 5초 늦춤. 바꾼 기능도 검사하면 원래 기능처럼 보이게 함.
  const nativeToString = Function.prototype.toString;
  const cloaked = new WeakMap();
  const fakeToString = function toString() {
    const real = cloaked.get(this);
    return nativeToString.call(real || this);
  };
  cloaked.set(fakeToString, nativeToString);
  try {
    Object.defineProperty(Function.prototype, 'toString', { value: fakeToString, writable: true, configurable: true, enumerable: false });
  } catch (e) { /* 무시 */ }
  function cloak(fake, real) {
    cloaked.set(fake, real);
    try { Object.defineProperty(fake, 'name', { value: real.name, configurable: true }); } catch (e) { /* 무시 */ }
    try { Object.defineProperty(fake, 'length', { value: real.length, configurable: true }); } catch (e) { /* 무시 */ }
    return fake;
  }
  function patchMethod(obj, key, make) {
    const real = obj[key];
    const fake = cloak(make(real), real);
    const d = Object.getOwnPropertyDescriptor(obj, key) || { writable: true, configurable: true, enumerable: false };
    Object.defineProperty(obj, key, { value: fake, writable: d.writable !== false, configurable: true, enumerable: !!d.enumerable });
  }

  // ---------- 0-1. 요청 단계: 서버가 처음부터 광고 없는 영상을 주게 ----------
  // (uBlock Origin 2026-11 유튜브 규칙 참고) 영상 요청(/player)에 표시를 바꿔 보내면
  // 서버가 광고 없이 응답 → 광고 길이만큼 기다리는 일이 안 생김.
  // 방법이 막히면(재생 불가) 다음 방법으로 바꿔서 영상을 다시 불러옴.
  // 방법 순서. '요청 안 바꿈'은 쓰지 않음. 영상마다 첫 번째 방법부터 시작 (저장하지 않음)
  const VARIANTS = ['channel', 'lactmilli', 'yahi', 'inline'];
  let variant = 0;
  try { sessionStorage.removeItem('ytab_variant'); } catch (e) { /* 무시 */ }
  function setVariant(i) { variant = Math.min(VARIANTS.length - 1, i); }
  const isPC = () => location.hostname === 'www.youtube.com';

  function editPlayerRequest(o) {
    const v = VARIANTS[variant];
    if (!v) return;
    const cpc = o.playbackContext && o.playbackContext.contentPlaybackContext;
    const client = o.context && o.context.client;
    if (v === 'channel' && client && client.clientName === 'WEB') client.clientScreen = 'CHANNEL';
    if (v === 'lactmilli') o.params = '8AUB';
    if (v === 'yahi') o.params = 'YAHI';
    if (v === 'inline' && cpc) cpc.isInlinePlaybackNoAd = true;
    if (cpc && (v === 'channel' || v === 'lactmilli' || v === 'inline')) cpc.lactMilliseconds = String(Date.now());
    if (cpc && typeof cpc.referer === 'string') cpc.referer = cpc.referer.replace(/(?:#reloadxhr)?$/, '#reloadxhr');
  }

  patchMethod(JSON, 'stringify', real => function stringify(value, ...rest) {
    try {
      if (value && typeof value === 'object' && value.attestationRequest && isPC() && shouldStripPlayer() &&
          value.playbackContext && value.playbackContext.contentPlaybackContext) {
        editPlayerRequest(value);
        editedSinceNav = true;
        lastEditAt = performance.now();
        diag('요청수정', VARIANTS[variant] || '없음');
      }
    } catch (e) { /* 무시 */ }
    return real.call(this, value, ...rest);
  });

  // 유튜브가 거는 17초짜리 대기 타이머를 거의 0초로
  patchMethod(window, 'setTimeout', real => function setTimeout(fn, delay, ...rest) {
    try {
      if (delay === 17000 && typeof fn === 'function' && shouldStrip() && nativeToString.call(fn).includes('[native code]')) {
        diag('대기타이머단축', '17000ms');
        return real.call(this, fn, 17, ...rest);
      }
    } catch (e) { /* 무시 */ }
    return real.call(this, fn, delay, ...rest);
  });

  // '이상 행동 감지' 처리 무력화
  patchMethod(Promise.prototype, 'then', real => function then(onFulfilled, ...rest) {
    try {
      if (typeof onFulfilled === 'function' && isPC() && shouldStrip() &&
          nativeToString.call(onFulfilled).includes('onAbnormalityDetected')) {
        diag('이상감지무력화', '');
        onFulfilled = function () {};
      }
    } catch (e) { /* 무시 */ }
    return real.call(this, onFulfilled, ...rest);
  });

  // 재생 불가·멈춤 감시 → 다음 방법으로 다시 불러오기, 영상에 붙은 광고(SSAP)는 끝으로 넘기기
  let rotatedFor = '';
  let reloadedFor = '';
  let lastEditAt = 0;
  // 판단 코드가 어디서 멈췄는지 영상마다 한 번만 기록
  let stopLogged = '';
  function stop(reason) {
    const key = location.pathname + location.search + ':' + reason;
    if (stopLogged === key) return;
    stopLogged = key;
    if (performance.now() - navAt > 1200) diag('판단멈춤', reason);
  }
  // 플레이어 조작 기능 찾기 (PC 유튜브는 두 군데 중 한 곳에 있음)
  function findPlayerApi() {
    const el = document.getElementById('movie_player');
    if (el && typeof el.getPlayerResponse === 'function') return el;
    const ytdPlayer = document.querySelector('ytd-player');
    try {
      const api = ytdPlayer && typeof ytdPlayer.getPlayer === 'function' && ytdPlayer.getPlayer();
      if (api && typeof api.getPlayerResponse === 'function') return api;
    } catch (e) { /* 무시 */ }
    try {
      const api2 = ytdPlayer && ytdPlayer.player_;
      if (api2 && typeof api2.getPlayerResponse === 'function') return api2;
    } catch (e) { /* 무시 */ }
    return null;
  }

  function watchGuard() {
    if (!isPC() || !shouldStripPlayer() || !/\/watch/.test(location.pathname)) return;
    const p = findPlayerApi();
    if (!p) return stop('플레이어 조작 기능 못 찾음');
    let resp, stats, prog;
    try { resp = p.getPlayerResponse(); stats = p.getStatsForNerds && p.getStatsForNerds(); prog = p.getProgressState && p.getProgressState(); }
    catch (e) { return stop('플레이어 정보 읽기 오류 ' + (e && e.message || '')); }
    if (!resp) return stop('영상 정보 없음');
    // 영상에 붙어 온 광고 구간이면 끝으로 넘김
    if (stats && typeof stats.debug_info === 'string' && stats.debug_info.startsWith('SSAP, AD') && prog && prog.duration > 0) {
      diag('붙은광고넘김', prog.duration.toFixed(1) + 's');
      try { p.seekTo(prog.duration); } catch (e) { /* 무시 */ }
      return;
    }
    const vid = resp.videoDetails && resp.videoDetails.videoId;
    // 아직 이전 영상 정보면 건너뜀 (주소의 v= 와 같을 때만)
    if (!vid || new URLSearchParams(location.search).get('v') !== vid) return stop('이전 영상 정보 ' + (vid || '-'));
    const start = (resp.playerConfig && resp.playerConfig.playbackStartConfig && resp.playerConfig.playbackStartConfig.startSeconds) ||
      parseInt(new URLSearchParams(location.search).get('t') || '0', 10) || 0;
    const v = document.querySelector('#movie_player video, ytd-player video, video');

    // (1) 요청을 바꾸지 못한 경로로 받은 영상에 광고 흔적이 있으면 → 기다리지 말고 바로 다시 요청
    //     (다시 요청할 땐 요청 바꾸기가 적용돼서 서버가 광고 없이 바로 보내줌)
    if (!guardLogged && performance.now() - navAt > 1500) {
      guardLogged = true;
      diag('판단', `광고흔적:${adDataSinceNav} 요청수정:${editedSinceNav} 방법:${VARIANTS[variant]} 다시요청함:${reloadedFor === vid} rs${v ? v.readyState : '-'}`);
    }
    if (adDataSinceNav && !editedSinceNav && reloadedFor !== vid) {
      const playing = v && v.readyState >= 3 && !v.paused && v.currentTime > 0.3;
      if (!playing) {
        reloadedFor = vid;
        diag('바로다시요청', '바꾸지 못한 요청 → ' + VARIANTS[variant]);
        try { p.loadVideoById(vid, start); } catch (e) { diag('다시요청오류', String(e && e.message || e)); }
        return;
      }
    }

    // (2) 바꾼 요청인데도 재생 불가거나 멈춰 있으면 → 다음 방법으로
    if (!editedSinceNav || rotatedFor === vid + ':' + variant) return;
    const status = resp.playabilityStatus || {};
    const err = JSON.stringify(status.errorScreen || {});
    const unplayable = status.status === 'UNPLAYABLE' && err.includes('3037019');
    const stalled = v && v.readyState === 0 && performance.now() - lastEditAt > 2500 && !document.querySelector('.ad-showing');
    if ((unplayable || stalled) && variant < VARIANTS.length - 1) {
      rotatedFor = vid + ':' + variant;
      setVariant(variant + 1);
      diag('방법변경', (unplayable ? '재생불가' : '멈춤') + ' → ' + (VARIANTS[variant] || '없음'));
      try { p.loadVideoById(vid, start); } catch (e) { diag('다시요청오류', String(e && e.message || e)); }
    }
  }
  setInterval(() => { try { watchGuard(); } catch (e) { stop('오류 ' + (e && e.message || e)); } }, 500);

  // ---------- 1. 데이터 단계에서 광고 제거 (강화판) ----------
  // 광고 정보가 데이터 깊숙이 들어 있어도 전부 찾아 지움. 일부만 남으면 플레이어가 광고를 기다리며 멈추기 때문.
  // enforcementMessageViewModel = "광고 차단기 사용 중" 경고창
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adBreakParams', 'enforcementMessageViewModel'];
  const AD_RE = /"(adPlacements|playerAds|adSlots|adBreakHeartbeatParams|adBreakParams|enforcementMessageViewModel|adSlotRenderer|promotedSparklesWebRenderer|searchPyvRenderer|statementBannerRenderer|promotedVideoRenderer|compactPromotedVideoRenderer|inFeedAdLayoutRenderer)"/;

  // 홈·검색·추천 목록에 끼어 있는 광고 칸 (목록에서 통째로 빼버림)
  function isFeedAd(o) {
    if (!o || typeof o !== 'object') return false;
    const c = o.richItemRenderer && o.richItemRenderer.content;
    return !!(o.adSlotRenderer || o.promotedSparklesWebRenderer || o.searchPyvRenderer || o.promotedVideoRenderer ||
      o.compactPromotedVideoRenderer || o.inFeedAdLayoutRenderer ||
      (c && (c.adSlotRenderer || c.inFeedAdLayoutRenderer || c.promotedSparklesWebRenderer)) ||
      (o.richSectionRenderer && o.richSectionRenderer.content && o.richSectionRenderer.content.statementBannerRenderer));
  }
  let pendingStripped = 0;

  const isPlayerObj = o => !!(o.videoDetails || o.playabilityStatus || o.streamingData);

  function strip(obj, depth = 0, inPlayer = false) {
    if (!obj || typeof obj !== 'object' || depth > 24) return;
    if (Array.isArray(obj)) {
      for (let i = obj.length - 1; i >= 0; i--) {
        if (isFeedAd(obj[i])) { obj.splice(i, 1); pendingStripped += 1; foundKeys.push('피드광고'); }
      }
      for (const o of obj) if (o && typeof o === 'object') strip(o, depth + 1, inPlayer);
      return;
    }
    const player = inPlayer || isPlayerObj(obj);
    const allowed = player ? shouldStripPlayer() : true;
    if (allowed) {
      // 영상 재생 데이터에서는 '실험: 지울 항목'에서 고른 것만 지움 (경고창 데이터는 항상 지움)
      const keys = player
        ? AD_KEYS.filter(k => !PLAYER_KEYS_ALL.includes(k) || (settings().stripKeys || PLAYER_KEYS_ALL).includes(k))
        : AD_KEYS;
      for (const k of keys) {
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
  patchMethod(JSON, 'parse', real => function parse(...args) {
    const r = real.apply(this, args);
    try {
      if (shouldStrip() && typeof args[0] === 'string' && AD_RE.test(args[0])) {
        foundKeys = [];
        strip(r);
        if (foundKeys.length && (r && (r.playabilityStatus || r.playerResponse || r.videoDetails))) {
          if (!editedSinceNav) adDataSinceNav = true;
          diag('광고데이터제거', 'JSON ' + [...new Set(foundKeys)].join('/'));
        }
      }
    } catch (e) { /* 무시 */ }
    return r;
  });

  // (2) fetch 응답을 json()/text()로 읽을 때
  patchMethod(Response.prototype, 'json', real => async function json(...args) {
    const r = await real.apply(this, args);
    try {
      const api = API_RE.exec(this.url || '');
      foundKeys = [];
      if (shouldStrip()) strip(r);
      if (api) diag('응답', describe(r, 'fetch.json ' + api[1]));
    } catch (e) { /* 무시 */ }
    return r;
  });
  patchMethod(Response.prototype, 'text', real => async function text(...args) {
    const t = await real.apply(this, args);
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
  });

  // (3) 옛날 방식 통신(XMLHttpRequest)으로 받을 때
  const xhrApi = new WeakSet();
  patchMethod(XMLHttpRequest.prototype, 'open', real => function open(method, url, ...rest) {
    try { if (API_RE.test(String(url))) xhrApi.add(this); else xhrApi.delete(this); } catch (e) { /* 무시 */ }
    return real.call(this, method, url, ...rest);
  });
  const xhrCache = new WeakMap();
  const rtDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
  const rDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
  if (rtDesc && rtDesc.get) {
    Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
      configurable: true,
      enumerable: rtDesc.enumerable,
      get: cloak(function () {
        const t = rtDesc.get.call(this);
        if (xhrApi.has(this) && this.readyState === 4 && shouldStrip()) {
          if (!xhrCache.has(this)) {
            foundKeys = [];
            xhrCache.set(this, stripText(t));
            diag('응답', 'xhr' + (foundKeys.length ? ' 광고데이터:' + [...new Set(foundKeys)].join('/') : ''));
          }
          return xhrCache.get(this);
        }
        return t;
      }, rtDesc.get)
    });
  }
  if (rDesc && rDesc.get) {
    Object.defineProperty(XMLHttpRequest.prototype, 'response', {
      configurable: true,
      enumerable: rDesc.enumerable,
      get: cloak(function () {
        const r = rDesc.get.call(this);
        if (!xhrApi.has(this) || this.readyState !== 4 || !shouldStrip()) return r;
        if (typeof r === 'string') return this.responseText;
        if (r && typeof r === 'object' && !(r instanceof ArrayBuffer) && !(r instanceof Blob)) { try { strip(r); } catch (e) { /* 무시 */ } }
        return r;
      }, rDesc.get)
    });
  }

  // (4) 페이지에 처음부터 박혀 오는 데이터
  // 값이 들어오는 순간 한 번만 광고를 지우고, 곧바로 평범한 변수로 되돌려 흔적을 남기지 않음
  for (const name of ['ytInitialPlayerResponse', 'ytInitialData', 'ytInitialReelWatchSequenceResponse']) {
    const existing = window[name];
    if (existing !== undefined) {
      try { if (shouldStrip()) { foundKeys = []; strip(existing); if (name === 'ytInitialPlayerResponse' && foundKeys.length) adDataSinceNav = true; diag('초기데이터', describe(existing, name)); } } catch (e) { /* 무시 */ }
      continue;
    }
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get: cloak(function () { return undefined; }, function get() {}),
        set: cloak(function (v) {
          try {
            foundKeys = [];
            if (shouldStrip()) strip(v);
            if (name !== 'ytInitialData') {
              if (name === 'ytInitialPlayerResponse' && foundKeys.length) adDataSinceNav = true;
              diag('초기데이터', describe(v, name));
            }
          } catch (e) { /* 무시 */ }
          Object.defineProperty(window, name, { value: v, writable: true, configurable: true, enumerable: true });
        }, function set() {})
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
    html[data-ytab-hide="1"] ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
    html[data-ytab-hide="1"] ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer),
    html[data-ytab-hide="1"] ytd-rich-section-renderer:has(ytd-statement-banner-renderer),
    html[data-ytab-hide="1"] ytd-ad-slot-renderer, html[data-ytab-hide="1"] ytd-in-feed-ad-layout-renderer,
    html[data-ytab-hide="1"] ytd-promoted-sparkles-web-renderer, html[data-ytab-hide="1"] ytd-promoted-video-renderer,
    html[data-ytab-hide="1"] ytd-compact-promoted-video-renderer, html[data-ytab-hide="1"] ytd-search-pyv-renderer,
    html[data-ytab-hide="1"] ytd-display-ad-renderer, html[data-ytab-hide="1"] ytd-banner-promo-renderer,
    html[data-ytab-hide="1"] ytd-statement-banner-renderer, html[data-ytab-hide="1"] #masthead-ad,
    html[data-ytab-hide="1"] #player-ads, html[data-ytab-hide="1"] ytd-action-companion-ad-renderer,
    html[data-ytab-hide="1"] ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
    html[data-ytab-hide="1"] ytm-promoted-sparkles-web-renderer, html[data-ytab-hide="1"] ytm-companion-ad-renderer,
    html[data-ytab-hide="1"] ad-slot-renderer, html[data-ytab-hide="1"] ytm-rich-item-renderer:has(ad-slot-renderer) {
      display: none !important;
    }
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
