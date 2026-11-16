#!/bin/sh
# 아이폰(사파리 + Userscripts 앱)용 한 파일짜리 말끔 스크립트 만들기
set -e
A=app/src/main/assets/ytab
OUT=ios/malkkeum.user.js
{
cat <<'HEAD'
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
HEAD
for f in classifier.js inject.js comments.js; do
  echo ""
  echo "// ---- $f ----"
  cat "$A/$f"
done
} > "$OUT"
echo "만듦: $OUT ($(wc -c < "$OUT") bytes)"
