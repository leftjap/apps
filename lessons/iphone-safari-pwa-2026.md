<!-- trigger: iPhone,Safari,PWA,iOS,Web Push,IndexedDB,SW,Service Worker,manifest,홈 화면,standalone,apple-mobile-web-app-capable,Badge API | match-paths: */public/manifest.webmanifest,*/index.html,*/sw.js,*/service-worker.js,*/src/db/**,*/src/**/*push* -->
# iPhone Safari PWA 제약·함정 — 2026-04 정리

학습 컷오프 후 정보 + Safari 환경 특이점 박제. iOS 관련 코드·디버깅·정책 결정 시 인용.

## 환경 제약

- **File System Access API 미지원** → 데이터 export 는 `URL.createObjectURL(Blob)` 으로 JSON 다운로드
- **SW 캐시 갱신**: 버전 bump + `skipWaiting()` + 사용자 리로드 안내
- **Web Push**: iOS 16.4+ 홈스크린 PWA 한정 — 브라우저 탭 상태 불가. EU 지역 미지원 (iOS 17.4+ DMA). Safari 18.4+ Declarative Web Push (SW 없이). Badge API iOS 16.4+
- **iOS 26+ "홈 화면에 추가"**: 기본이 web app 모드 (이전 버전과 다름)
- **storage pressure 시 IndexedDB 삭제 가능** → 중요 데이터는 Supabase 동기화로 영속성 확보

## index.html meta 함정

- `apple-mobile-web-app-capable` 표준상 deprecated. 단 Safari splash·legacy 호환 위해 `mobile-web-app-capable` 와 **병행 유지** 필요

## 인용 시점

- iPhone Safari 동작 디버깅
- PWA manifest·SW 수정
- Web Push / Badge / 오프라인 데이터 정책 결정
- index.html 메타 태그 수정

## 갱신 정책

- 정보 시점: 2026-04
- iOS 메이저 업데이트 후 재검증 권장
