/**
 * Web Push 구독 (새 글 + 댓글 알림).
 *
 * 흐름: enablePush → Notification 권한 요청(사용자 제스처) → pushManager.subscribe(VAPID 공개키)
 *       → today_push_subscriptions upsert(endpoint 기준). 서버(send-push Edge Function)가 이 구독으로 전송.
 *
 * iOS: 홈화면 설치 PWA(iOS 16.4+)에서만 동작 — Safari 탭에서는 PushManager 미노출.
 *
 * VAPID 공개키는 공개 대상(applicationServerKey) — 소스 상수로 둔다. 비밀키는 Supabase secret(VAPID_PRIVATE_KEY).
 * 테스트: profile.js 처럼 opts 로 supabase / registration / Notification 주입해 전역 우회.
 */
import { supabase } from './supabase.js';

export const VAPID_PUBLIC_KEY =
  'BIn3_zlazDfDXa59811CM3THCsBWVsdnr6ubLcmHMT5qQZ6Wfp3d_KheW573LbNT4x8wmN2dDgdYkPJpLQ3UW7g';

/** VAPID 공개키(base64url) → Uint8Array (applicationServerKey 요구 형식). */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** PushSubscription → { endpoint, p256dh, auth } (DB 저장 형식). */
export function serializeSubscription(sub) {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  };
}

/** 브라우저가 Web Push 를 지원하는가 (SW + PushManager + Notification). */
export function isPushSupported(g = typeof globalThis !== 'undefined' ? globalThis : {}) {
  return !!(g.navigator?.serviceWorker && g.PushManager && g.Notification);
}

async function resolveRegistration(opts) {
  if (opts.registration) return opts.registration;
  const nav = opts.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  if (!nav?.serviceWorker) return null;
  return nav.serviceWorker.ready;
}

/**
 * 알림 켜기 — 권한 요청 + 구독 + 구독 저장.
 * 반환: { ok:true, endpoint } | { ok:false, reason:'no_supabase'|'no_user'|'unsupported'|'denied'|'upsert_failed' }
 */
export async function enablePush(user, opts = {}) {
  const sb = 'supabase' in opts ? opts.supabase : supabase;
  if (!sb) return { ok: false, reason: 'no_supabase' };
  if (!user?.id) return { ok: false, reason: 'no_user' };

  const Notif =
    opts.Notification || (typeof Notification !== 'undefined' ? Notification : null);
  const registration = await resolveRegistration(opts);
  if (!Notif || !registration?.pushManager) return { ok: false, reason: 'unsupported' };

  const permission = await Notif.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const { endpoint, p256dh, auth } = serializeSubscription(subscription);
  const payload = {
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
    user_agent:
      opts.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null),
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from('today_push_subscriptions')
    .upsert(payload, { onConflict: 'endpoint' });
  if (error) {
    console.error('[push] 구독 저장 실패', error);
    return { ok: false, reason: 'upsert_failed', error };
  }
  return { ok: true, endpoint };
}

/** 알림 끄기 — 구독 해제 + 저장 삭제. */
export async function disablePush(opts = {}) {
  const sb = 'supabase' in opts ? opts.supabase : supabase;
  const registration = await resolveRegistration(opts);
  const subscription = registration?.pushManager
    ? await registration.pushManager.getSubscription()
    : null;
  if (subscription) {
    const { endpoint } = subscription;
    await subscription.unsubscribe();
    if (sb) await sb.from('today_push_subscriptions').delete().eq('endpoint', endpoint);
  }
  return { ok: true };
}

/**
 * 앱 진입·포그라운드 복귀 시: 아이콘 배지 제거 + badge_seen_at 기록.
 * badge_seen_at 은 send-push 의 배지 카운트 기준점 — 이 시각 이후 생성된 미읽음만 센다
 * (전체 미읽음 누적치는 알림함을 안 비우면 영원히 안 줄어 배지가 26·27… 로 자람, 2026-07-17 실측).
 * 알림 탭으로 진입하는 경로는 push-sw.js notificationclick 이 별도 처리.
 * 반환: Badging API 지원 여부 (badge_seen_at 기록은 미지원이어도 수행 — "앱을 연 사실"은 유효).
 */
export function mountBadgeClear(opts = {}) {
  const nav = opts.nav || (typeof navigator !== 'undefined' ? navigator : null);
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  const sb = 'supabase' in opts ? opts.supabase : supabase;
  const user = opts.user || null;
  const supported = !!nav?.clearAppBadge;

  const markSeen = () => {
    if (!sb || !user?.id) return;
    sb.from('today_profiles')
      .update({ badge_seen_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) console.warn('[push] badge_seen_at 기록 실패', error.message);
      });
  };
  const onEnter = () => {
    if (supported) nav.clearAppBadge().catch(() => {});
    markSeen();
  };

  onEnter();
  doc?.addEventListener?.('visibilitychange', () => {
    if (doc.visibilityState === 'visible') onEnter();
  });
  return supported;
}

/** 현재 구독 상태 — { supported, permission, subscribed }. */
export async function getPushStatus(opts = {}) {
  const supported = opts.supported ?? isPushSupported();
  const Notif =
    opts.Notification || (typeof Notification !== 'undefined' ? Notification : null);
  const permission = Notif ? Notif.permission : 'default';
  const registration = await resolveRegistration(opts);
  const subscription = registration?.pushManager
    ? await registration.pushManager.getSubscription()
    : null;
  return { supported, permission, subscribed: !!subscription };
}
