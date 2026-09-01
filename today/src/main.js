/**
 * Today entry — auth 부트스트랩 + 라우터 시작 (Wave 11.4).
 *
 * 흐름 (subscribe-first 패턴):
 *  1) onAuthStateChange 즉시 구독 → supabase-js 가 INITIAL_SESSION 이벤트로 persisted session 발화
 *  2) 세션 + 허용 이메일 → ensureProfile + showAuthenticated
 *  3) 세션 없거나 비허용 이메일 → signOut + showLogin
 *  4) 이후 SIGNED_IN/TOKEN_REFRESHED/USER_UPDATED/SIGNED_OUT 동일 핸들러로 처리
 *
 * iOS Safari PWA fix: 이전 패턴은 await getSession() 후 subscribe 였는데,
 * supabase-js #1560 (iOS WebKit getSession race) 로 mount 직후 null 반환 →
 * 매번 login 화면 노출 + INITIAL_SESSION 이 whitelist 밖이라 회복 불가 → "자꾸 풀림".
 */
import { Auth } from './services/auth.js';
import { supabase, storageKey } from './services/supabase.js';
import { installAuthSessionGuard } from './services/auth-session-guard.js';
import { backupSession, restoreSessionIfMissing } from './services/auth-session-backup.js';
import { markLogin } from './services/auth-diag.js';
import { Profile } from './services/profile.js';
import { Entries } from './features/entries.js';
import { SidebarCal } from './features/sidebarCal.js';
import { Editor } from './features/editor.js';
// 가계부 분류 자산 (Keep GAS 포팅) — window.todayClassifier 노출 (mocks IIFE 접근용)
import Classifier from './services/expense-classifier.js';
import { Expenses } from './features/expenses.js';
import { Notifications } from './features/notifications.js';
import { Spotlight } from './features/spotlight.js';
import { Account } from './features/account.js';
import { Admin } from './features/admin.js';
import { Comments } from './features/comments.js';
import { mountPushToggle } from './features/pushToggle.js';
import { mountBadgeClear } from './services/push.js';
import { Sync } from './db/sync.js';
import { DevSeed } from './db/devSeed.js';
import { showAuthenticated, showLogin, setRouterUser } from './app.js';

// signOut 시 sync 정리 (Wave 11.5.3.1) — stopSync 가 Realtime 도 종료 (Wave 11.5.4)
Auth.registerOnSignOut(() => Sync.stopSync());

// 페이지 unload 시 pending upload flush (Wave 11.5.3.2)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    Sync.flushPendingUploads();
  });
  // online 복귀 시 Dexie pending 재push (Wave 11.5.5 + 11.6.2: entries + expenses)
  window.addEventListener('online', () => {
    Sync.flushPendingFromDexie().catch((e) => console.warn('[main] online flush entries 실패', e));
    Sync.flushPendingExpensesFromDexie().catch((e) =>
      console.warn('[main] online flush expenses 실패', e),
    );
  });
  // 새 빌드 적용은 SW 'prompt' 모드가 담당 — 새 SW 는 대기했다가 다음 콜드스타트에 활성화
  // (vite.config.js registerType 주석 참조). 과거 controllerchange 강제 reload(ef872e0)는
  // 배포 후 첫 실행마다 "2번 로딩"을 유발해 제거 (2026-07-16).
}

// 사용자별 부팅 가드 — handleSession 의 전체 인증 부팅(뷰 mount + startSync + realtime 구독)을
// "사용자당 1회" 로 제한. supabase-js 는 콜드부팅 시 _recoverAndRefresh(SIGNED_IN 또는 TOKEN_REFRESHED)
// 를 먼저, 이어서 _emitInitialSession(INITIAL_SESSION) 을 발화 → 두 이벤트 모두 아래 핸들러의
// qualifying set 이라 가드가 없으면 handleSession 이 2~3회 실행돼 화면이 두 번 로딩된다(이중 부팅).
// 재로그인·사용자 전환은 아래 resetBootAndShowLogin / user.id 불일치로 정상 재부팅됨.
let _bootedUserId = null;

// showLogin 진입 시 부팅 가드 리셋 — 이후 (재)로그인이 정상 부팅되도록.
// 반드시 "showLogin 이 실제 실행되는 지점" 에서만 리셋해야 함:
//  - restore 성공(SIGNED_OUT → r.restored) · guard recovered:true 경로에서는 호출되지 않아
//    부팅 상태가 유지됨 → 뒤따르는 동일 사용자 SIGNED_IN 이 dedup 돼 잘못된 재부팅 방지.
function resetBootAndShowLogin() {
  _bootedUserId = null;
  showLogin();
}

