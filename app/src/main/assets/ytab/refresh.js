// 당겨서 새로고침: 목록 맨 위에서 아래로 끌어내렸다 놓으면 페이지를 다시 불러옴 (유튜브 앱처럼)
// 쇼츠·영상 보기 화면, 댓글 창처럼 떠 있는 창 안에서는 동작하지 않음
(() => {
  'use strict';
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;

  const THRESHOLD = 80;   // 이만큼 당기면 새로고침
  const MAX = 130;
  let startY = null, pulled = 0, ready = false, el = null;

  function blocked() {
    return /^\/(shorts|watch)/.test(location.pathname);
  }
  // 터치한 곳이 떠 있는 창이거나 따로 스크롤되는 칸 안이면 제외
  function insideOverlay(target) {
    for (let e = target; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      if (e.id === 'malkkeum-nav') return true;
      const cs = getComputedStyle(e);
      if (cs.position === 'fixed') return true;
      if (e.scrollTop > 0 && /(auto|scroll)/.test(cs.overflowY)) return true;
    }
    return false;
  }

  function indicator() {
    if (el && el.isConnected) return el;
    el = document.createElement('div');
    el.id = 'malkkeum-ptr';
    el.setAttribute('aria-hidden', 'true');
    const s = el.style;
    s.cssText = 'position:fixed;left:50%;top:0;width:40px;height:40px;margin-left:-20px;border-radius:50%;' +
      'background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:2147483646;display:flex;align-items:center;' +
      'justify-content:center;transform:translateY(-60px);opacity:0;pointer-events:none;transition:none';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '22'); svg.setAttribute('height', '22'); svg.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#E5322D');
    p.setAttribute('stroke-width', '2.4'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    el.appendChild(svg);
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function show(dist) {
    const i = indicator();
    const y = Math.min(dist, MAX) * 0.8;
    i.style.transition = 'none';
    i.style.opacity = String(Math.min(1, dist / THRESHOLD));
    i.style.transform = `translateY(${y - 40}px) rotate(${dist * 3}deg)`;
    i.firstChild.style.opacity = dist >= THRESHOLD ? '1' : '.5';
  }
  function hide() {
    if (!el) return;
    el.style.transition = 'transform .2s ease, opacity .2s ease';
    el.style.transform = 'translateY(-60px)';
    el.style.opacity = '0';
  }
  function spinAndReload() {
    const i = indicator();
    i.style.transition = 'transform .2s ease';
    i.style.transform = 'translateY(40px)';
    i.firstChild.style.opacity = '1';
    let a = 0;
    const t = setInterval(() => { a += 30; i.style.transform = `translateY(40px) rotate(${a}deg)`; }, 30);
    setTimeout(() => { clearInterval(t); location.reload(); }, 250);
  }

  document.addEventListener('touchstart', e => {
    startY = null; pulled = 0; ready = false;
    if (blocked() || e.touches.length !== 1) return;
    if ((window.scrollY || document.documentElement.scrollTop) > 0) return;
    if (insideOverlay(e.target)) return;
    startY = e.touches[0].clientY;
  }, { passive: true, capture: true });

  document.addEventListener('touchmove', e => {
    if (startY === null) return;
    if ((window.scrollY || document.documentElement.scrollTop) > 0) { startY = null; hide(); return; }
    pulled = e.touches[0].clientY - startY;
    if (pulled <= 0) { hide(); return; }
    ready = pulled >= THRESHOLD;
    show(pulled);
  }, { passive: true, capture: true });

  document.addEventListener('touchend', () => {
    if (startY === null) return;
    startY = null;
    if (ready) spinAndReload(); else hide();
  }, { passive: true, capture: true });
  document.addEventListener('touchcancel', () => { startY = null; hide(); }, { passive: true, capture: true });
})();
