// 앱(안드로이드) ↔ 확장 프로그램 연결.
// - 앱 상단의 켜기/끄기 스위치를 누르면 여기로 신호가 와서 설정을 바꿈
// - 설정이나 차단 개수가 바뀌면 앱에 알려서 화면 위 숫자를 갱신함
(() => {
  'use strict';
  const DEFAULTS = { enabled: true, mode: 'all', method: 'strip', stripKeys: ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'], blockedCategories: [], blockedAdvertisers: [] };
  let port;
  try {
    port = browser.runtime.connectNative('malkkeum');
  } catch (e) {
    return; // 앱 밖(일반 브라우저)에서는 조용히 넘어감
  }

  async function sendState() {
    try {
      const d = await browser.storage.local.get(['settings', 'stats']);
      const s = Object.assign({}, DEFAULTS, d.settings);
      const st = d.stats || {};
      port.postMessage({ type: 'state', enabled: !!s.enabled, mode: s.mode, blocked: st.blocked || 0, theme: s.theme || 'default' });
    } catch (e) { /* 무시 */ }
  }

  port.onMessage.addListener(async msg => {
    if (!msg) return;
    if (msg.type === 'setEnabled') {
      const d = await browser.storage.local.get('settings');
      const s = Object.assign({}, DEFAULTS, d.settings, { enabled: !!msg.value });
      await browser.storage.local.set({ settings: s });
    } else if (msg.type === 'getState') {
      sendState();
    } else if (msg.type === 'snapshot') {
      // 화면 구조 기록 (appui.js가 처리)
      document.dispatchEvent(new CustomEvent('malkkeum-snapshot'));
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.settings || changes.stats)) sendState();
  });

  sendState();
})();
