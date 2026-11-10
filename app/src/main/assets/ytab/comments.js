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
  function cfg() { return (window.ytcfg && window.ytcfg.data_) || {}; }
  async function fetchComments(token) {
    const c = cfg();
    const res = await fetch(`/youtubei/v1/next?prettyPrint=false${c.INNERTUBE_API_KEY ? '&key=' + c.INNERTUBE_API_KEY : ''}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': String(c.INNERTUBE_CONTEXT_CLIENT_NAME || 2),
        'X-Youtube-Client-Version': String(c.INNERTUBE_CLIENT_VERSION || '')
      },
      body: JSON.stringify({ context: c.INNERTUBE_CONTEXT, continuation: token })
    });
    const data = nativeParse(await res.text());
    return parseComments(data);
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
    // 댓글 창 제목 '댓글'(또는 'Comments') 글자를 가진 보이는 부품
    const it = document.evaluate("//*[normalize-space(text())='댓글' or normalize-space(text())='Comments']",
      document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < it.snapshotLength; i++) {
      const el = it.snapshotItem(i);
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top > 40) return el;
    }
    return null;
  }
  function sheetOf(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.position === 'fixed' || cs.position === 'absolute') {
        const r = e.getBoundingClientRect();
        if (r.width >= window.innerWidth * 0.9 && Math.abs(r.bottom - window.innerHeight) < 8) return e;
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

  let state = { mode: 'top', next: null, loading: false, videoKey: '' };

  function ensureUI() {
    const title = findCommentsTitle();
    if (!title) { cleanup(); return; }
    const sheet = sheetOf(title);
    if (!sheet) return;
    const key = location.pathname + location.search;
    if (state.videoKey !== key) { cleanup(); state.videoKey = key; }
    let bar = document.getElementById('malkkeum-sort');
    if (!bar || !sheet.contains(bar)) {
      if (bar) bar.remove();
      bar = document.createElement('div');
      bar.id = 'malkkeum-sort';
      bar.innerHTML = '<button data-m="top" class="on">인기순</button><button data-m="new">최신순</button>';
      bar.addEventListener('click', ev => {
        const b = ev.target.closest('button');
        if (b) setMode(b.dataset.m, sheet, bar);
      });
      const row = headerRowOf(title, sheet);
      row.insertAdjacentElement('afterend', bar);
    }
    // 최신순 목록 위치를 버튼 아래로 맞춤
    const list = document.getElementById('malkkeum-newest');
    if (list) {
      const sr = sheet.getBoundingClientRect(), br = bar.getBoundingClientRect();
      list.style.top = (br.bottom - sr.top) + 'px';
      list.style.background = getComputedStyle(sheet).backgroundColor || '#fff';
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
    list.innerHTML = '<div class="msg">최신 댓글 불러오는 중…</div>';
    const item = sortItems && (sortItems.find(x => /최신|new/i.test(x.title)) || sortItems[1]);
    if (!item) {
      list.innerHTML = '<div class="msg">이 영상은 최신순 정보를 찾지 못했어요.<br>댓글 창을 닫았다 다시 열어보세요.</div>';
      report('댓글정렬', '정렬 정보 없음');
      return;
    }
    state.next = item.token;
    list.innerHTML = '';
    await loadMore(list);
  }

  async function loadMore(list) {
    if (state.loading || !state.next || state.mode !== 'new') return;
    state.loading = true;
    try {
      const { list: items, next } = await fetchComments(state.next);
      state.next = next;
      for (const c of items) list.appendChild(renderComment(c));
      if (!items.length && !list.children.length) list.innerHTML = '<div class="msg">댓글을 불러오지 못했어요.</div>';
      report('댓글정렬', `최신순 ${items.length}개`);
    } catch (e) {
      report('댓글정렬오류', String(e && e.message || e));
      if (!list.children.length) list.innerHTML = '<div class="msg">댓글을 불러오지 못했어요.</div>';
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

  setInterval(ensureUI, 400);
})();
