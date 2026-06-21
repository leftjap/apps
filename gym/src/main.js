/**
 * Wave 11.7 — Auth 통합 부트스트랩.
 *
 * 흐름:
 *   1. 모듈 로드: schema/queries/auth (auth 가 window.gymAuth 노출, schema 는 팩토리만 export)
 *   2. PWA storage persistence 요청 (실패 무시)
 *   3. 세션 확인 → allowlist 통과 시 ensureUserDB → seedDevSessions 자동 (dev only)
 *   4. allowlist 위반이면 즉시 signOut + AUTH_ERROR_KEY 마킹 (login 화면이 1회 소비)
 *   5. initApp() — app.js 의 라우트 가드 + onAuthStateChange 구독
 *
 * 미인증 / Supabase env 미설정 / mocks 허브(iframe) 환경 모두 정상 fallback.
 */
import './styles/paper.css';  // 라이트 페이퍼 디자인 토큰 (작업지시서 G1 — 전역)
import './db/schema.js';      // factory module load
import './db/queries.js';     // window.gymQueries 노출 (window.gymDB 동적 조회)
import './db/exercises.js';   // window.gymExercises 노출 (정적 카탈로그)
import './features/weights.js'; // window.gymWeights 노출 (Wave 11.7.2)
import './services/pr.js';      // window.gymPR 노출 (Wave 11.7.3)
import './features/session-pr.js'; // window.gymSessionPR 노출 (Wave 11.7.3b)
import './features/exercises-admin.js'; // window.gymExercisesAdmin 노출 (Wave 11.7.4b)
import './features/profile.js'; // window.gymProfile 노출 (Wave 11.7.6)
import './features/session.js'; // window.gymSession 노출 (Wave 11.9.1)
import './features/session-summary.js'; // window.gymSessionSummary 노출 (Wave 11.9.6)
import './features/home.js'; // window.gymHome 노출 (Wave 11.10.1)
import './features/stats.js'; // window.gymStats 노출 (Wave 11.11)
import * as dayDetail from './features/day-detail-sheet.js'; // §9-1 day-detail bottom sheet
if (typeof window !== 'undefined') window.gymDayDetail = dayDetail;
import './features/weight-keypad-sheet.js'; // §10-2 weight keypad bottom sheet
import './features/manage.js'; // window.gymManage 노출 (Phase B 단계 4)
import { Sync } from './db/sync.js'; // window.gymSync 노출 (Wave 11.8.1)
import { Auth } from './services/auth.js';
import { initApp } from './app.js';

// signOut 시 sync 정리 (Wave 11.8.1)
Auth.registerOnSignOut(() => Sync.stopSync());

// W-B — 백그라운드 진입·탭 닫기·iOS PWA freeze 시 펜딩 큐 즉시 flush.
// _ctx 무 시 flushPendingUploads 가 no_session 반환 — 안전 no-op.
// 3초 debounce 타이머가 백그라운드에서 setTimeout pause/discard 되는 손실 방지.
if (typeof document !== 'undefined') {
  const bgFlush = () => { Sync.flushPendingUploads().catch((e) => console.warn('[gym] bg flush', e)); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') bgFlush();
  });
  window.addEventListener('pagehide', bgFlush);
  document.addEventListener('freeze', bgFlush);
  // W-C — 온라인 복귀 시 펜딩 큐 즉시 flush (offline 중 적재된 큐 회복).
  window.addEventListener('online', bgFlush);
  // W-F — BFCache 복원 (e.persisted=true) 시 펜딩 큐 flush.
  window.addEventListener('pageshow', (e) => { if (e.persisted) bgFlush(); });
}

// 홈 화면 설치/PWA 저장소 영속성 요청 (spec §13)
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist()
    .then((granted) => console.info('[main] storage.persist() granted:', granted))
    .catch((e) => console.warn('[main] storage.persist() 실패', e?.message || e));
  // 사용자 첫 제스처 후 persist 재요청 — iOS grant 휴리스틱이 engagement 에 반응
  if (typeof window !== 'undefined' && navigator.storage.persisted) {
    window.addEventListener('pointerdown', async () => {
      try {
        if (!(await navigator.storage.persisted())) {
          const g = await navigator.storage.persist();
          console.info('[main] storage.persist() retry granted:', g);
        }
      } catch { /* noop */ }
    }, { once: true, passive: true });
  }
}

async function bootstrap() {
  try {
    const session = await Auth.getSession();
    if (session?.user) {
      if (Auth.isAllowedEmail(session.user.email)) {
        await Auth.ensureUserDB(session.user);
        // 콜드스타트 첫 paint 를 막지 않도록 startSync 는 비차단 (네트워크 다운로드 대기 → 빈 화면 리로드 체감 제거).
        // 부트스트랩 시점엔 in-flight stopSync 가 없어 await 불필요 (재인증 race 는 app.js subscribeAuth 가 처리).
        // startSync 가 hook attach 후 resolve → 그 뒤 sweepStaleSessions 의 finalize 가 push 큐에 올라간다(순서 보장).
        Sync.startSync(session.user)
          .then(() => window.gymSession?.sweepStaleSessions?.())
          .catch((e) => console.error('[main] sync 시작/sweep 실패', e));
      } else {
        // 미허용 이메일 — 즉시 종료 + login 마커
        try { localStorage.setItem(Auth.AUTH_ERROR_KEY, 'not_allowed'); } catch {}
        try { await Auth.signOut(); } catch (e) { console.error('[gym] bootstrap signOut 실패', e); }
      }
    }
  } catch (e) {
    console.error('[gym] bootstrap auth 실패', e);
  }
  initApp();
}

bootstrap();