async function handleSession(session) {
  const user = session?.user;
  if (!user) {
    resetBootAndShowLogin();
    return;
  }
  // allowlist 검증 — 비허용 이메일은 즉시 로그아웃 + 차단 메시지
  if (!Auth.isAllowedEmail(user.email)) {
    localStorage.setItem(
      Auth.AUTH_ERROR_KEY,
      `허용되지 않은 계정입니다: ${user.email || '(이메일 없음)'}`,
    );
    await Auth.signOut();
    resetBootAndShowLogin();
    return;
  }
  // 이미 이 사용자로 부팅 완료 → 반복 auth 이벤트(재-INITIAL_SESSION/SIGNED_IN/TOKEN_REFRESHED/
  // USER_UPDATED)는 재마운트·재싱크 skip. supabase client 가 새 토큰을 내부 반영하므로 할 일 없음.
  // set-before-await — 두 이벤트가 첫 await 전에 도착해도 동기 가드로 이중 부팅 차단(JS 단일 스레드).
  if (_bootedUserId === user.id) return;
  _bootedUserId = user.id;
  // Dexie DB 인스턴스 (Wave 11.5.1) — Supabase 미설정·오프라인에서도 로컬 동작 확보
  await Auth.ensureUserDB(user);
  // 2026-05-03 변경: Keep import 데이터 진입 후 dev fixture 시딩 비활성 + cleanup.
  // 매 로그인마다 entry-fixture-* / tx-XX (devSeed) 를 Dexie hard-delete. 멱등.
  // sync.js 가 비-UUID id 는 Supabase push skip (Wave 11.6.11) → 로컬 cleanup 의 Supabase 영향 0.
  try {
    const r = await DevSeed.cleanupDevFixtures();
    if (r?.ok && (r.entriesRemoved || r.expensesRemoved)) {
      console.info(`[main] devSeed cleanup: entries -${r.entriesRemoved}, expenses -${r.expensesRemoved}`);
    }
  } catch (e) {
    console.warn('[main] devSeed cleanup 실패 (무시):', e?.message || e);
  }
  // ensureProfile 은 RLS · 네트워크 오류 시 null 반환 — 화면은 그대로 진입 (UX 우선)
  await Profile.ensureProfile(user);
  setRouterUser(user.id);
  showAuthenticated(user);
  // mocks DOM 마운트 후 entries / expenses / notifications 부착 (setTimeout 0 — 동일 task 안 mocks IIFE 실행 보장)
  setTimeout(async () => {
    Entries.mountEntriesView(user);
    // 사이드바 "최근 4주" 캘린더 (작업지시서 §7 — 앱 시작 렌더)
    SidebarCal.mountSidebarCal(user);
    Editor.mountEditorTools();
    // 가계부 카테고리 사용자별 분리 — Keep USER_CONFIG 그대로 (leftjap 11 / soyoun 12)
    Classifier.setCurrentEmail(user.email);
    // Wave 11.8 — DB 사용자 매핑 로드 (Dexie 비어 있으면 freeze fallback 으로 안전 진행).
    // startSync 완료 후 재로드되면서 picker / brand / alias 가 DB 우선으로 전환.
    await Classifier.loadUserMappings(user.id);
    Expenses.mountExpensesView(user);
    Notifications.mountNotificationsView(user).catch((e) =>
      console.warn('[main] mountNotificationsView 실패', e?.message || e),
    );
    Spotlight.mountSpotlightView(user).catch((e) =>
      console.warn('[main] mountSpotlightView 실패', e?.message || e),
    );
    Account.mountAccountView(user).catch((e) =>
      console.warn('[main] mountAccountView 실패', e?.message || e),
    );
    mountPushToggle(user).catch((e) =>
      console.warn('[main] mountPushToggle 실패', e?.message || e),
    );
    // 앱 진입·포그라운드 복귀 시 아이콘 배지 클리어 + badge_seen_at 기록(배지 카운트 기준점).
    mountBadgeClear({ user });
    // Wave 11.8 — admin UI (사용자별 매핑 편집)
    Admin.mountAdminView(user).catch((e) =>
      console.warn('[main] mountAdminView 실패', e?.message || e),
    );
    Comments.mountCommentsView(user).catch((e) =>
      console.warn('[main] mountCommentsView 실패', e?.message || e),
    );
  }, 0);
  // Supabase → Dexie 다운로드 동기화 (Wave 11.5.3.1) — 백그라운드, 실패해도 화면 진입.
  // 2026-05-04 race fix: pullAll 완료 후 active 카테고리 재렌더 (mountEntriesView/mountExpensesView 가
  // 빈 Dexie 상태에서 초기 렌더 → mocks fixture/empty state 노출되는 문제 해결).
  Sync.startSync(user)
    .catch((e) => { console.warn('[main] startSync 실패', e); return null; })
    .then(async () => {
      try {
        // Wave 11.8 — pullAll 완료 후 사용자 매핑 DB → 캐시 재로드 (빈 Dexie 상태에서 채워진 후).
        await Classifier.loadUserMappings(user.id);
        Entries.rebindCategoryObserver?.();
        Expenses.rebindCategoryObserver?.();
        Expenses.refreshSidebarExpenseTotal?.();
        // Wave 11.8 — 모달 카테고리 picker 가 DB 매핑 반영하도록 재빌드 (mount 시점엔 Dexie 비어 있었음).
        Expenses.rebuildExpModalCatGrid?.();
        // Wave 11.8 — admin view 도 pullAll 완료 후 재렌더 (mount 시점엔 빈 화면이었음).
        Admin.refreshActive?.()?.catch?.((e) =>
          console.warn('[main] Admin.refreshActive 실패', e?.message || e),
        );
        // 회귀 3 fix — pullAll 완료 후 알림 배지 재계산 (Dexie 빈 상태 → 채워진 후 갱신)
        Notifications.refreshAlertBadge?.();
        // 사이드바 캘린더 — pullAll 완료 후 재집계 (mount 시점엔 Dexie 가 비어 있을 수 있음)
        SidebarCal.refresh?.()?.catch?.((e) =>
          console.warn('[main] SidebarCal.refresh 실패', e?.message || e),
        );
        // 회귀 5 fix — pullAll 완료 후 현재 article 댓글 영역 재마운트.
        // 진짜 원인 fix (renderDocFromRow in-place patch) 후 setTimeout 우회 불필요. 즉시 호출.
        Comments.refreshArticleComments?.()?.catch?.((e) =>
          console.warn('[main] refreshArticleComments 실패', e?.message || e),
        );
      } catch (e) {
        console.warn('[main] post-sync refresh 실패', e?.message || e);
      }
    });

  // Wave 11.8 — 다른 디바이스의 admin UI 편집이 realtime 으로 들어오면 classifier 캐시 무효화.
  // sync.js handleUserMappingChange 가 Dexie put/delete 후 listener 전파 → 여기서 reload.
  Sync.onRealtimeChange((payload) => {
    const t = payload?.table;
    if (t === 'today_user_categories'
      || t === 'today_user_brand_categories'
      || t === 'today_user_merchant_aliases') {
      Classifier.invalidateUserCache();
      Expenses.rebuildExpModalCatGrid?.();
      Admin.refreshActive?.()?.catch?.((e) =>
        console.warn('[main] realtime Admin.refreshActive 실패', e?.message || e),
      );
    }
  });
}

