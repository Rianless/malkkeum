(() => {
  'use strict';
  const C = window.YTAB_CLASSIFIER;
  const DEFAULTS = { enabled: true, mode: 'all', method: 'strip', stripKeys: ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'], blockedCategories: [], blockedAdvertisers: [] };
  const $ = s => document.querySelector(s);
  let state = { settings: DEFAULTS, log: [], stats: {}, diag: [] };

  const save = patch => {
    state.settings = Object.assign({}, state.settings, patch);
    chrome.storage.local.set({ settings: state.settings });
    render();
  };

  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function timeAgo(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.round(h / 24)}일 전`;
  }

  function render() {
    const s = state.settings;
    $('#enabled').checked = s.enabled;
    document.querySelectorAll('input[name=mode]').forEach(r => { r.checked = r.value === s.mode; });
    document.querySelectorAll('input[name=method]').forEach(r => { r.checked = r.value === s.method; });
    const mb = document.getElementById('method-box');
    if (mb) {
      mb.classList.toggle('dim', s.mode !== 'all');
      document.getElementById('method-hint').textContent = s.mode !== 'all'
        ? '고른 종류만 차단할 때는 광고를 보고 판단해야 해서 항상 빨리 넘기기로 처리해요.'
        : s.method === 'skip'
          ? '광고를 불러온 뒤 가림막을 씌우고 16배속으로 넘겨요. 바꾼 뒤 영상을 새로 열어야 적용돼요.'
          : '광고 정보를 미리 지워 광고가 아예 안 붙게 해요. 바꾼 뒤 영상을 새로 열어야 적용돼요.';
    }
    $('#mode-hint').textContent = s.mode === 'all'
      ? '모든 광고를 차단하고, 걸러낸 광고는 분석해서 기록만 남겨요.'
      : '체크한 카테고리와 차단 광고주의 광고만 건너뛰고, 나머지는 그대로 보여줘요.';

    const st = Object.assign({ blocked: 0, analyzed: 0, stripped: 0 }, state.stats);
    $('#s-blocked').textContent = st.blocked.toLocaleString();
    $('#s-analyzed').textContent = st.analyzed.toLocaleString();
    $('#s-stripped').textContent = st.stripped.toLocaleString();

    // 카테고리 탭: 지금까지 본 광고 개수와 차단 체크박스
    const counts = {};
    state.log.forEach(l => { counts[l.categoryId] = (counts[l.categoryId] || 0) + 1; });
    const cats = C.categories.slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    const catsEl = $('#cats');
    catsEl.classList.toggle('dim', s.mode === 'all');
    catsEl.innerHTML = cats.map(c => `
      <label class="cat">
        <span>${esc(c.name)}<span class="count">${counts[c.id] || 0}건</span></span>
        <input type="checkbox" data-cat="${c.id}" ${s.blockedCategories.includes(c.id) ? 'checked' : ''}>
      </label>`).join('');

    // 기록 탭
    $('#log').innerHTML = state.log.length ? state.log.slice(0, 100).map((l, i) => `
      <div class="item">
        <div class="top">
          <span class="adv">${esc(l.advertiser || l.domain || '광고주 확인 안 됨')}</span>
          <span class="tag ${l.blocked ? 'blocked' : 'allowed'}">${l.blocked ? '차단' : '허용'}</span>
        </div>
        ${l.title ? `<div class="title">${esc(l.title)}</div>` : ''}
        <div class="meta">
          <span>${esc(l.kind)} · <span class="tag">${esc(l.categoryName)}</span> · ${timeAgo(l.at)}</span>
          ${l.advertiser ? `<button class="mini" data-block-adv="${i}">이 광고주 차단</button>` : ''}
        </div>
      </div>`).join('') : '<p class="empty">아직 기록된 광고가 없어요.<br>유튜브에서 영상을 틀어보세요.</p>';

    // 진단 탭
    document.querySelectorAll('#keys-box input[data-key]').forEach(c => { c.checked = (s.stripKeys || []).includes(c.dataset.key); });
    const dt = document.getElementById('diag-text');
    if (dt) dt.textContent = diagText() || '아직 기록이 없어요.';

    // 광고주 탭
    $('#adv-list').innerHTML = s.blockedAdvertisers.length ? s.blockedAdvertisers.map((a, i) => `
      <li><span>${esc(a)}</span><button class="mini" data-del-adv="${i}">삭제</button></li>`).join('')
      : '<p class="empty">차단한 광고주가 없어요.</p>';
  }

  // 이벤트
  $('#enabled').addEventListener('change', e => save({ enabled: e.target.checked }));
  document.querySelectorAll('input[name=mode]').forEach(r =>
    r.addEventListener('change', e => save({ mode: e.target.value })));
  document.querySelectorAll('input[name=method]').forEach(r =>
    r.addEventListener('change', e => save({ method: e.target.value })));

  $('#cats').addEventListener('change', e => {
    const id = e.target.dataset.cat;
    if (!id) return;
    const set = new Set(state.settings.blockedCategories);
    e.target.checked ? set.add(id) : set.delete(id);
    save({ blockedCategories: [...set] });
  });

  const addAdv = name => {
    name = (name || '').trim();
    if (!name || state.settings.blockedAdvertisers.includes(name)) return;
    save({ blockedAdvertisers: [...state.settings.blockedAdvertisers, name] });
  };

  $('#log').addEventListener('click', e => {
    const i = e.target.dataset.blockAdv;
    if (i !== undefined) addAdv(state.log[+i].advertiser);
  });
  $('#adv-list').addEventListener('click', e => {
    const i = e.target.dataset.delAdv;
    if (i === undefined) return;
    save({ blockedAdvertisers: state.settings.blockedAdvertisers.filter((_, k) => k !== +i) });
  });
  $('#adv-form').addEventListener('submit', e => {
    e.preventDefault();
    addAdv($('#adv-input').value);
    $('#adv-input').value = '';
  });

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('hidden', p.id !== t.dataset.tab));
  }));

  $('#clear').addEventListener('click', () => {
    chrome.storage.local.set({ log: [], stats: { blocked: 0, analyzed: 0, stripped: 0 } });
  });

  function diagText() {
    const s = state.settings;
    const head = `[말끔 진단 v${(chrome.runtime.getManifest() || {}).version || '?'}] 방식:${s.method === 'skip' ? '빨리 넘기기' : '미리 제거'} 모드:${s.mode} 지울항목:${(s.stripKeys || []).join(',') || '없음'}`;
    const lines = (state.diag || []).map(i => (i.e === 'nav' ? '\n' : '') + `${String(i.t).padStart(6)}  ${i.e}  ${i.d}`);
    return lines.length ? head + '\n' + lines.join('\n') : '';
  }
  const copyBtn = document.getElementById('diag-copy');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const t = diagText();
    try { await navigator.clipboard.writeText(t); copyBtn.textContent = '복사됨!'; }
    catch (e) {
      const r = document.createRange(); r.selectNodeContents(document.getElementById('diag-text'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      try { document.execCommand('copy'); copyBtn.textContent = '복사됨!'; } catch (e2) { copyBtn.textContent = '길게 눌러 복사하세요'; }
    }
    setTimeout(() => { copyBtn.textContent = '복사'; }, 1500);
  });
  const keysBox = document.getElementById('keys-box');
  if (keysBox) keysBox.addEventListener('change', () => {
    const keys = [...keysBox.querySelectorAll('input[data-key]')].filter(c => c.checked).map(c => c.dataset.key);
    save({ stripKeys: keys });
  });
  const clearDiag = document.getElementById('diag-clear');
  if (clearDiag) clearDiag.addEventListener('click', () => chrome.storage.local.set({ diag: [] }));

  // 데이터 불러오기 + 실시간 반영
  chrome.storage.local.get(['settings', 'log', 'stats', 'diag'], d => {
    state = { settings: Object.assign({}, DEFAULTS, d.settings), log: d.log || [], stats: d.stats || {}, diag: d.diag || [] };
    render();
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.settings) state.settings = Object.assign({}, DEFAULTS, ch.settings.newValue);
    if (ch.log) state.log = ch.log.newValue || [];
    if (ch.stats) state.stats = ch.stats.newValue || {};
    if (ch.diag) state.diag = ch.diag.newValue || [];
    render();
  });
})();
