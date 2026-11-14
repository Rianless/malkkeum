// 옛날 유튜브(2006년쯤) 느낌 테마. 설정의 '화면 테마'가 retro일 때만 켜짐.
// 화면 배치는 그대로 두고 색·글씨·테두리·버튼 모양만 바꿈.
(() => {
  'use strict';
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;

  const css = `
  html[data-malkkeum-retro], html[data-malkkeum-retro][dark], html[data-malkkeum-retro][darker-dark-theme] {
    --yt-spec-base-background:#ffffff; --yt-spec-raised-background:#ffffff; --yt-spec-menu-background:#ffffff;
    --yt-spec-general-background-a:#ffffff; --yt-spec-general-background-b:#f5f5f5; --yt-spec-general-background-c:#eeeeee;
    --yt-spec-text-primary:#000000; --yt-spec-text-secondary:#666666; --yt-spec-text-disabled:#999999;
    --yt-spec-call-to-action:#0033cc; --yt-spec-themed-blue:#0033cc; --yt-spec-icon-active-other:#333333; --yt-spec-icon-inactive:#666666;
    --yt-spec-10-percent-layer:#cccccc; --yt-spec-badge-chip-background:#eeeeee; --yt-spec-static-brand-red:#cc0000;
    --yt-spec-brand-background-solid:#ffffff; --yt-spec-brand-background-primary:#ffffff;
    color-scheme: light !important;
  }
  html[data-malkkeum-retro], html[data-malkkeum-retro] body, html[data-malkkeum-retro] ytm-app, html[data-malkkeum-retro] ytd-app {
    background:#ffffff !important; color:#000 !important;
    font-family: Arial, Verdana, Helvetica, sans-serif !important;
  }
  html[data-malkkeum-retro] * { font-family: Arial, Verdana, Helvetica, sans-serif !important; letter-spacing: 0 !important; }

  /* 위쪽 머리: 흰색→회색 그라데이션 + 아래 회색 줄 */
  html[data-malkkeum-retro] ytm-mobile-topbar-renderer, html[data-malkkeum-retro] .mobile-topbar-header,
  html[data-malkkeum-retro] header.mobile-topbar-header, html[data-malkkeum-retro] #masthead-container, html[data-malkkeum-retro] ytd-masthead {
    background: linear-gradient(#ffffff, #e6e6e6) !important; border-bottom: 1px solid #b5b5b5 !important; box-shadow: none !important;
  }

  /* 제목은 파란 밑줄 링크 */
  html[data-malkkeum-retro] .media-item-headline, html[data-malkkeum-retro] .media-item-headline *,
  html[data-malkkeum-retro] h3 .yt-core-attributed-string, html[data-malkkeum-retro] #video-title,
  html[data-malkkeum-retro] .yt-lockup-metadata-view-model__title, html[data-malkkeum-retro] .yt-lockup-metadata-view-model__title * {
    color:#0033cc !important; text-decoration: underline !important; font-weight: bold !important; font-size: 13px !important; line-height: 16px !important;
  }
  html[data-malkkeum-retro] .media-item-byline, html[data-malkkeum-retro] .media-item-byline *,
  html[data-malkkeum-retro] .yt-content-metadata-view-model__metadata-text, html[data-malkkeum-retro] ytm-badge-and-byline-renderer * {
    color:#666 !important; font-size: 11px !important;
  }

  /* 썸네일: 둥근 모서리 없이 회색 테두리 + 흰 여백
     (크기에 영향 없는 outline/box-shadow로만 그림: padding·border를 주면 비율 칸이 무너져 썸네일이 납작해짐) */
  html[data-malkkeum-retro] ytm-thumbnail-cover, html[data-malkkeum-retro] .video-thumbnail-container-large,
  html[data-malkkeum-retro] .media-item-thumbnail-container, html[data-malkkeum-retro] yt-thumbnail-view-model,
  html[data-malkkeum-retro] ytd-thumbnail, html[data-malkkeum-retro] .yt-thumbnail-view-model,
  html[data-malkkeum-retro] .shortsLockupViewModelHostThumbnailContainer, html[data-malkkeum-retro] [class*="ShortsLockupViewModelHostThumbnailContainer"] {
    border-radius: 0 !important;
  }
  html[data-malkkeum-retro] .media-item-thumbnail-container, html[data-malkkeum-retro] .video-thumbnail-container-large,
  html[data-malkkeum-retro] yt-thumbnail-view-model, html[data-malkkeum-retro] ytd-thumbnail,
  html[data-malkkeum-retro] .shortsLockupViewModelHostThumbnailContainer, html[data-malkkeum-retro] [class*="ShortsLockupViewModelHostThumbnailContainer"] {
    box-shadow: 0 0 0 2px #fff, 0 0 0 3px #999 !important;
  }
  html[data-malkkeum-retro] img { border-radius: 0 !important; }
  html[data-malkkeum-retro] .ytm-profile-icon img, html[data-malkkeum-retro] yt-avatar-shape img { outline: 1px solid #999 !important; outline-offset: -1px; }

  /* 목록 칸 사이 점선 구분 */
  html[data-malkkeum-retro] ytm-rich-item-renderer, html[data-malkkeum-retro] ytm-video-with-context-renderer,
  html[data-malkkeum-retro] ytm-compact-video-renderer {
    border-bottom: 1px dotted #cccccc !important; padding-bottom: 8px !important; margin-bottom: 8px !important;
  }

  /* 카테고리 칩 → 옛날 파란 탭 (안쪽 칸 하나만 칠함: 겉칸까지 칠하면 이중 상자가 됨) */
  html[data-malkkeum-retro] ytm-chip-cloud-chip-renderer, html[data-malkkeum-retro] yt-chip-cloud-chip-renderer {
    background: transparent !important; border: 0 !important; box-shadow: none !important;
  }
  html[data-malkkeum-retro] ytm-chip-cloud-chip-renderer .chip-container, html[data-malkkeum-retro] yt-chip-cloud-chip-renderer #chip-shape-container,
  html[data-malkkeum-retro] yt-chip-cloud-chip-renderer .ytChipShapeChip, html[data-malkkeum-retro] ytm-chip-cloud-chip-renderer .ytChipShapeChip {
    border-radius: 4px 4px 0 0 !important; border: 1px solid #a9c1e8 !important; border-bottom-color: #8fb0e3 !important;
    background: linear-gradient(#f2f7ff, #c9dbf7) !important; color:#0033cc !important; font-weight: bold !important;
  }
  html[data-malkkeum-retro] ytm-chip-cloud-chip-renderer.selected .chip-container, html[data-malkkeum-retro] .selected .chip-container,
  html[data-malkkeum-retro] ytm-chip-cloud-chip-renderer[chip-style*="SELECTED"] .chip-container,
  html[data-malkkeum-retro] yt-chip-cloud-chip-renderer[selected] #chip-shape-container,
  html[data-malkkeum-retro] .ytChipShapeActive {
    background: linear-gradient(#ffffff, #e2e2e2) !important; border-color:#bbbbbb !important; color:#333 !important;
  }

  /* 버튼 → 회색 각진 버튼 */
  html[data-malkkeum-retro] yt-button-shape button, html[data-malkkeum-retro] .yt-spec-button-shape-next,
  html[data-malkkeum-retro] button.yt-spec-button-shape-next {
    border-radius: 3px !important; background: linear-gradient(#ffffff, #dddddd) !important; border: 1px solid #aaaaaa !important;
    color:#000 !important; box-shadow: none !important;
  }

  /* 영상 아래 정보·댓글 상자 → 회색 테두리 상자 */
  html[data-malkkeum-retro] ytm-slim-video-metadata-section-renderer, html[data-malkkeum-retro] ytm-slim-video-information-renderer,
  html[data-malkkeum-retro] ytm-comments-entry-point-header-renderer, html[data-malkkeum-retro] ytm-item-section-renderer[section-identifier="comments-entry-point"] {
    border: 1px solid #cccccc !important; background:#f9f9f9 !important; border-radius: 0 !important; margin: 6px !important;
  }
  html[data-malkkeum-retro] .slim-video-information-title, html[data-malkkeum-retro] .slim-video-information-title * ,
  html[data-malkkeum-retro] ytd-watch-metadata h1 { font-size: 15px !important; font-weight: bold !important; color:#000 !important; }

  /* 아래쪽 탭 줄 → 회색 탭 막대 */
  html[data-malkkeum-retro] ytm-pivot-bar-renderer, html[data-malkkeum-retro] #malkkeum-nav {
    background: linear-gradient(#f4f4f4, #d9d9d9) !important; border-top: 1px solid #aaaaaa !important;
  }
  html[data-malkkeum-retro] ytm-pivot-bar-item-renderer .pivot-bar-item-title, html[data-malkkeum-retro] #malkkeum-nav a {
    color:#0033cc !important; font-weight: bold !important;
  }

  /* 진행 막대는 빨강 */
  html[data-malkkeum-retro] .ytp-play-progress, html[data-malkkeum-retro] .ytm-progress-bar-played, html[data-malkkeum-retro] .ytProgressBarLineProgressBarPlayed {
    background:#cc0000 !important;
  }

  /* 댓글 창(아래에서 올라오는 창) */
  html[data-malkkeum-retro] .bottom-sheet-layout, html[data-malkkeum-retro] ytm-bottom-sheet-renderer,
  html[data-malkkeum-retro] .engagement-panel-section-list-background {
    border-radius: 0 !important; border-top: 3px solid #cccccc !important; background:#ffffff !important;
  }
  html[data-malkkeum-retro] #malkkeum-sort button { border-radius: 3px !important; background: linear-gradient(#fff,#ddd) !important; border:1px solid #aaa !important; color:#000 !important; }
  html[data-malkkeum-retro] #malkkeum-sort button.on { background: linear-gradient(#f2f7ff,#c9dbf7) !important; border-color:#a9c1e8 !important; color:#0033cc !important; }
  `;
  function addStyle() {
    if (document.getElementById('malkkeum-retro-style')) return;
    const st = document.createElement('style');
    st.id = 'malkkeum-retro-style';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }
  function apply(theme) {
    addStyle();
    if (theme === 'retro') document.documentElement.setAttribute('data-malkkeum-retro', '');
    else document.documentElement.removeAttribute('data-malkkeum-retro');
  }
  try {
    chrome.storage.local.get('settings', d => apply(((d && d.settings) || {}).theme));
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch.settings) apply((ch.settings.newValue || {}).theme);
    });
  } catch (e) { /* 무시 */ }
})();
