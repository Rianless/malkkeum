// ==UserScript==
// @name         말끔 (Malkkeum) — 유튜브 광고 걸러내기
// @namespace    https://github.com/Rianless/malkkeum
// @version      1.0
// @description  광고 없는 영상 요청 + 광고·스폰서 칸 제거 + 댓글 최신순 (아이폰 사파리용)
// @match        *://m.youtube.com/*
// @match        *://www.youtube.com/*
// @run-at       document-start
// @inject-into  page
// @noframes
// @updateURL    https://raw.githubusercontent.com/Rianless/malkkeum/main/ios/malkkeum.user.js
// @downloadURL  https://raw.githubusercontent.com/Rianless/malkkeum/main/ios/malkkeum.user.js
// ==/UserScript==

// ---- classifier.js ----
// 광고 텍스트(광고주명·제목·도메인)를 보고 카테고리를 추정하는 규칙 기반 분류기.
// 페이지(MAIN world)와 팝업 양쪽에서 함께 씁니다.
(function (root) {
  'use strict';

  const CATEGORIES = [
    { id: 'game', name: '게임', words: ['게임', 'game', 'rpg', 'mmorpg', '모바일게임', '사전예약', '사전 예약', '플레이', 'play now', '리니지', '던전', '전투', '길드', '가챠', '방치형', 'steam', 'nexon', '넥슨', '넷마블', 'ncsoft', '엔씨', '크래프톤', '스마일게이트', 'supercell', 'hoyoverse'] },
    { id: 'finance', name: '금융·보험·투자', words: ['보험', '대출', '카드', '은행', 'bank', '증권', '주식', '투자', '코인', '비트코인', 'crypto', '재테크', '적금', '금리', '연금', '토스', '카카오뱅크', '케이뱅크', '삼성생명', '보장', '신용', 'loan', 'insurance', 'invest'] },
    { id: 'shopping', name: '쇼핑·커머스', words: ['쇼핑', '할인', '세일', 'sale', '특가', '최저가', '쿠폰', '무료배송', '쿠팡', 'coupang', '11번가', 'g마켓', '지마켓', '테무', 'temu', '알리', 'aliexpress', '무신사', '오늘의집', '29cm', 'shop', 'store', '구매', '주문'] },
    { id: 'beauty', name: '뷰티·패션', words: ['화장품', '뷰티', 'beauty', '스킨', '세럼', '크림', '쿠션', '립', '향수', '헤어', '탈모', '패션', '옷', '신발', '가방', '올리브영', '이니스프리', '설화수', 'fashion', 'skincare'] },
    { id: 'food', name: '식품·배달·외식', words: ['배달', '배민', '배달의민족', '요기요', '쿠팡이츠', '치킨', '피자', '버거', '맥도날드', '버거킹', '커피', '스타벅스', '음료', '맥주', '라면', '과자', '식품', '밀키트', '마켓컬리', '컬리', 'food', 'delivery'] },
    { id: 'education', name: '교육·자격증', words: ['강의', '인강', '교육', '학원', '자격증', '공무원', '토익', '영어회화', '코딩', '부트캠프', '수능', '메가스터디', '해커스', '에듀윌', '클래스101', '패스트캠퍼스', 'class', 'course', 'learn'] },
    { id: 'app', name: '앱·IT·서비스', words: ['앱', 'app', '다운로드', 'download', '설치', '구독', '클라우드', 'ai', '인공지능', '스마트폰', '갤럭시', 'galaxy', 'iphone', '아이폰', '노트북', '삼성', 'samsung', 'apple', 'lg', '통신', 'skt', 'kt', 'lg u+', '요금제', '알뜰폰', 'vpn'] },
    { id: 'car', name: '자동차', words: ['자동차', '신차', '시승', '현대자동차', '기아', 'kia', 'hyundai', '제네시스', 'genesis', 'bmw', '벤츠', 'tesla', '테슬라', '전기차', 'suv', '렌터카', '중고차', '엔카', '타이어'] },
    { id: 'travel', name: '여행·숙박', words: ['여행', '항공', '항공권', '호텔', '숙소', '숙박', '야놀자', '여기어때', '아고다', 'agoda', 'booking', '에어비앤비', 'airbnb', '트립닷컴', '대한항공', '아시아나', '제주', '패키지'] },
    { id: 'health', name: '건강·의료·다이어트', words: ['건강', '영양제', '유산균', '비타민', '다이어트', '체중', '병원', '의원', '치과', '성형', '피부과', '한의원', '약국', '헬스', '필라테스', '탈모치료', '건강기능식품'] },
    { id: 'realestate', name: '부동산·인테리어', words: ['부동산', '아파트', '분양', '청약', '오피스텔', '직방', '다방', '인테리어', '이사', '리모델링', '가구', '침대', '매트리스'] },
    { id: 'media', name: '엔터·콘텐츠', words: ['영화', '개봉', '드라마', '넷플릭스', 'netflix', '디즈니', 'disney', '티빙', 'tving', '웨이브', '쿠팡플레이', '웹툰', '웹소설', '카카오페이지', '네이버웹툰', '리디', '콘서트', '앨범', '공연', 'music'] }
  ];

  const OTHER = { id: 'other', name: '기타·미분류' };

  function classify(info) {
    const text = [info.advertiser, info.title, info.author, info.domain, info.extra]
      .filter(Boolean).join(' ').toLowerCase();
    if (!text.trim()) return { id: OTHER.id, name: OTHER.name, score: 0, hits: [] };

    let best = null;
    for (const cat of CATEGORIES) {
      const hits = cat.words.filter(w => text.includes(w.toLowerCase()));
      // 긴 단어가 맞으면 더 확실한 신호로 봅니다.
      const score = hits.reduce((s, w) => s + Math.min(3, Math.ceil(w.length / 2)), 0);
      if (score > 0 && (!best || score > best.score)) best = { id: cat.id, name: cat.name, score, hits };
    }
    return best || { id: OTHER.id, name: OTHER.name, score: 0, hits: [] };
  }

  function categoryName(id) {
    if (id === OTHER.id) return OTHER.name;
    const c = CATEGORIES.find(c => c.id === id);
    return c ? c.name : id;
  }

  root.YTAB_CLASSIFIER = {
    classify,
    categoryName,
    categories: CATEGORIES.map(c => ({ id: c.id, name: c.name })).concat([OTHER])
  };
})(typeof window !== 'undefined' ? window : globalThis);

