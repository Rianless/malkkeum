// PC 유튜브(www.youtube.com)를 모바일 유튜브처럼 보이게 다듬기.
// PC 유튜브는 광고를 따로 보내서 지우면 대기 없이 바로 재생됨 (모바일 유튜브는 서버가 광고 시간만큼 기다리게 함).
// 그래서 앱은 PC 유튜브를 받되, 화면은 폰 폭 + 모바일식 배치(아래쪽 탭, 한 줄 썸네일, 위에 고정된 영상)로 바꿈.
(() => {
  'use strict';
  if (location.hostname !== 'www.youtube.com' && location.hostname !== 'youtube.com') return;

  // ---------- 폰 폭으로 그리기 ----------
  function addViewport() {
    const head = document.head || document.documentElement;
    if (!head || document.querySelector('meta[name="viewport"][data-malkkeum]')) return;
    document.querySelectorAll('meta[name="viewport"]').forEach(m => m.remove());
    const m = document.createElement('meta');
    m.name = 'viewport';
    m.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, viewport-fit=cover';
    m.setAttribute('data-malkkeum', '');
    head.prepend(m);
  }

  // ---------- 모바일식 화면 ----------
  const NAV_H = 52;
  const css = `
    html, body, ytd-app { min-width: 0 !important; }
    /* PC용 스크롤바 자리(오른쪽 빈 띠) 없애기: 화면 폭에 딱 맞게 */
    html, body { scrollbar-width: none !important; scrollbar-gutter: auto !important; overflow-x: hidden !important; }
    html { overflow-y: auto !important; }
    html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; width: 0 !important; }
    ytd-app, ytd-page-manager, ytd-browse, ytd-rich-grid-renderer, ytd-rich-grid-renderer > #contents,
    ytd-two-column-browse-results-renderer, ytd-watch-flexy {
      width: 100% !important; max-width: 100% !important; box-sizing: border-box !important;
    }
    ytd-app { --ytd-scrollbar-width: 0px !important; --ytd-persistent-guide-width: 0px !important; }
    /* 화면보다 넓게 잡혀 전체가 축소되는 걸 막기: 위쪽 막대·칩 줄 등 넓은 부분을 화면 폭 안으로 */
    #masthead-container, ytd-masthead, ytd-masthead #container, #frosted-glass,
    ytd-feed-filter-chip-bar-renderer, #chips-wrapper, iron-selector#chips,
    ytd-rich-grid-renderer > #header, #contents-container {
      min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important;
    }
    ytd-masthead #end, ytd-masthead #start { min-width: 0 !important; }
    /* 목록 폭은 화면 폭 그대로 */
    ytd-page-manager, ytd-browse, ytd-two-column-browse-results-renderer, ytd-two-column-browse-results-renderer > #primary,
    ytd-rich-grid-renderer, ytd-rich-grid-renderer > #contents {
      width: 100% !important; max-width: 100% !important; min-width: 0 !important;
      margin-left: 0 !important; margin-right: 0 !important; padding-left: 0 !important; padding-right: 0 !important;
    }
    ytd-rich-grid-renderer > #contents > ytd-rich-item-renderer:not([is-slim-media]) {
      width: 100% !important; max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important;
    }
    body { padding-bottom: ${NAV_H}px !important; }

    /* 위쪽 막대: 얇게, 폰에서 안 쓰는 버튼 숨김 */
    #masthead-container, ytd-masthead { --ytd-masthead-height: 48px; }
    ytd-masthead #container.ytd-masthead { height: 48px !important; padding: 0 4px 0 8px !important; }
    ytd-masthead #guide-button, ytd-masthead #voice-search-button,
    ytd-masthead ytd-button-renderer.ytd-masthead, ytd-masthead #country-code,
    ytd-masthead yt-button-shape#button-shape-create, ytd-masthead [aria-label="만들기"],
    ytd-masthead [aria-label="Create"] { display: none !important; }
    ytd-masthead #center { flex: 1 1 auto !important; margin: 0 4px !important; }
    ytd-searchbox, #search-form, ytd-searchbox #container { min-width: 0 !important; }

    /* 왼쪽 메뉴 숨김 → 아래쪽 탭으로 대체 */
    #guide, tp-yt-app-drawer#guide, ytd-mini-guide-renderer, #guide-inner-content { display: none !important; }
    ytd-page-manager, ytd-app[mini-guide-visible] ytd-page-manager, ytd-app[guide-persistent-and-visible] ytd-page-manager {
      margin-left: 0 !important;
    }
    ytd-app { --ytd-mini-guide-width: 0px !important; --app-drawer-width: 0px !important; }

    /* 홈·구독 목록: 한 줄에 영상 하나, 썸네일은 화면 폭 꽉 차게 */
    ytd-rich-grid-renderer {
      --ytd-rich-grid-items-per-row: 1 !important;
      --ytd-rich-grid-posts-per-row: 1 !important;
      --ytd-rich-grid-slim-items-per-row: 2 !important;
      --ytd-rich-grid-item-margin: 0px !important;
      --ytd-rich-grid-gutter-margin: 0px !important;
    }
    ytd-rich-grid-renderer #contents.ytd-rich-grid-renderer { padding: 0 !important; margin: 0 !important; }
    ytd-rich-grid-renderer > #contents > ytd-rich-item-renderer:not([is-slim-media]) { width: 100% !important; margin: 0 0 20px !important; }

    /* 묶음 밖에 따로 나온 Shorts 칸도 반 폭 세로 카드로 */
    ytd-rich-grid-renderer > #contents > ytd-rich-item-renderer[is-slim-media] {
      width: calc(50% - 17px) !important; margin: 0 0 16px 12px !important;
    }

    /* Shorts 묶음: 모바일처럼 2열 세로 카드 */
    ytd-rich-section-renderer, ytd-rich-shelf-renderer {
      margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important;
    }
    ytd-rich-shelf-renderer #rich-shelf-header-container, ytd-rich-shelf-renderer #rich-shelf-header {
      margin: 8px 0 12px !important; padding: 0 12px !important;
    }
    ytd-rich-shelf-renderer #contents.ytd-rich-shelf-renderer {
      display: grid !important; grid-template-columns: 1fr 1fr; gap: 10px;
      padding: 0 12px !important; margin: 0 0 20px !important; width: auto !important;
    }
    ytd-rich-shelf-renderer ytd-rich-item-renderer, ytd-rich-item-renderer[is-slim-media] {
      width: auto !important; max-width: none !important; min-width: 0 !important; margin: 0 !important;
    }
    ytd-rich-item-renderer[is-slim-media] ytm-shorts-lockup-view-model,
    ytd-rich-item-renderer[is-slim-media] ytm-shorts-lockup-view-model-v2 { width: 100% !important; margin: 0 !important; }
    ytd-rich-item-renderer[is-slim-media] [class*="shortsLockupViewModelHostThumbnailContainer"],
    ytd-rich-item-renderer[is-slim-media] [class*="ShortsLockupViewModelHostThumbnailContainer"] {
      width: 100% !important; height: auto !important; aspect-ratio: 9 / 16; border-radius: 12px !important; overflow: hidden;
    }
    ytd-rich-item-renderer[is-slim-media] img { object-fit: cover !important; width: 100% !important; height: 100% !important; }
    ytd-rich-item-renderer[is-slim-media] [class*="shortsLockupViewModelHostOutsideMetadata"],
    ytd-rich-item-renderer[is-slim-media] [class*="shortsLockupViewModelHostMetadata"] {
      margin: 0 !important; padding: 6px 2px 0 !important; width: auto !important; min-width: 0 !important;
    }
    ytd-rich-item-renderer[is-slim-media] h3, ytd-rich-item-renderer[is-slim-media] h3 * {
      font-size: 14px !important; line-height: 19px !important; white-space: normal !important;
    }
    ytd-rich-item-renderer[is-slim-media] ytd-thumbnail, ytd-rich-item-renderer[is-slim-media] #thumbnail { border-radius: 12px !important; }
    ytd-rich-item-renderer:not([is-slim-media]) ytd-thumbnail, ytd-rich-item-renderer:not([is-slim-media]) yt-thumbnail-view-model,
    ytd-rich-item-renderer:not([is-slim-media]) #thumbnail, ytd-rich-item-renderer:not([is-slim-media]) .yt-thumbnail-view-model { border-radius: 0 !important; }
    ytd-rich-item-renderer:not([is-slim-media]) #details, ytd-rich-item-renderer:not([is-slim-media]) .yt-lockup-view-model__metadata,
    ytd-rich-item-renderer:not([is-slim-media]) yt-lockup-metadata-view-model { padding: 0 12px !important; }
    ytd-browse #primary, ytd-two-column-browse-results-renderer {
      padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important;
    }

    /* 카테고리 칩: 왼쪽부터 시작, PC용 화살표 숨기고 손가락으로 밀어서 넘기기 */
    #header.ytd-rich-grid-renderer, ytd-rich-grid-renderer > #header { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    ytd-feed-filter-chip-bar-renderer { margin: 0 !important; width: 100% !important; }
    ytd-feed-filter-chip-bar-renderer #chips-wrapper { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }
    ytd-feed-filter-chip-bar-renderer #left-arrow, ytd-feed-filter-chip-bar-renderer #right-arrow,
    ytd-feed-filter-chip-bar-renderer #left-arrow-button, ytd-feed-filter-chip-bar-renderer #right-arrow-button { display: none !important; }
    ytd-feed-filter-chip-bar-renderer #scroll-container {
      overflow-x: auto !important; scrollbar-width: none; padding: 0 12px !important; margin: 0 !important;
      -webkit-overflow-scrolling: touch;
    }
    ytd-feed-filter-chip-bar-renderer #chips { transform: none !important; margin: 0 !important; }

    /* 제목·정보 글씨 키우기 */
    #video-title, .yt-lockup-metadata-view-model__title, h3.yt-lockup-metadata-view-model-wiz__heading-reset {
      font-size: 15px !important; line-height: 21px !important;
    }
    #metadata-line, ytd-channel-name, .yt-content-metadata-view-model__metadata-text { font-size: 12.5px !important; }

    /* 영상 화면: 영상은 위에 고정, 아래로 정보·댓글·추천 */
    ytd-watch-flexy[flexy] #primary.ytd-watch-flexy,
    ytd-watch-flexy #primary.ytd-watch-flexy { padding: 0 !important; margin: 0 !important; min-width: 0 !important; max-width: 100% !important; }
    ytd-watch-flexy #columns.ytd-watch-flexy { flex-direction: column !important; margin: 0 !important; max-width: 100% !important; }
    ytd-watch-flexy #secondary.ytd-watch-flexy { width: 100% !important; padding: 0 12px !important; min-width: 0 !important; }
    ytd-watch-flexy #player.ytd-watch-flexy, ytd-watch-flexy #player-container-outer {
      position: sticky !important; top: 48px; z-index: 900; background: #000;
      margin: 0 !important; max-width: 100% !important; min-width: 0 !important;
    }
    ytd-watch-flexy #full-bleed-container { position: sticky !important; top: 48px; z-index: 900; }
    #below.ytd-watch-flexy { padding: 0 12px !important; }
    ytd-watch-metadata h1, #title h1 { font-size: 17px !important; line-height: 23px !important; }
    ytd-watch-metadata #top-row { flex-direction: column !important; align-items: flex-start !important; gap: 8px; }
    ytd-watch-metadata #actions { overflow-x: auto !important; max-width: 100% !important; }

    /* 마우스를 올려야 보이던 메뉴 버튼은 항상 보이게 */
    ytd-rich-item-renderer ytd-menu-renderer, ytd-compact-video-renderer ytd-menu-renderer { opacity: 1 !important; }

    /* 아래쪽 탭 */
    #malkkeum-nav {
      position: fixed; left: 0; right: 0; bottom: 0; height: ${NAV_H}px; z-index: 2000;
      display: flex; background: var(--yt-spec-base-background, #fff);
      border-top: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.1));
    }
    #malkkeum-nav a {
      flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
      color: var(--yt-spec-text-primary, #0f0f0f); text-decoration: none;
      font: 10.5px/1 Roboto, Arial, sans-serif;
    }
    #malkkeum-nav a svg { width: 24px; height: 24px; fill: currentColor; }
    #malkkeum-nav a.on { font-weight: 700; }
    ytd-app[fullscreen] ~ #malkkeum-nav, html[data-malkkeum-fs] #malkkeum-nav { display: none !important; }
  `;

  function addStyle() {
    if (document.getElementById('malkkeum-viewport-style')) return;
    const st = document.createElement('style');
    st.id = 'malkkeum-viewport-style';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------- 아래쪽 탭: 홈 · Shorts · 구독 · 나 ----------
  const ICONS = {
    home: '<svg viewBox="0 0 24 24"><path d="M4 21V10.08l8-6.96 8 6.96V21h-6v-6h-4v6H4z"/></svg>',
    shorts: '<svg viewBox="0 0 24 24"><path d="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33-1.2-.5L18 9.06c1.84-.96 2.53-3.23 1.56-5.06s-3.24-2.53-5.07-1.56L6 6.94c-1.29.68-2.07 2.04-2 3.49.07 1.42.93 2.67 2.22 3.25.03.01 1.2.5 1.2.5L6 14.93c-1.83.97-2.53 3.24-1.56 5.07.97 1.83 3.24 2.53 5.07 1.56l8.5-4.5c1.29-.68 2.06-2.04 1.99-3.49-.07-1.42-.94-2.68-2.23-3.25z"/></svg>',
    subs: '<svg viewBox="0 0 24 24"><path d="M10 18v-6l5 3-5 3zm7-15H7v1h10V3zm3 3H4v1h16V6zm2 3H2v12h20V9z"/></svg>',
    you: '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z"/></svg>'
  };
  const TABS = [
    { key: 'home', label: '홈', href: '/', match: p => p === '/' },
    { key: 'shorts', label: 'Shorts', href: '/shorts', match: p => p.startsWith('/shorts') },
    { key: 'subs', label: '구독', href: '/feed/subscriptions', match: p => p.startsWith('/feed/subscriptions') },
    { key: 'you', label: '나', href: '/feed/you', match: p => p.startsWith('/feed/you') || p.startsWith('/feed/library') }
  ];

  function addNav() {
    if (!document.body || document.getElementById('malkkeum-nav')) return;
    const nav = document.createElement('nav');
    nav.id = 'malkkeum-nav';
    nav.innerHTML = TABS.map(t => `<a data-key="${t.key}" href="${t.href}">${ICONS[t.key]}<span>${t.label}</span></a>`).join('');
    nav.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      // 유튜브 안의 링크처럼 처리해서 페이지 전체를 다시 불러오지 않게 함
      const app = document.querySelector('ytd-app');
      const href = a.getAttribute('href');
      const inner = document.createElement('a');
      inner.href = href;
      inner.className = 'yt-simple-endpoint';
      inner.style.display = 'none';
      (app || document.body).appendChild(inner);
      inner.click();
      setTimeout(() => {
        inner.remove();
        if (location.pathname !== new URL(href, location.href).pathname) location.href = href;
      }, 600);
    });
    document.body.appendChild(nav);
  }

  function markNav() {
    const nav = document.getElementById('malkkeum-nav');
    if (!nav) return;
    const p = location.pathname;
    nav.querySelectorAll('a').forEach(a => {
      const t = TABS.find(x => x.key === a.dataset.key);
      a.classList.toggle('on', !!(t && t.match(p)));
    });
    // 전체 화면일 때는 탭 숨김
    if (document.fullscreenElement) document.documentElement.setAttribute('data-malkkeum-fs', '');
    else document.documentElement.removeAttribute('data-malkkeum-fs');
  }

  // ---------- 진단: 어느 부분이 화면보다 좁은지 폭 재기 ----------
  let measuredFor = '';
  function measure() {
    if (measuredFor === location.pathname) return;
    const item = [...document.querySelectorAll('ytd-rich-grid-renderer > #contents > ytd-rich-item-renderer:not([is-slim-media])')].find(el => el.getBoundingClientRect().width > 0);
    if (!item) return;
    measuredFor = location.pathname;
    const sels = ['html', 'body', 'ytd-app', 'ytd-page-manager', 'ytd-browse', 'ytd-two-column-browse-results-renderer',
      'ytd-rich-grid-renderer', 'ytd-rich-grid-renderer > #contents'];
    const parts = [`화면 ${window.innerWidth} / html.client ${document.documentElement.clientWidth}`];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      parts.push(`${sel.replace('ytd-', '')}: x${Math.round(r.left)} w${Math.round(r.width)} m${cs.marginRight} p${cs.paddingRight}`);
    }
    const cw = document.documentElement.clientWidth;
    parts.push(`scrollWidth ${document.documentElement.scrollWidth}`);
    const wide = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > cw + 1) {
        if (![...wide].some(w => w.el.contains(el))) wide.push({ el, right: Math.round(r.right), w: Math.round(r.width) });
        if (wide.length >= 6) break;
      }
    }
    for (const w of wide) {
      const e = w.el;
      const name = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '');
      parts.push(`넘침 ${name} right${w.right} w${w.w}`);
    }
    const ir = item.getBoundingClientRect();
    parts.push(`item: x${Math.round(ir.left)} w${Math.round(ir.width)}`);
    const th = item.querySelector('a#thumbnail, yt-thumbnail-view-model, ytd-thumbnail, a');
    if (th) { const tr = th.getBoundingClientRect(); parts.push(`thumb: x${Math.round(tr.left)} w${Math.round(tr.width)}`); }
    try {
      chrome.storage.local.get('diag', d => {
        const list = (d.diag || []).concat(parts.map(p => ({ t: 0, e: '폭', d: p, at: Date.now() })));
        chrome.storage.local.set({ diag: list.slice(-400) });
      });
    } catch (e) { /* 무시 */ }
  }

  function apply() { addViewport(); addStyle(); addNav(); markNav(); setTimeout(measure, 2500); }
  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: false });
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('fullscreenchange', markNav);
  setInterval(apply, 700);
})();
