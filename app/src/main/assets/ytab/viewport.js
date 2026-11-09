// PC 유튜브(www.youtube.com)를 폰 폭에 맞춰 그리기.
// PC 유튜브는 광고를 따로 보내서 지우면 대기 없이 바로 재생됨 (모바일 유튜브는 서버가 광고 시간만큼 기다리게 함).
// 앱은 PC 브라우저로 소개하되, 화면은 폰 폭으로 그려서 글씨가 작아지지 않게 함.
(() => {
  'use strict';
  if (location.hostname !== 'www.youtube.com') return;

  function addViewport() {
    const head = document.head || document.documentElement;
    if (!head || document.querySelector('meta[name="viewport"][data-malkkeum]')) return;
    document.querySelectorAll('meta[name="viewport"]').forEach(m => m.remove());
    const m = document.createElement('meta');
    m.name = 'viewport';
    m.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    m.setAttribute('data-malkkeum', '');
    head.prepend(m);
  }

  const css = `
    html, body, ytd-app { min-width: 0 !important; }
    /* 좁은 화면에서 남는 여백 줄이기 */
    ytd-browse[page-subtype] #primary, ytd-two-column-browse-results-renderer { padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; }
    ytd-watch-flexy[flexy] #primary.ytd-watch-flexy { padding: 0 !important; margin: 0 !important; min-width: 0 !important; }
    ytd-watch-flexy #secondary.ytd-watch-flexy { padding: 0 8px !important; min-width: 0 !important; }
    #below.ytd-watch-flexy { padding: 0 10px !important; }
    ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: 1 !important; --ytd-rich-grid-posts-per-row: 1 !important; }
    ytd-rich-item-renderer { width: 100% !important; margin: 0 0 18px !important; }
  `;
  function addStyle() {
    if (document.getElementById('malkkeum-viewport-style')) return;
    const st = document.createElement('style');
    st.id = 'malkkeum-viewport-style';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  addViewport(); addStyle();
  new MutationObserver(() => { addViewport(); addStyle(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => { addViewport(); addStyle(); });
})();