// ---- inject.js ----
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
  // 페이지 오류와 화면 상태 기록 (하얀 화면 원인 찾기용)
  window.addEventListener('error', e => { try { diag('페이지오류', String(e.message || e.error || '').slice(0, 160) + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno); } catch (x) { /* 무시 */ } });
  window.addEventListener('unhandledrejection', e => { try { const r = e.reason; diag('페이지오류', 'promise ' + String(r && (r.stack || r.message) || r).slice(0, 160)); } catch (x) { /* 무시 */ } });
  function screenCheck() {
    try {
      const app = document.querySelector('ytm-app, ytd-app');
      const body = document.body;
      const items = document.querySelectorAll('ytm-rich-item-renderer, ytm-video-with-context-renderer, ytd-rich-item-renderer, ytm-item-section-renderer').length;
      diag('화면상태', `창${innerWidth}x${innerHeight} app:${app ? app.tagName.toLowerCase() + ' h' + Math.round(app.getBoundingClientRect().height) : '없음'} body h${body ? body.scrollHeight : 0} 항목${items} ${document.readyState}`);
    } catch (x) { /* 무시 */ }
  }
  setTimeout(screenCheck, 3000);
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
      setTimeout(screenCheck, 3000);
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
  // PC는 uBlock Origin 순서 그대로, 모바일은 어느 기기에서나 통하는 'inline'(광고 없는 미리보기 재생)부터
  const VARIANTS_PC = ['channel', 'lactmilli', 'yahi', 'inline'];
  const VARIANTS_M = ['inline', 'lactmilli', 'yahi', 'channel'];
  const isMobileSite = () => location.hostname === 'm.youtube.com';
  const VARIANTS = new Proxy([], { get: (t, k) => (isMobileSite() ? VARIANTS_M : VARIANTS_PC)[k] });
  let variant = 0;
  try { sessionStorage.removeItem('ytab_variant'); } catch (e) { /* 무시 */ }
  function setVariant(i) { variant = Math.min(VARIANTS_PC.length - 1, i); }
  const isPC = () => location.hostname === 'www.youtube.com';
  const isYT = () => isPC() || isMobileSite();

  function editPlayerRequest(o) {
    const v = VARIANTS[variant];
    if (!v) return;
    const cpc = o.playbackContext && o.playbackContext.contentPlaybackContext;
    const client = o.context && o.context.client;
    if (v === 'channel' && client && (client.clientName === 'WEB' || client.clientName === 'MWEB')) client.clientScreen = 'CHANNEL';
    if (v === 'lactmilli') o.params = '8AUB';
    if (v === 'yahi') o.params = 'YAHI';
    if (v === 'inline' && cpc) cpc.isInlinePlaybackNoAd = true;
    if (cpc && (v === 'channel' || v === 'lactmilli' || v === 'inline')) cpc.lactMilliseconds = String(Date.now());
    if (cpc && typeof cpc.referer === 'string') cpc.referer = cpc.referer.replace(/(?:#reloadxhr)?$/, '#reloadxhr');
  }

  patchMethod(JSON, 'stringify', real => function stringify(value, ...rest) {
    try {
      const isPlayerReq = value && typeof value === 'object' && value.playbackContext && value.playbackContext.contentPlaybackContext &&
        // PC 유튜브는 요청을 바꾸면 '이 콘텐츠는 이용할 수 없습니다'가 떠서, 모바일에서만 바꿈
        // (PC는 광고 정보를 지우기만 해도 바로 재생됨)
        isMobileSite() && !!value.videoId;
      if (isPlayerReq && shouldStripPlayer()) {
        editPlayerRequest(value);
        editedSinceNav = true;
        lastEditAt = performance.now();
        diag('요청수정', (isMobileSite() ? '모바일 ' : 'PC ') + (VARIANTS[variant] || '없음'));
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
      if (typeof onFulfilled === 'function' && isYT() && shouldStrip() &&
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
    // 영상을 열고 1.2초가 지난 뒤에도 같은 이유로 멈춰 있을 때만, 영상마다 이유별로 한 번 기록
    if (performance.now() - navAt < 1200) return;
    const key = location.pathname + location.search + ':' + reason;
    if (stopLogged === key) return;
    stopLogged = key;
    diag('판단멈춤', reason);
  }
  let aliveFor = '';
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
    if (/\/watch/.test(location.pathname) && aliveFor !== location.search && performance.now() - navAt > 1200) {
      aliveFor = location.search;
      diag('판단시작', `${isPC() ? 'PC' : isMobileSite() ? '모바일' : location.hostname} 미리제거:${shouldStripPlayer()}`);
    }
    if (!isMobileSite() || !shouldStripPlayer() || !/\/watch/.test(location.pathname)) return;
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
    if ((unplayable || stalled) && variant < VARIANTS_PC.length - 1) {
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
  const AD_RE = /"(adPlacements|playerAds|adSlots|adBreakHeartbeatParams|adBreakParams|enforcementMessageViewModel|adSlotRenderer|promotedSparklesWebRenderer|searchPyvRenderer|statementBannerRenderer|promotedVideoRenderer|compactPromotedVideoRenderer|inFeedAdLayoutRenderer|adClientParams|reelPlayerAdRenderer|adsEngagementPanelContentRenderer)"/;

  // 홈·검색·추천 목록에 끼어 있는 광고 칸 (목록에서 통째로 빼버림)
  function isFeedAd(o) {
    if (!o || typeof o !== 'object') return false;
    // 쇼츠 사이에 끼는 광고 칸 (넘기다 보면 나오는 광고)
    const rwe = o.command && o.command.reelWatchEndpoint;
    if (rwe && (rwe.adClientParams || (rwe.overlay && rwe.overlay.reelPlayerOverlayRenderer && rwe.overlay.reelPlayerOverlayRenderer.adBadge))) return true;
    if (o.reelWatchEndpoint && o.reelWatchEndpoint.adClientParams) return true;
    if (o.reelPlayerAdRenderer || o.shortsAdRenderer) return true;
    const c = o.richItemRenderer && o.richItemRenderer.content;
    return !!(o.adSlotRenderer || o.promotedSparklesWebRenderer || o.searchPyvRenderer || o.promotedVideoRenderer ||
      o.compactPromotedVideoRenderer || o.inFeedAdLayoutRenderer ||
      (c && (c.adSlotRenderer || c.inFeedAdLayoutRenderer || c.promotedSparklesWebRenderer)) ||
      (o.richSectionRenderer && o.richSectionRenderer.content && o.richSectionRenderer.content.statementBannerRenderer));
  }
  let pendingStripped = 0;

  // ---------- 댓글 정렬 정보 (모바일 댓글에 인기순·최신순 버튼용, comments.js로 넘겨줌) ----------
  function sortToken(o, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 12) return null;
    if (o.continuationCommand && o.continuationCommand.token) return o.continuationCommand.token;
    if (o.reloadContinuationData && o.reloadContinuationData.continuation) return o.reloadContinuationData.continuation;
    for (const k in o) { const t = sortToken(o[k], depth + 1); if (t) return t; }
    return null;
  }
  function collectSort(o, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 40) return;
    const sm = o.sortFilterSubMenuRenderer;
    if (sm && Array.isArray(sm.subMenuItems)) {
      const items = sm.subMenuItems.map(it => ({
        title: it.title || (it.text && it.text.simpleText) || '',
        token: sortToken(it.serviceEndpoint || it.continuation || it),
        selected: !!it.selected
      })).filter(x => x.token);
      if (items.length) document.dispatchEvent(new CustomEvent('malkkeum-sort', { detail: items }));
      return;
    }
    for (const k in o) { const v = o[k]; if (v && typeof v === 'object') collectSort(v, depth + 1); }
  }
  const SORT_MARK = 'sortFilterSubMenuRenderer';

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
    try { if (typeof args[0] === 'string' && args[0].includes(SORT_MARK)) collectSort(r); } catch (e) { /* 무시 */ }
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
      if (api) collectSort(r);
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
      if (typeof t === 'string' && t.includes(SORT_MARK)) { try { collectSort(origParse(t)); } catch (e) { /* 무시 */ } }
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

  // ---------- 2-1. '광고 차단 프로그램은 허용되지 않습니다' 경고창 치우기 ----------
  // 데이터에서 경고창 정보를 지우지만, 다른 경로로 뜨면 화면에서 바로 닫고 멈춘 영상을 다시 재생
  const ENFORCE_SEL = 'ytd-enforcement-message-view-model, ytm-enforcement-message-view-model';
  (function enforceCss() {
    const st = document.createElement('style');
    st.textContent = `
      ytd-enforcement-message-view-model, ytm-enforcement-message-view-model,
      tp-yt-paper-dialog:has(ytd-enforcement-message-view-model),
      ytd-popup-container tp-yt-paper-dialog:has(ytd-enforcement-message-view-model) { display: none !important; }
      body:has(ytd-enforcement-message-view-model) tp-yt-iron-overlay-backdrop { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(st);
  })();
  let enforceSeenAt = 0;
  function clearEnforcement() {
    if (!settings().enabled) return;
    const msg = document.querySelector(ENFORCE_SEL);
    if (!msg) return;
    const dlg = msg.closest('tp-yt-paper-dialog');
    if (dlg) dlg.remove(); else msg.remove();
    document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach(b => { b.style.display = 'none'; b.classList.remove('opened'); });
    document.body && (document.body.style.overflow = '');
    const now = Date.now();
    if (now - enforceSeenAt > 5000) diag('경고창제거', location.pathname);
    enforceSeenAt = now;
    // 경고 때문에 멈춘 영상 다시 재생
    const v = document.querySelector('#movie_player video, video');
    if (v && v.paused && !document.querySelector('.ad-showing')) {
      try { const p = document.getElementById('movie_player'); p && p.playVideo && p.playVideo(); } catch (e) { /* 무시 */ }
      try { v.play(); } catch (e) { /* 무시 */ }
    }
  }
  setInterval(clearEnforcement, 500);

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

// ---- comments.js ----
// 모바일 유튜브 댓글에 '인기순 · 최신순' 버튼 달기 (유튜브 앱처럼)
// 1) 유튜브가 댓글과 함께 보내는 정렬 정보(sortFilterSubMenuRenderer)를 모아둠
// 2) 댓글 창 제목('댓글') 아래에 버튼을 달고, '최신순'을 누르면 그 정보로 최신 댓글을 불러와 보여줌
(() => {
  'use strict';
  if (location.hostname !== 'm.youtube.com') return;
  if (window.__MALKKEUM_COMMENTS__) return;
  window.__MALKKEUM_COMMENTS__ = true;

  const nativeParse = JSON.parse;   // 우리 쪽 해석은 광고 제거 장치를 거치지 않게
  const report = (e, d) => window.postMessage({ __ytab: true, type: 'diag', items: [{ t: 0, e, d }] }, location.origin);

  // ---------- 1. 정렬 정보 받기 ----------
  // 정렬 정보는 inject.js가 유튜브 응답을 확인하는 길목에서 찾아서 'malkkeum-sort' 신호로 넘겨줌
  let sortItems = null;            // [{ title, token, selected }]
  document.addEventListener('malkkeum-sort', ev => {
    if (ev.detail && ev.detail.length) {
      sortItems = ev.detail;
      report('댓글정렬정보', sortItems.map(x => x.title).join(' / '));
    }
  });
  function findToken(o, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 12) return null;
    if (o.continuationCommand && o.continuationCommand.token) return o.continuationCommand.token;
    if (o.reloadContinuationData && o.reloadContinuationData.continuation) return o.reloadContinuationData.continuation;
    for (const k in o) { const t = findToken(o[k], depth + 1); if (t) return t; }
    return null;
  }

  // ---------- 2. 최신 댓글 불러오기 ----------
  // 유튜브 설정값 읽기 (ytcfg.get 우선, 없으면 data_)
  function cfgGet(k) {
    try { if (window.ytcfg && typeof window.ytcfg.get === 'function') { const v = window.ytcfg.get(k); if (v !== undefined) return v; } } catch (e) { /* 무시 */ }
    try { return window.ytcfg && window.ytcfg.data_ && window.ytcfg.data_[k]; } catch (e) { return undefined; }
  }
  function cfg() {
    return {
      INNERTUBE_API_KEY: cfgGet('INNERTUBE_API_KEY'),
      INNERTUBE_CONTEXT: cfgGet('INNERTUBE_CONTEXT'),
      INNERTUBE_CONTEXT_CLIENT_NAME: cfgGet('INNERTUBE_CONTEXT_CLIENT_NAME'),
      INNERTUBE_CLIENT_VERSION: cfgGet('INNERTUBE_CLIENT_VERSION')
    };
  }

  // 모바일(MWEB) 또는 PC(WEB) 방식 요청에 쓸 기본 정보 (항상 client가 있는 객체를 돌려줌)
  function clientContext(kind) {
    const c = cfg();
    const ctx = c.INNERTUBE_CONTEXT || {};
    const base = ctx.client || {};
    if (kind === 'WEB') {
      return { client: { clientName: 'WEB', clientVersion: '2.20261101.00.00', hl: base.hl || 'ko', gl: base.gl || 'KR' } };
    }
    const client = Object.assign({ clientName: 'MWEB', clientVersion: String(c.INNERTUBE_CLIENT_VERSION || '2.20261101.01.00'), hl: base.hl || 'ko', gl: base.gl || 'KR' }, base);
    return Object.assign({}, ctx, { client });
  }
  async function innertube(endpoint, body, kind) {
    const c = cfg();
    const res = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false${c.INNERTUBE_API_KEY ? '&key=' + c.INNERTUBE_API_KEY : ''}`, {
      method: 'POST',
      credentials: kind === 'WEB' ? 'omit' : 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': kind === 'WEB' ? '1' : String(c.INNERTUBE_CONTEXT_CLIENT_NAME || 2),
        'X-Youtube-Client-Version': clientContext(kind).client.clientVersion
      },
      body: JSON.stringify(Object.assign({ context: clientContext(kind) }, body))
    });
    if (!res.ok) throw new Error('응답 ' + res.status);
    return nativeParse(await res.text());
  }
  async function fetchComments(token, kind) {
    return parseComments(await innertube('next', { continuation: token }, kind));
  }

  // 모바일은 정렬 정보를 안 보내서, 같은 영상의 댓글을 PC 방식으로 한 번 더 요청해 정렬 정보를 받음
  function findCommentsContinuation(o, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 40) return null;
    if (o.itemSectionRenderer && /comment/i.test(o.itemSectionRenderer.sectionIdentifier || '')) {
      const t = findToken(o.itemSectionRenderer.contents);
      if (t) return t;
    }
    if (o.engagementPanelSectionListRenderer && /comment/i.test(o.engagementPanelSectionListRenderer.panelIdentifier || '')) {
      const t = findToken(o.engagementPanelSectionListRenderer.content);
      if (t) return t;
    }
    for (const k in o) { const r = findCommentsContinuation(o[k], depth + 1); if (r) return r; }
    return null;
  }
  function findSortItems(o, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 40) return null;
    const sm = o.sortFilterSubMenuRenderer;
    if (sm && Array.isArray(sm.subMenuItems)) {
      return sm.subMenuItems.map(it => ({
        title: it.title || '', token: findToken(it.serviceEndpoint || it.continuation || it), selected: !!it.selected
      })).filter(x => x.token);
    }
    for (const k in o) { const r = findSortItems(o[k], depth + 1); if (r) return r; }
    return null;
  }
  function currentVideoId() {
    const m = location.pathname.match(/\/shorts\/([\w-]{6,})/);
    if (m) return m[1];
    return new URLSearchParams(location.search).get('v');
  }
  const pcSortCache = {};
  async function getPcSortItems() {
    const vid = currentVideoId();
    if (!vid) throw new Error('영상 번호 없음');
    if (pcSortCache[vid]) return pcSortCache[vid];
    const watch = await innertube('next', { videoId: vid }, 'WEB');
    const first = findCommentsContinuation(watch);
    if (!first) throw new Error('PC 댓글 시작 정보 없음');
    const firstPage = await innertube('next', { continuation: first }, 'WEB');
    const items = findSortItems(firstPage);
    if (!items || !items.length) throw new Error('PC 정렬 정보 없음');
    report('댓글정렬정보', 'PC경유 ' + items.map(x => x.title).join(' / '));
    pcSortCache[vid] = items;
    return items;
  }

  function textOf(t) {
    if (!t) return '';
    if (typeof t === 'string') return t;
    if (t.simpleText) return t.simpleText;
    if (t.content) return t.content;
    if (Array.isArray(t.runs)) return t.runs.map(r => r.text).join('');
    return '';
  }

  function parseComments(data) {
    const list = [];
    let next = null;
    // 새 형식: 댓글 내용이 frameworkUpdates 안에 따로 옴
    const entities = {};
    const muts = (((data || {}).frameworkUpdates || {}).entityBatchUpdate || {}).mutations || [];
    for (const m of muts) {
      const p = m.payload && m.payload.commentEntityPayload;
      if (p && p.properties) entities[p.properties.commentId || m.entityKey] = p;
    }
    const walk = (o, depth = 0) => {
      if (!o || typeof o !== 'object' || depth > 30) return;
      if (o.commentThreadRenderer) {
        const t = o.commentThreadRenderer;
        const old = t.comment && t.comment.commentRenderer;
        if (old) {
          list.push({
            author: textOf(old.authorText), time: textOf(old.publishedTimeText), text: textOf(old.contentText),
            likes: textOf(old.voteCount), avatar: old.authorThumbnail && old.authorThumbnail.thumbnails && old.authorThumbnail.thumbnails[0] && old.authorThumbnail.thumbnails[0].url,
            replies: old.replyCount || 0
          });
        } else {
          const vm = t.commentViewModel && (t.commentViewModel.commentViewModel || t.commentViewModel);
          const id = vm && vm.commentId;
          const p = id && entities[id];
          if (p) list.push(fromEntity(p));
        }
        return;
      }
      if (o.continuationItemRenderer) {
        const tok = findToken(o.continuationItemRenderer);
        if (tok) next = tok;
        return;
      }
      for (const k in o) { const v = o[k]; if (v && typeof v === 'object') walk(v, depth + 1); }
    };
    walk(data.onResponseReceivedEndpoints || data);
    // 목록 순서를 못 찾았으면 받은 댓글 내용 순서대로
    if (!list.length) for (const k in entities) list.push(fromEntity(entities[k]));
    return { list, next };
  }
  function fromEntity(p) {
    const pr = p.properties || {}, au = p.author || {}, tb = p.toolbar || {};
    return {
      author: au.displayName || '', time: pr.publishedTime || '', text: textOf(pr.content),
      likes: tb.likeCountNotliked || tb.likeCountLiked || '', avatar: (p.avatar && p.avatar.image && p.avatar.image.sources && p.avatar.image.sources[0] && p.avatar.image.sources[0].url) || au.avatarThumbnailUrl,
      replies: tb.replyCount || 0
    };
  }

  // ---------- 3. 버튼과 최신순 목록 그리기 ----------
  const css = document.createElement('style');
  css.textContent = `
    #malkkeum-sort { display: flex; gap: 8px; padding: 8px 16px 10px; }
    #malkkeum-sort button {
      border: 0; border-radius: 8px; padding: 7px 12px; font: 500 14px/1 Roboto, Arial, sans-serif;
      background: rgba(127,127,127,.15); color: inherit;
    }
    #malkkeum-sort button.on { background: #0f0f0f; color: #fff; }
    html[dark] #malkkeum-sort button.on, html[darker-dark-theme] #malkkeum-sort button.on { background: #f1f1f1; color: #0f0f0f; }
    #malkkeum-newest { position: absolute; left: 0; right: 0; bottom: 0; overflow-y: auto; z-index: 5; padding: 4px 0 40px; }
    #malkkeum-newest .c { display: flex; gap: 12px; padding: 10px 16px; }
    #malkkeum-newest .c img { width: 32px; height: 32px; border-radius: 50%; flex: none; background: rgba(127,127,127,.2); }
    #malkkeum-newest .meta { font: 12px/1.4 Roboto, Arial, sans-serif; opacity: .65; }
    #malkkeum-newest .text { font: 14px/1.45 Roboto, Arial, sans-serif; white-space: pre-wrap; word-break: break-word; margin-top: 2px; }
    #malkkeum-newest .likes { font: 12px/1.4 Roboto, Arial, sans-serif; opacity: .65; margin-top: 4px; }
    #malkkeum-newest .msg { text-align: center; padding: 20px; opacity: .6; font: 13px Roboto, Arial, sans-serif; }
  `;
  (document.head || document.documentElement).appendChild(css);

  function findCommentsTitle() {
    // 댓글 창 제목: '댓글'/'Comments'로 시작하는 짧은 글자를 가진, 화면 아래쪽 창 안의 부품
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (t !== '댓글' && t !== 'Comments' && !/^댓글\s*\d/.test(t)) continue;
      const el = n.parentElement;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top > 40 && r.top < window.innerHeight - 60) return el;
    }
    return null;
  }
  function sheetOf(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.position === 'fixed' || cs.position === 'absolute') {
        const r = e.getBoundingClientRect();
        if (r.width >= window.innerWidth * 0.9 && r.bottom >= window.innerHeight - 40) return e;
      }
    }
    return null;
  }
  function headerRowOf(title, sheet) {
    // 제목이 들어 있는 한 줄(닫기 버튼 포함)까지 올라감
    let row = title;
    for (let e = title.parentElement; e && e !== sheet; e = e.parentElement) {
      const r = e.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.85) { row = e; break; }
      row = e;
    }
    return row;
  }

  let state = { mode: 'top', next: null, loading: false, videoKey: '', kind: 'MWEB' };

  function setMsg(list, text) {
    const d = document.createElement('div');
    d.className = 'msg'; d.textContent = text;
    list.replaceChildren(d);
  }
  // 실패하면 안내를 잠깐 보여주고 원래 댓글(인기순)로 돌아감 → 원래 목록 스크롤도 다시 됨
  function failBack(list, bar, text) {
    setMsg(list, text);
    setTimeout(() => {
      cleanup();
      if (bar) bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === 'top'));
    }, 1500);
  }
  let uiFailLogged = '';
  function uiFail(reason) {
    const k = location.pathname + ':' + reason;
    if (uiFailLogged === k) return;
    uiFailLogged = k;
    report('댓글버튼', reason);
  }
  function ensureUI() {
    const title = findCommentsTitle();
    if (!title) { cleanup(); return; }
    const sheet = sheetOf(title);
    if (!sheet) { uiFail('댓글 창 틀을 못 찾음 (제목: ' + title.tagName.toLowerCase() + ')'); return; }
    const key = location.pathname + location.search;
    if (state.videoKey !== key) { cleanup(); state.videoKey = key; }
    let bar = document.getElementById('malkkeum-sort');
    if (!bar || !sheet.contains(bar)) {
      if (bar) bar.remove();
      bar = document.createElement('div');
      bar.id = 'malkkeum-sort';
      // 유튜브 보안 규칙(Trusted Types) 때문에 innerHTML 대신 부품을 하나씩 만들어 붙임
      for (const [m, label] of [['top', '인기순'], ['new', '최신순']]) {
        const b = document.createElement('button');
        b.dataset.m = m; b.textContent = label;
        if (m === 'top') b.className = 'on';
        bar.appendChild(b);
      }
      bar.addEventListener('click', ev => {
        const b = ev.target.closest('button');
        if (b) setMode(b.dataset.m, sheet, bar);
      });
      const row = headerRowOf(title, sheet);
      row.insertAdjacentElement('afterend', bar);
      report('댓글버튼', '표시함');
    }
    // 최신순 목록 위치를 버튼 아래로 맞춤
    const list = document.getElementById('malkkeum-newest');
    if (list) {
      const sr = sheet.getBoundingClientRect(), br = bar.getBoundingClientRect();
      list.style.top = (br.bottom - sr.top) + 'px';
      const sbg = getComputedStyle(sheet).backgroundColor;
      list.style.background = (sbg && sbg !== 'rgba(0, 0, 0, 0)' && sbg !== 'transparent') ? sbg : 'var(--yt-spec-base-background, #fff)';
    }
  }

  function cleanup() {
    const l = document.getElementById('malkkeum-newest'); if (l) l.remove();
    state.mode = 'top'; state.next = null; state.loading = false;
  }

  async function setMode(mode, sheet, bar) {
    bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    if (mode === 'top') { cleanup(); return; }
    state.mode = 'new';
    let list = document.getElementById('malkkeum-newest');
    if (!list) {
      list = document.createElement('div');
      list.id = 'malkkeum-newest';
      if (getComputedStyle(sheet).position === 'static') sheet.style.position = 'relative';
      sheet.appendChild(list);
      list.addEventListener('scroll', () => {
        if (list.scrollTop + list.clientHeight > list.scrollHeight - 400) loadMore(list);
      });
    }
    ensureUI();
    setMsg(list, '최신 댓글 불러오는 중…');
    let item = sortItems && (sortItems.find(x => /최신|new/i.test(x.title)) || sortItems[1]);
    state.kind = 'MWEB';
    if (!item) {
      try {
        const pc = await getPcSortItems();
        item = pc.find(x => /최신|new/i.test(x.title)) || pc[1];
        state.kind = 'WEB';
      } catch (e) {
        report('댓글정렬오류', String(e && e.message || e));
      }
    }
    if (!item) { failBack(list, bar, '최신순 댓글을 불러오지 못했어요. 인기순으로 돌아가요.'); return; }
    state.next = item.token;
    list.replaceChildren();
    await loadMore(list);
  }

  async function loadMore(list) {
    if (state.loading || !state.next || state.mode !== 'new') return;
    state.loading = true;
    try {
      const { list: items, next } = await fetchComments(state.next, state.kind);
      state.next = next;
      for (const c of items) list.appendChild(renderComment(c));
      if (!items.length && !list.children.length) failBack(list, document.getElementById('malkkeum-sort'), '최신 댓글이 없거나 불러오지 못했어요.');
      report('댓글정렬', `최신순 ${items.length}개`);
    } catch (e) {
      report('댓글정렬오류', String(e && e.message || e));
      if (!list.children.length) failBack(list, document.getElementById('malkkeum-sort'), '최신순 댓글을 불러오지 못했어요. 인기순으로 돌아가요.');
    } finally {
      state.loading = false;
    }
  }

  function renderComment(c) {
    const row = document.createElement('div'); row.className = 'c';
    const img = document.createElement('img'); if (c.avatar) img.src = c.avatar; img.alt = '';
    const body = document.createElement('div');
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${c.author}  ·  ${c.time}`;
    const text = document.createElement('div'); text.className = 'text'; text.textContent = c.text;
    const likes = document.createElement('div'); likes.className = 'likes';
    likes.textContent = `👍 ${c.likes || 0}` + (c.replies ? `   답글 ${c.replies}` : '');
    body.append(meta, text, likes);
    row.append(img, body);
    return row;
  }

  setInterval(() => { try { ensureUI(); } catch (e) { uiFail('오류 ' + (e && e.message || e)); } }, 400);
})();