async function bootstrap() {
  // Storage persistence 요청 — WebKit 정책 (webkit.org/blog/14403) 상 best-effort mode 는
  // LRU 비활성·storage pressure 시 evict 가능. persistent mode 가 명시적 eviction 면제 카테고리.
  // Home Screen PWA 에서는 grant heuristic favorable. deny 돼도 무해.
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

  // subscribe-first — supabase-js v2 (GoTrueClient.ts:4037-4088) 가 initializePromise 후
  // INITIAL_SESSION 이벤트로 persisted session 발화. 별도 getSession() 호출 안 함 (iOS WebKit race #1560 회피).
  const guard = installAuthSessionGuard(supabase);

  Auth.onAuthStateChange(async (event, session) => {
    if (
      event === 'INITIAL_SESSION'
      || event === 'SIGNED_IN'
      || event === 'TOKEN_REFRESHED'
      || event === 'USER_UPDATED'
    ) {
      if (session) {
        backupSession(storageKey, session); // 복원용 미러 (rotation OFF 라 refresh 토큰 장수명)
        markLogin(storageKey); // 진단 마커 (eviction 판별용)
        await handleSession(session);
      } else if (event === 'INITIAL_SESSION') {
        // 부팅 시 토큰 없음 → 백업으로 1회 복원 시도 (성공 시 SIGNED_IN 후속 발화로 재진입)
        const r = await restoreSessionIfMissing(supabase, storageKey);
        if (!r.restored) await handleSession(null);
      } else {
        await handleSession(session);
      }
    } else if (event === 'SIGNED_OUT') {
      // 비정상 제거면 백업으로 복원 (명시 로그아웃은 백업이 이미 폐기돼 복원 안 됨)
      const r = await restoreSessionIfMissing(supabase, storageKey);
      if (r.restored) return;
      // resetBootAndShowLogin 을 콜백으로 전달 — guard 가 실제 로그아웃(explicit/cooldown/
      // 미복원)일 때만 이를 호출해 부팅 가드를 리셋 → 동일 계정 재로그인이 정상 재부팅됨.
      // recovered:true(조용히 복원)면 콜백 미호출 → 부팅 유지(불필요 재부팅 방지).
      if (guard) await guard.handleSignedOutWithRetry(resetBootAndShowLogin);
      else resetBootAndShowLogin();
    }
  });
}

bootstrap();
