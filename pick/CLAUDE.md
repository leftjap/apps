# Pick: 별점 기반 영화·책 추천 PWA

> 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 Pick 앱 전용. (구 `taste`: `0006` 마이그레이션에서 리네임)

## 도메인

별점 평가한 영화(왓챠피디아 CSV import)·책(앱 직접 별점)을 기반으로 다음 볼/읽을 작품을 추천하는 개인용 PWA. 척도 0.5~5.0 (0.5 단위).

## 스택

바닐라 JS (ES Modules) + Vite 6 + vite-plugin-pwa. `@supabase/supabase-js` + Dexie. (React 아님.) dev 5177 / preview 4177 (strictPort). 배포 `/apps/pick/`.

## 스펙·문서

- 앱 스펙: `~/apps/pick/specs/pick-app-spec.md` (+ `pick-wave1-plan.md`·`pick-wave2-plan.md`)
- 디자인 **정본**: `~/apps/pick/design-ref/` (`pick-design-brief.md` 는 입력 브리프·역사적)

## 데이터·인증

- 공유 geo-apps Supabase, 테이블 prefix `pick_*` (구 `taste_*`; `supabase/migrations/0001~0007`, `0006` = taste→pick 리네임)
- 왓챠 import: `src/lib/watcha.js`. 인증: `src/services/auth.js`

## 관련 스킬

`supabase-pattern` 은 study/gym/today 만 자동발동. pick 의 `src/db/`·`src/services/auth.js` 작업은 같은 패턴이나 스킬 미발동.
