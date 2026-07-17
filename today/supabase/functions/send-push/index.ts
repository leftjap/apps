/**
 * Edge Function: send-push
 *
 * today_notifications INSERT Database Webhook → 수신자의 Web Push 구독으로 알림 전송.
 * 기존 today_notify_new_comment 트리거가 넣는 row(recipient_id·preview·entry/comment id)를 그대로 사용.
 *
 * Request (Supabase DB Webhook POST):
 *   Headers: X-Push-Secret: <PUSH_WEBHOOK_SECRET>
 *   Body:    { type:'INSERT', table:'today_notifications', record:{...}, old_record:null }
 *
 * env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (자동 주입) · VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · PUSH_WEBHOOK_SECRET
 *
 * VAPID: raw base64url 키(클라 applicationServerKey 와 동일 공개키)를 JWK 로 변환해 @negrel/webpush 에 주입.
 */
// @ts-ignore Deno
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import * as webpush from 'jsr:@negrel/webpush@0.3';
import { shouldPush, buildPushPayload } from './logic.js';

// @ts-ignore Deno globals
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Response | Promise<Response>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET')!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const b64uToBytes = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const bytesToB64u = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// raw base64url VAPID 키 → @negrel/webpush importVapidKeys 용 JWK 쌍.
async function loadVapidKeys() {
  const rawPub = b64uToBytes(VAPID_PUBLIC);
  const x = bytesToB64u(rawPub.slice(1, 33));
  const y = bytesToB64u(rawPub.slice(33, 65));
  return webpush.importVapidKeys(
    {
      publicKey: { kty: 'EC', crv: 'P-256', x, y, ext: true },
      privateKey: { kty: 'EC', crv: 'P-256', x, y, d: VAPID_PRIVATE, ext: true },
    },
    { extractable: false },
  );
}

let _appServer: webpush.ApplicationServer | null = null;
async function getAppServer() {
  if (_appServer) return _appServer;
  _appServer = await webpush.ApplicationServer.new({
    contactInformation: 'mailto:leftjap@gmail.com',
    vapidKeys: await loadVapidKeys(),
  });
  return _appServer;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  if (req.headers.get('X-Push-Secret') !== WEBHOOK_SECRET) return json(401, { error: 'unauthorized' });

  let body: { record?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_json' });
  }
  const record = body.record;
  if (!shouldPush(record)) return json(200, { status: 'skipped' });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: subs, error } = await supabase
    .from('today_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', record!.recipient_id);
  if (error) return json(500, { error: 'subs_query', detail: error.message });
  if (!subs || subs.length === 0) return json(200, { status: 'no_subscribers' });

  // 앱 아이콘 배지 정본 = "마지막 앱 확인(badge_seen_at) 이후" 생성된 수신자 미읽음 수.
  // 전체 미읽음 누적치는 알림함을 안 비우면 계속 자람(2026-07-17 배지 26→27 실측) → 기준점 도입.
  // badge_seen_at NULL(구버전 클라·미기록)이면 전체 미읽음 fallback. entry_unshared 는 background 신호라 제외.
  const { data: prof } = await supabase
    .from('today_profiles')
    .select('badge_seen_at')
    .eq('user_id', record!.recipient_id)
    .maybeSingle();
  let unreadQuery = supabase
    .from('today_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', record!.recipient_id)
    .is('read_at', null)
    .neq('kind', 'entry_unshared');
  if (prof?.badge_seen_at) unreadQuery = unreadQuery.gt('created_at', prof.badge_seen_at);
  const { count: unread } = await unreadQuery;

  const appServer = await getAppServer();
  const payload = JSON.stringify(buildPushPayload(record, typeof unread === 'number' ? unread : undefined));
  let sent = 0;
  let pruned = 0;

  for (const s of subs) {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      const subscriber = appServer.subscribe(subscription as unknown as PushSubscription);
      await subscriber.pushTextMessage(payload, {});
      sent++;
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      // 만료/무효 구독(404 Not Found / 410 Gone) → 정리.
      if (/\b(404|410)\b|gone|not found/i.test(msg)) {
        await supabase.from('today_push_subscriptions').delete().eq('endpoint', s.endpoint);
        pruned++;
      } else {
        console.error('[send-push] 전송 실패', s.endpoint, msg);
      }
    }
  }
  // badge 는 관측·디버깅용 (pg_net 응답 로그에서 배지 계산값 확인 가능).
  return json(200, { status: 'ok', sent, pruned, total: subs.length, badge: typeof unread === 'number' ? unread : null });
});
