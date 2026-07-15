/**
 * send-push 순수 로직 — today_notifications 웹훅 record → 전송 여부 + Web Push 페이로드.
 *
 * index.ts(Deno)가 이 로직으로 대상 판정·페이로드 생성 후, 수신자 구독으로 암호화 전송한다.
 * 순수 함수라 vitest 로 단위 테스트 (Deno 의존 없음).
 */

// 푸시로 알릴 알림 종류. 현재는 새 댓글만 (리액션·공유해제 등은 인앱 배지로 충분).
export const PUSHABLE_KINDS = new Set(['new_comment']);

/** 이 알림 row 를 Web Push 로 보낼지. */
export function shouldPush(record) {
  return !!record && PUSHABLE_KINDS.has(record.kind) && !!record.recipient_id;
}

/** 알림 row → showNotification 페이로드 (title/body/tag/data). */
export function buildPushPayload(record) {
  const preview = (record.preview || '').trim();
  return {
    title: '새 댓글',
    body: preview || '댓글이 달렸어요',
    tag: `comment-${record.comment_id || record.id}`,
    data: {
      notificationId: record.id,
      entryId: record.entry_id,
      commentId: record.comment_id,
      recipientId: record.recipient_id,
    },
  };
}
