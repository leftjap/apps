/**
 * 탭 종료/숨김 시 pending 업로드 flush 배선.
 *
 * study 의 업로드 큐(_pendingUploads)는 in-memory Map + 3초 debounce 라, 그 창에서
 * 탭이 닫히거나(모바일) 백그라운드로 가면 아직 push 안 된 변경이 유실된다.
 * today PWA(main.js beforeunload → flushPendingUploads)와 동일하게, 언로드/숨김
 * 신호에 즉시 flush 해 유실 창을 닫는다. iOS PWA 는 beforeunload 를 자주 건너뛰므로
 * pagehide·visibilitychange(hidden) 도 함께 건다.
 *
 * @param {() => any} flush  플러시 함수 (Sync.flushPendingUploads)
 * @param {Window} win
 * @param {Document} doc  visibilityState 판정용
 */
export function installFlushOnHide(flush, win, doc) {
  if (!win?.addEventListener) return;
  const run = () => { try { flush(); } catch { /* 언로드 차단 금지 */ } };
  win.addEventListener('pagehide', run);
  win.addEventListener('beforeunload', run);
  win.addEventListener('visibilitychange', () => {
    if ((doc?.visibilityState ?? 'visible') === 'hidden') run();
  });
}
