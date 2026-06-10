# GitHub Pages PWA 서브경로 이관 함정 (taste→pick, 2026-06-10)

한 origin(leftjap.github.io)을 여러 PWA 가 `/apps/<name>/` 스코프로 공유할 때 경로를 옮기면:

1. **구 SW 가 옛 앱을 계속 서빙** — 구 경로에 redirect 스텁만 두면, 이미 설치된 SW 의
   precache(navigateFallback)가 네트워크 대신 캐시된 옛 index.html 을 반환해 스텁이 영영 안 보임.
   → 구 경로에 **self-destroying sw.js** 를 같이 배포해야 함 (skipWaiting → 스코프 캐시 삭제 →
   unregister → `clients.matchAll().navigate(c.url)` 로 열린 탭 재네비게이트). 브라우저는 SW 업데이트
   체크 시 HTTP 캐시를 우회해 sw.js 를 받아가므로 이 경로는 항상 통한다.
2. **caches API 는 origin 전역** — kill-SW 에서 `caches.keys()` 전체 삭제 금지 (형제 앱 precache 까지
   날아감). workbox precache 키에 스코프 URL 이 박혀 있으니 `k.includes('/apps/<old>/')` 로 한정.
3. **데이터는 origin 귀속이라 무손실** — IndexedDB(Dexie·sb-auth 토큰)·localStorage 는 경로와 무관.
   세션·평가 데이터는 이관 후 그대로 살아 있음 (재로그인 불필요).
4. **GoTrue redirect 허용목록 선확인** — 새 경로가 allowlist 에 없으면 OAuth 가 Site URL 로 떨어져
   로그인 파괴. 대시보드 안 열고도 실측 가능:
   `curl -w '%{redirect_url}' '<SUPA>/auth/v1/verify?token=bogus&type=magiclink&redirect_to=<새URL>'`
   → 허용이면 새 URL 로, 미허용이면 Site URL 로 303. (와일드카드 `…/apps/*` 면 자동 통과)
5. **runtimeCaching cacheName 공유 주의** — 여러 앱이 같은 `cacheName: 'pages'` 를 쓰면 한 origin 에서
   캐시를 공유한다. 이관 시 삭제 대상에 넣지 말 것 (타 앱 항목 포함).
