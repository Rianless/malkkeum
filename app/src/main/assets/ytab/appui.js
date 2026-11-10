// 모바일 유튜브(m.youtube.com)를 유튜브 앱처럼 다듬기 + 화면 구조 기록(진단용)
(() => {
  'use strict';
  if (location.hostname !== 'm.youtube.com') return;

  const vh = () => window.innerHeight;
  const isShorts = () => location.pathname.startsWith('/shorts');

  // ---------- 쇼츠 댓글: 앱처럼 영상은 위로 작아지고 아래에 댓글 ----------
  // 특정 부품 이름에 기대지 않고, '화면 아래에 붙어 올라온 큰 창'을 찾아 그 위 공간에 영상을 맞춤
  function findBottomSheet() {
    // 화면 아래쪽 가운데 지점에 있는 부품에서 위로 올라가며, 아래에 붙은 큰 창을 찾음 (가볍게)
    const probe = document.elementFromPoint(window.innerWidth / 2, vh() - 30);
    for (let el = probe; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.querySelector && el.querySelector('video')) return null;   // 영상 쪽이면 창이 없는 것
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.9) continue;
      if (Math.abs(r.bottom - vh()) > 6) continue;
      if (r.height < vh() * 0.3 || r.height > vh() * 0.92 || r.top < 40) continue;
      return { el, r };
    }
    return null;
  }

  function activeShortsBox() {
    // 지금 재생 중인 쇼츠 영상을 담은, 화면 높이만 한 칸
    const videos = [...document.querySelectorAll('video')].filter(v => {
      const r = v.getBoundingClientRect();
      return r.height > 0 && r.top < vh() / 2 && r.bottom > vh() / 2;
    });
    const v = videos[0];
    if (!v) return null;
    let box = v;
    for (let el = v.parentElement; el && el !== document.body; el = el.parentElement) {
      const r = el.getBoundingClientRect();
      if (r.height >= vh() * 0.7) box = el;
      if (r.height >= vh() * 0.95) break;
    }
    return box;
  }

  let shrunk = null;
  function syncShortsComments() {
    if (!isShorts()) { restore(); return; }
    const sheet = findBottomSheet();
    const box = sheet && activeShortsBox();
    if (!sheet || !box) { restore(); return; }
    const avail = sheet.r.top;                          // 댓글 창 위에 남은 높이
    if (shrunk && shrunk.box !== box) restore();
    if (!shrunk) {
      // 줄이기 전의 원래 위치·크기를 기억 (줄인 뒤 다시 재면 작아진 값이 나오므로)
      const br = box.getBoundingClientRect();
      shrunk = { box, prev: box.style.cssText, top: br.top, h: box.offsetHeight || br.height };
    }
    const scale = Math.max(0.2, Math.min(1, avail / shrunk.h));
    box.style.setProperty('transform-origin', 'top center', 'important');
    box.style.setProperty('transform', `translateY(${-shrunk.top}px) scale(${scale.toFixed(3)})`, 'important');
    box.style.setProperty('transition', 'transform .2s ease', 'important');
    box.style.setProperty('z-index', '1', 'important');
    document.documentElement.setAttribute('data-malkkeum-shorts-sheet', '');
  }
  function restore() {
    if (!shrunk) return;
    shrunk.box.style.cssText = shrunk.prev;
    shrunk = null;
    document.documentElement.removeAttribute('data-malkkeum-shorts-sheet');
  }

  // 댓글 창이 열린 동안 영상을 덮는 어두운 막(scrim)은 걷어냄
  const style = document.createElement('style');
  style.textContent = `
    html[data-malkkeum-shorts-sheet] .bottom-sheet-overlay,
    html[data-malkkeum-shorts-sheet] .scrim,
    html[data-malkkeum-shorts-sheet] [class*="overlay-background"] { background: transparent !important; }
  `;
  (document.head || document.documentElement).appendChild(style);

  setInterval(syncShortsComments, 250);

  // ---------- 화면 구조 기록: '기록' 버튼을 길게 누르면 ----------
  function describe(el) {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  }
  function snapshot() {
    const lines = [`화면 ${window.innerWidth}x${vh()} ${location.pathname}`];
    // 화면에 떠 있는(고정·절대 위치) 큰 부품들
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 2000) continue;
      const d = describe(el);
      if (seen.has(d)) continue;
      seen.add(d);
      lines.push(`고정 ${d} top${Math.round(r.top)} h${Math.round(r.height)} w${Math.round(r.width)} bg${cs.backgroundColor}`);
      if (lines.length > 25) break;
    }
    // 영상 칸의 부모 사슬
    const v = [...document.querySelectorAll('video')].find(x => x.getBoundingClientRect().height > 0);
    if (v) {
      let el = v, n = 0;
      while (el && el !== document.body && n < 10) {
        const r = el.getBoundingClientRect();
        lines.push(`영상칸 ${describe(el)} top${Math.round(r.top)} h${Math.round(r.height)}`);
        el = el.parentElement; n++;
      }
    }
    try {
      chrome.storage.local.get('diag', d => {
        const list = (d.diag || []).concat(lines.map(x => ({ t: 0, e: '구조', d: x, at: Date.now() })));
        chrome.storage.local.set({ diag: list.slice(-400) });
      });
    } catch (e) { /* 무시 */ }
  }
  document.addEventListener('malkkeum-snapshot', snapshot);
})();
