/**
 * book entry — auth 부트스트랩 + 라우터 시작 (today main.js 패턴 답습).
 *
 * 흐름 (subscribe-first 패턴 — iOS Safari PWA getSession race #1560 회피):
 *  1) onAuthStateChange 즉시 구독 → supabase-js 가 INITIAL_SESSION 으로 persisted session 발화
 *  2) 세션 + 허용 이메일 → ensureUserDB + ensureProfile + showAuthenticated
 *  3) 세션 없거나 비허용 이메일 → signOut + showLogin
 *  4) 이후 SIGNED_IN/TOKEN_REFRESHED/USER_UPDATED/SIGNED_OUT 동일 핸들러로 처리
 */
import { Auth } from './services/auth.js';
import { supabase } from './services/supabase.js';
import { installAuthSessionGuard } from './services/auth-session-guard.js';
import { Profile } from './services/profile.js';
import { Sync } from './db/sync.js';
import { Queries } from './db/queries.js';
import { loadBooksIntoRegistry, bookOf, registerBookInMemory } from './data/books.js';
import { Aladin } from './db/aladin.js';
import './styles/book.css';
import './styles/v4.css';
import './features/feed.js'; // registerScreen('feed', ...)
import './features/library.js'; // registerScreen('library', ...)
import './features/thread.js'; // registerScreen('thread', ...)
import './features/add-edit.js'; // setActions(openAdd/openEdit/openDelete)
import './features/book-detail.js'; // registerScreen('book', ...)
import './features/lists.js'; // registerScreen('all', ...)
import './features/stats.js'; // registerScreen('stats', ...)
import './features/word.js'; // registerScreen('word', ...)
import './features/day.js'; // registerScreen('day', ...)
import './features/author.js'; // registerScreen('author', ...)
import { showAuthenticated, showLogin, setRouterUser, refresh } from './app.js';

// dev 전용 시드 (preview/E2E 시각 검증) — prod 번들 제외.
if (import.meta.env.DEV) import('./db/devSeed.js');

// dev 전용 인증 시뮬레이션 (preview/E2E 시각 검증 — OAuth 우회). prod 번들 제외.
// window.__bookDevAuth(email?) → Dexie 격리 DB 초기화 + 라우터 진입(피드). 서버 미검증(로컬 UI 전용).
if (import.meta.env.DEV) {
  window.__bookDevAuth = async (email = 'leftjap@gmail.com') => {
    const user = { id: `dev-${email}`, email };
    await Auth.ensureUserDB(user);
    try { loadBooksIntoRegistry(await Queries.listBooks()); } catch { /* noop */ }
    setRouterUser(user);
    showAuthenticated(user);
    return { id: user.id, email };
  };
}

// signOut 시 sync 정리 (Realtime 종료 포함).
Auth.registerOnSignOut(() => Sync.stopSync());

// 페이지 unload 시 pending flush + online 복귀 시 재push.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => Sync.flushPendingUploads());
  window.addEventListener('online', () => {
    Sync.flushPendingQuotesFromDexie().catch(() => {});
    Sync.flushPendingCommentsFromDexie().catch(() => {});
  });
}

/**
 * 책 메타(books)는 로컬 Dexie 전용이라 Supabase 동기화되지 않는다(quotes/comments 만 동기화).
 * 다른 기기에서 알라딘으로 추가한 책은 어구록(book_ref=ISBN)만 전파되고 메타가 없어
 * bookOf()=null → 서재/피드에서 통째로 누락된다. 어구록의 ISBN형 book_ref 중 메타 없는 것을
 * 알라딘으로 자력 복원 + Dexie 캐시(영구) 한다. 알라딘 실패 시 메모리 플레이스홀더(미저장 → 다음 로드 재시도).
 */
async function restoreMissingBooks() {
  const db = globalThis.bookDB;
  if (!db) return;
  let refs;
  try {
    const quotes = await db.quotes.toArray();
    refs = [...new Set(quotes.map((q) => String(q.book_ref)))]
      .filter((ref) => /^\d{13}$/.test(ref) && !bookOf(ref));
  } catch (e) { console.warn('[main] 누락 책 조회 실패', e?.message || e); return; }
  if (!refs.length) return;
  for (const ref of refs) {
    let book = null;
    try {
      const node = await Aladin.lookupByIsbn(ref);
      book = node && Aladin.toAppBook(node);
    } catch (e) { console.warn('[main] 알라딘 책 메타 조회 실패', ref, e?.message || e); }
    if (book?.id) {
      try { await Queries.upsertBook(book); } catch (e) { console.warn('[main] 책 메타 캐시 실패', ref, e?.message || e); }
      registerBookInMemory(book);
    } else {
      // 폴백: 메타 복원 실패 — 어구록 접근만은 보장(Dexie 미저장, 다음 로드 재시도)
      registerBookInMemory({ id: ref, t: `(제목 미확인) ${ref}`, a: '', p: '', c: '기타', coverUrl: '', w: 130, h: 195 });
    }
  }
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
  // Dexie DB 인스턴스 — Supabase 미설정·오프라인에서도 로컬 동작 확보
  await Auth.ensureUserDB(user);
  // 등록 책(알라딘) 메모리 레지스트리 로드 — bookOf 동기 조회용.
  try { loadBooksIntoRegistry(await Queries.listBooks()); } catch (e) { console.warn('[main] 등록책 로드 실패', e?.message || e); }
  // ensureProfile 은 RLS · 네트워크 오류 시 null 반환 — 화면은 그대로 진입 (UX 우선)
  await Profile.ensureProfile(user);
  setRouterUser(user);
  showAuthenticated(user);
  // Supabase → Dexie 동기화 (백그라운드). 마이그레이션 미적용 시 pull 실패해도 화면 유지.
  // pull 완료(Dexie 적재) 후 현재 화면 재렌더 — 첫 진입(빈 Dexie) 시 빈 화면 방지.
  Sync.startSync(user)
    .then(() => restoreMissingBooks())
    .then(() => refresh())
    .catch((e) => console.warn('[main] startSync 실패', Sync.formatError?.(e) || e));
}

async function bootstrap() {
  // Storage persistence 요청 — WebKit eviction 면제 (today main.js 주석 참조). deny 돼도 무해.
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    navigator.storage.persist()
      .then((granted) => console.info('[main] storage.persist() granted:', granted))
      .catch((e) => console.warn('[main] storage.persist() 실패', e?.message || e));
  }

  // subscribe-first — getSession() 호출 안 함 (iOS WebKit race #1560 회피).
  const guard = installAuthSessionGuard(supabase);

  Auth.onAuthStateChange(async (event, session) => {
    if (
      event === 'INITIAL_SESSION'
      || event === 'SIGNED_IN'
      || event === 'TOKEN_REFRESHED'
      || event === 'USER_UPDATED'
    ) {
      await handleSession(session);
    } else if (event === 'SIGNED_OUT') {
      if (guard) await guard.handleSignedOutWithRetry(showLogin);
      else showLogin();
    }
  });
}

bootstrap();
