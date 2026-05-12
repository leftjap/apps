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
import { Profile } from './services/profile.js';
import { Entries } from './features/entries.js';
import { Editor } from './features/editor.js';
// 가계부 분류 자산 (Keep GAS 포팅) — window.todayClassifier 노출 (mocks IIFE 접근용)
import Classifier from './services/expense-classifier.js';
import { Expenses } from './features/expenses.js';
import { Notifications } from './features/notifications.js';
import { Spotlight } from './features/spotlight.js';
import { Account } from './features/account.js';
import { Admin } from './features/admin.js';
import { Comments } from './features/comments.js';
import { Sync } from './db/sync.js';
import { DevSeed } from './db/devSeed.js';
import { showAuthenticated, showLogin } from './app.js';

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
}

async function handleSession(session) {
  const user = session?.user;
  if (!user) {
    showLogin();
    return;
  }
  // allowlist 검증 — 비허용 이메일은 즉시 로그아웃 + 차단 메시지
  if (!Auth.isAllowedEmail(user.email)) {
    localStorage.setItem(
      Auth.AUTH_ERROR_KEY,
      `허용되지 않은 계정입니다: ${user.email || '(이메일 없음)'}`,
    );
    await Auth.signOut();
    showLogin();
    return;
  }
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
  showAuthenticated(user);
  // mocks DOM 마운트 후 entries / expenses / notifications 부착 (setTimeout 0 — 동일 task 안 mocks IIFE 실행 보장)
  setTimeout(async () => {
    Entries.mountEntriesView(user);
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
  }

  // subscribe-first — supabase-js v2 (GoTrueClient.ts:4037-4088) 가 initializePromise 후
  // INITIAL_SESSION 이벤트로 persisted session 발화. 별도 getSession() 호출 안 함 (iOS WebKit race #1560 회피).
  Auth.onAuthStateChange(async (event, session) => {
    if (
      event === 'INITIAL_SESSION'
      || event === 'SIGNED_IN'
      || event === 'TOKEN_REFRESHED'
      || event === 'USER_UPDATED'
    ) {
      await handleSession(session);
    } else if (event === 'SIGNED_OUT') {
      showLogin();
    }
  });
}

bootstrap();
