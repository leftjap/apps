# GoTrue 는 탭 복귀(hidden→visible)마다 `SIGNED_IN` 을 재발화한다

**발견 2026-08-21.** Study 세션 화면에서 응용 연습 5개를 발화한 뒤 다른 탭에 갔다 돌아오니
점수가 전부 사라짐. `onAuthStateChange('SIGNED_IN')` → 현재 라우트 재마운트가 원인.

## 사실

`@supabase/auth-js` 2.104.1 `GoTrueClient.js`:

- `_handleVisibilityChange()` (L4210) 가 브라우저에서 `window.addEventListener('visibilitychange', …)` 등록
- `_onVisibilityChanged(false)` (L4240) → visible 이면 `_recoverAndRefresh()` (L4262)
- `_recoverAndRefresh()` (L3790): 저장된 세션이 유효하고 **만료 마진(EXPIRY_MARGIN_MS = 90초) 밖**이면
  네트워크 호출 없이 `_notifyAllSubscribers('SIGNED_IN', currentSession)` (L3869)

즉 **탭을 떠났다 돌아올 때마다 SIGNED_IN 이 온다.** 직전과 동일한 세션이어도 dedup 이 없다.
access token 수명이 1시간이라 대부분의 복귀는 TOKEN_REFRESHED 가 아니라 SIGNED_IN 으로 온다.

구분:
- `supabase.auth.refreshSession()` 직접 호출 → `TOKEN_REFRESHED` (L3900). SIGNED_IN 아님.
- macOS 에서 **다른 앱**으로 전환은 visibilitychange 를 안 띄운다(탭은 계속 visible) → 다른 **탭** 전환·최소화·화면잠금만 해당.

## 함정

SPA 라우터가 `SIGNED_IN` 에서 "db 활성 반영"을 이유로 현재 라우트를 무조건 재마운트하면,
진행 중이던 화면이 탭 복귀마다 통째로 리셋된다. DOM 로컬 상태(영속화 안 한 진행)는 그대로 소실.

## 대응

재마운트 조건을 **DB 인스턴스 교체 여부**로 좁힌다 (계정 전환·뒤늦은 ensureUserDB 만 재마운트).

```js
// study/src/app.js
let lastMountedDB = null;              // mount() 끝에서 window.studyDB 기록
...
} else if (window.studyDB !== lastMountedDB) {
  mount(current);
}
```

회귀 테스트: `study/src/app.test.js` — "SIGNED_IN 재발화 시 진행 중 화면 유지".

## 파생 교훈

재마운트가 지워도 되는 상태인지 = **스냅샷에 저장되는지**로 판정할 것.
Study 세션의 응용 연습 행 점수·녹음 카운터·생산 연습 진행은 `activeSession` 스냅샷에 없어
재마운트/새로고침이면 복원 불가다 (2026-08-21 시점 미해결).
