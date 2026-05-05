<!-- trigger: happy-dom,createImageBitmap,canvas,toDataURL,ClipboardItem,vitest 이미지,image API,jsdom,압축 | match-paths: src/features/*image*.js,src/features/*editor*.test.js,src/features/entries.test.js -->
# happy-dom 이미지 API 미지원 — 단위 회귀 가드 사각지대

**발생 wave:** Today Wave 11.7 (잠재) → 11.9.2 (chrome-devtools 도구 검증 중 노출)
**환경:** vitest 2.1.x + happy-dom (vite-plugin 디폴트 환경)
**한 줄:** `createImageBitmap` / `canvas.toDataURL` 등 이미지 처리 API 가 happy-dom 에 미지원이라, dimensions 캐시 같은 시점성 버그는 단위 테스트로 검출 안 됨. 실 브라우저 도구 (chrome-devtools / preview MCP) 검증 필수.

---

## Why (근본 원인)

happy-dom 은 DOM 시뮬레이터지 브라우저가 아님. 이미지 처리 관련 다음 API 미지원 또는 부분 stub:

| API | happy-dom 동작 | 영향 |
|---|---|---|
| `createImageBitmap(blob)` | 미지원 (Promise reject) | bitmap.width/height 검증 단위 테스트 불가 |
| `canvas.toDataURL(...)` | stub (빈 dataUrl 또는 throw) | JPEG 압축 결과 검증 불가 |
| `bitmap.close()` | 미구현 | close 후 width/height = 0 동작 검증 불가 |
| `ClipboardItem` | iOS Safari 가까이 stub | 이미지 클립보드 카피 검증 불가 |

따라서 이런 코드의 단위 테스트는:
- 순수 함수 부분만 (e.g. `calcCompressionDimensions`) 검증 가능
- bitmap/canvas 통합 로직은 mock 으로 우회하거나 실 브라우저 의존

## How to avoid (구체 패턴)

### 1. 순수 함수 분리

bitmap/canvas 의존 로직 안에서 순수 함수만 분리해 단위 검증.

```js
// O — calcCompressionDimensions 는 입력 (w, h, maxDim) 만 받음 → 단위 가능
export function calcCompressionDimensions(w, h, maxDim) { ... }

// △ — compressImage 는 createImageBitmap 호출 → happy-dom 에서 unsupported_format 만 검증 가능
export async function compressImage(file) { ... }
```

### 2. dimensions / state 캐시 패턴 강제

bitmap.close() / 다른 cleanup 호출 후 자원 속성 (width/height/dataset) 가 0/null 반환되는 case. **항상 cleanup 전에 캐시.**

```js
// X — Wave 11.7 회귀 (Wave 11.9.2 fix)
ctx.drawImage(bitmap, 0, 0, tw, th);
bitmap.close?.();
return { originalWidth: bitmap.width, ... };  // 0 반환

// O
const originalWidth = bitmap.width;
const originalHeight = bitmap.height;
ctx.drawImage(bitmap, 0, 0, tw, th);
bitmap.close?.();
return { originalWidth, originalHeight, ... };
```

### 3. 실 브라우저 도구 검증 의무화

bitmap/canvas 통합 로직 변경 시 단위 테스트만으론 부족. 다음 도구 1개 이상 검증:

- **preview MCP (`preview_eval`)** — 빠른 module 노출 + 동작 검증. 별 chrome profile = OAuth 미공유 (memory.md 명시) 한계
- **chrome-devtools MCP (`evaluate_script` + `list_network_requests`)** — Network 탭 + cumulative 검증 가능. SW 캐시 무효화 (`caches.delete`) 필요
- **사용자 환경 Chrome / iPhone Safari** — 마지막 단계. PWA standalone / Web Share Target / 카메라 직접 접근은 desktop 모방 불가

### 4. 통합 mock vs 실 검증 트레이드오프

vi.mock 으로 createImageBitmap stub:
```js
vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
  width: 1920, height: 1080,
  close: vi.fn(),
})));
```
- 장점: 단위 회귀 가드 가능
- 단점: 실 브라우저의 width/height-after-close 같은 시점성 버그 모방 불가 (mock 이 의도대로만 동작). Wave 11.9.2 케이스에서 mock 으론 잡을 수 없었음

**권장:** mock 단위 테스트 (계약 검증) + 실 브라우저 도구 검증 (시점성 검증) 병행.

## 검증 (재발 시 사인)

| 사인 | 진단 |
|---|---|
| vitest 통과 + 사용자 환경 dimensions 0 | 단위 테스트 mock 이 시점성 미검증 → 실 브라우저 검증 추가 |
| `bitmap.close()` 후 width/height 사용 | cleanup 전 캐시 패턴 위반 → grep `\.close()` 후 `\.(width|height)` 검토 |
| canvas.toDataURL 결과 빈 string | happy-dom 환경 — 실 브라우저 의존 코드 |
| ClipboardItem `is not defined` | happy-dom 미지원 → 실 동작 검증 필수 |

## 관련 wave

- Today Wave 11.7 (phase 1 prototype) — 잠재 회귀 도입
- Today Wave 11.7.2 (image 클릭 selection) — ClipboardItem 도입, 사용자 환경 검증만
- Today Wave 11.9 (heic2any) — compressImage HEIC 분기 추가
- Today Wave 11.9.2 (회귀 fix) — chrome-devtools 도구 검증 중 originalWidth=0 발견
