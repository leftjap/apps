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
}

// 홈 화면 설치/PWA 저장소 영속성 요청 (spec §13)
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

async function bootstrap() {
  try {
    const session = await Auth.getSession();
    if (session?.user) {
      if (Auth.isAllowedEmail(session.user.email)) {
        await Auth.ensureUserDB(session.user);
        // Wave 11.8.1 — 첫 다운로드 시작 (백그라운드, 실패 시 로컬 데이터 유지)
        Sync.startSync(session.user).catch((e) => console.error('[main] sync 시작 실패', e));
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
