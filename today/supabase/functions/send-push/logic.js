/**
 * send-push 순수 로직 — today_notifications 웹훅 record → 전송 여부 + Web Push 페이로드.
 *
 * index.ts(Deno)가 이 로직으로 대상 판정·페이로드 생성 후, 수신자 구독으로 암호화 전송한다.
 * 순수 함수라 vitest 로 단위 테스트 (Deno 의존 없음).
 */

// 푸시로 알릴 알림 종류 — 새 댓글(INSERT 즉시, 0029 웹훅) + 새 글(클로드 자동댓글=완성 신호 시점, 0030 트리거).
// 리액션·공유해제 등은 인앱 배지로 충분.
export const PUSHABLE_KINDS = new Set(['new_comment', 'new_post']);

/** 이 알림 row 를 Web Push 로 보낼지. */
export function shouldPush(record) {
  return !!record && PUSHABLE_KINDS.has(record.kind) && !!record.recipient_id;
}

/**
 * 알림 row → showNotification 페이로드 (title/body/tag/data).
 * badge = 수신자의 서버 미읽음 수(today_notifications.read_at IS NULL). 앱 아이콘 배지 정본.
 * getNotifications().length(표시된 배너 수)는 취약·부정확해 안 씀 — SW 는 이 badge 값을 쓴다.
 */
export function buildPushPayload(record, badge) {
  const isPost = record.kind === 'new_post';
  // 글 preview 는 contenteditable HTML 조각(0013 이 content 앞 50자 동기화) — 푸시 본문에 태그 노출 방지.
  const raw = record.preview || '';
  const preview = (isPost ? raw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ') : raw).trim();
  const payload = {
    title: isPost ? '새 글' : '새 댓글',
    body: preview || (isPost ? '새 글이 올라왔어요' : '댓글이 달렸어요'),
    tag: isPost ? `post-${record.entry_id || record.id}` : `comment-${record.comment_id || record.id}`,
    data: {
      notificationId: record.id,
      entryId: record.entry_id,
      commentId: record.comment_id,
      recipientId: record.recipient_id,
    },
  };
  if (typeof badge === 'number') payload.badge = badge;
  return payload;
}

/** Health alerts bypass the notification enum/table and require service credentials. */
export function authorizePushRequest(headers, body, { serviceKey, webhookSecret } = {}) {
  if (body?.type === 'ingest_gap') {
    return serviceKey && headers.get('Authorization') === `Bearer ${serviceKey}` ? 'ingest_gap' : null;
  }
  return webhookSecret && headers.get('X-Push-Secret') === webhookSecret ? 'webhook' : null;
}

export function buildIngestGapPayload() {
  return {
    title: '가계부 자동입력 확인',
    body: '카드 문자 자동입력이 멈췄을 수 있어요. 최근 기록과 아이폰 단축어를 확인해 주세요.',
    tag: 'expense-ingest-gap',
    data: { section: 'expense' },
  };
}

/** Transport errors never return/log subscription endpoints or upstream bodies. */
export async function deliverPushMessages(subscriptions, payload, { send, prune }) {
  let sent = 0, pruned = 0, failed = 0;
  for (const subscription of subscriptions) {
    try {
      await send(subscription, payload);
      sent++;
    } catch (error) {
      const message = String(error?.message || error);
      if (/\b(404|410)\b|gone|not found/i.test(message)) {
        try { await prune(subscription); pruned++; } catch { failed++; }
      } else failed++;
    }
  }
  return { status: sent > 0 ? (failed > 0 ? 'partial' : 'ok') : 'delivery_failed', sent, pruned, failed, total: subscriptions.length };
}

/** Projects may have more than one valid service credential. An alternate bearer
 * is authorized only by the same project's service-admin endpoint, never by
 * decoding an unverified JWT role. Discard its response without reading users.
 */
export async function authenticatePushRequest(headers, body, options = {}) {
  const immediate = authorizePushRequest(headers, body, options);
  if (immediate) return immediate;
  if (body?.type !== 'ingest_gap' || !options.supabaseUrl) return null;
  const authorization = headers.get('Authorization') || '';
  const bearer = authorization.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!bearer) return null;
  try {
    const response = await (options.fetcher || fetch)(`${options.supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users?page=1&per_page=1`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${bearer}`, apikey: bearer },
    });
    const verified = response.status === 200;
    try { await response.body?.cancel(); } catch { /* no body data is used */ }
    return verified ? 'ingest_gap' : null;
  } catch {
    return null;
  }
}
