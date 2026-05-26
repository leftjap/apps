import './styles/tokens.css';
import './styles/session.css';
import './db/schema.js';
import { TODAY_ISO, todayDayNumber } from './utils/today.js';
import './services/speech.js'; // window.studySpeech 등록 (Wave 11.11)
import { Auth } from './services/auth.js'; // window.studyAuth 등록 (Wave 11.12)
import { Sync } from './db/sync.js'; // window.studySync 등록 (Wave 11.13.1)
import './services/userMeta.js'; // window.studyUserMeta 등록 (Wave 11.67-impl)
import './services/pr.js'; // window.studyPR 등록 (Wave 11.68-b)
import './services/sessionStats.js'; // window.studySessionStats 등록 (Wave 11.68-d)
import { fetchDayLessonsForDay } from './services/dayLessons.js';
import { initApp } from './app.js';

// signOut 시 sync 정리 (Wave 11.13.1)
Auth.registerOnSignOut(() => Sync.stopSync());

// mocks 의 IIFE 스크립트가 참조할 수 있도록 window 에 노출 (Wave 11.6A).
// iframe 허브는 main.js 미경유 → window.studyDay 없음 → mocks 에서 fallback '2026-04-15'.
if (typeof window !== 'undefined') {
  window.studyDay = { TODAY_ISO, todayDayNumber, fetchDayLessonsForDay };
}

// 홈 화면 설치/PWA 저장소 영속성 요청 (spec §4 주석)
// 실패해도 앱은 정상 동작 — IndexedDB 는 storage pressure 시 삭제 가능하지만 Supabase 동기화가 보조 (Wave 11.13).
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

/**
 * Wave 11.12 인증 부트스트랩.
 *  1) Supabase getSession() — OAuth redirect 직후 detectSessionInUrl 가 fragment 토큰 자동 처리 후 반환.
 *  2) 허용 이메일 검증 → 위반 시 즉시 sign-out + login error 마커.
 *  3) 통과 시 ensureUserDB(user) → Dexie `study_<hash>` 생성 + seedIfNeeded.
 *  4) initApp() — 라우터 시작. 라우트 가드는 app.js 내부에서 실행.
 */
(async () => {
  try {
    const session = await Auth.getSession();
    if (session?.user) {
      if (Auth.isAllowedEmail(session.user.email)) {
        await Auth.ensureUserDB(session.user);
        // Wave 11.13.1 — 첫 다운로드 시작 (백그라운드, 실패 시 로컬 데이터 유지)
        // Wave 11.14 — 모든 테이블 empty 시 신규 사용자 자동 unlock (allowEmptyServerPush)
        window.__syncReady = Sync.startSync(session.user);
        window.__syncReady
          .then((result) => {
            if (
              result?.ok &&
              Array.isArray(result?.results) &&
              result.results.length > 0 &&
              result.results.every((r) => r.status === 'empty')
            ) {
              Sync.allowEmptyServerPush();
            }
          })
          .catch((e) => console.error('[main] sync 시작 실패', e));
      } else {
        // 허용 안 된 계정의 잔존 토큰 — 즉시 정리 + login 화면에 사유 표시
        localStorage.setItem(Auth.AUTH_ERROR_KEY, 'not_allowed');
        await Auth.signOut();
      }
    }
  } catch (e) {
    console.error('[main] auth bootstrap 실패', e);
  } finally {
    initApp();
  }
})();
