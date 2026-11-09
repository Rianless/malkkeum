// 확장 프로그램 저장소 ↔ 유튜브 페이지 사이를 이어주는 다리 역할.
// - 설정을 페이지가 읽을 수 있게 html 속성과 localStorage에 넣어줌
// - 페이지에서 보낸 광고 분석 기록을 저장소에 쌓음
(() => {
  'use strict';
  const DEFAULTS = { enabled: true, mode: 'all', blockedCategories: [], blockedAdvertisers: [] };
  const MAX_LOG = 300;

  function pushSettings(s) {
    const json = JSON.stringify(Object.assign({}, DEFAULTS, s));
    try { document.documentElement.setAttribute('data-ytab-settings', json); } catch (e) { /* 무시 */ }
    try { localStorage.setItem('ytab_settings', json); } catch (e) { /* 무시 */ }
  }

  chrome.storage.local.get('settings', ({ settings }) => pushSettings(settings || DEFAULTS));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) pushSettings(changes.settings.newValue || DEFAULTS);
  });

  // 기록 쓰기는 순서대로 하나씩 처리 (동시에 쓰다 덮어쓰는 것 방지)
  let queue = Promise.resolve();
  const enqueue = fn => { queue = queue.then(fn).catch(() => {}); };

  window.addEventListener('message', ev => {
    if (ev.source !== window || !ev.data || ev.data.__ytab !== true) return;
    const msg = ev.data;

    enqueue(() => new Promise(resolve => {
      chrome.storage.local.get(['log', 'stats'], data => {
        const stats = Object.assign({ blocked: 0, analyzed: 0, stripped: 0 }, data.stats);
        let log = data.log || [];

        if (msg.type === 'stripped') {
          stats.stripped += msg.count || 0;
          stats.blocked += msg.count || 0;
        } else if (msg.type === 'ad') {
          stats.analyzed += 1;
          if (msg.blocked) stats.blocked += 1;
          log.unshift({
            kind: msg.kind,
            at: msg.at,
            title: msg.info?.title || '',
            advertiser: msg.info?.advertiser || msg.info?.author || '',
            domain: msg.info?.domain || '',
            videoId: msg.info?.videoId || '',
            categoryId: msg.category?.id || 'other',
            categoryName: msg.category?.name || '기타·미분류',
            hits: msg.category?.hits || [],
            blocked: !!msg.blocked
          });
          if (log.length > MAX_LOG) log = log.slice(0, MAX_LOG);
        }
        chrome.storage.local.set({ log, stats }, resolve);
      });
    }));
  });
})();
