<!-- trigger: supabase,pagination,select,1000,row,limit,head:true,count:exact,truncation | match-paths: src/db/sync.js,src/db/queries.js,scripts/import-*.js,scripts/verify-*.js -->
# Supabase `from().select()` — 페이지네이션 없으면 1000 row 가 default 한도

## 증상

`SUPABASE_SERVICE_ROLE_KEY` 로 service_role 클라이언트 만들고 큰 테이블 검증:

```js
const { data } = await sb.from("today_expenses").select("owner_id, meta");
// data.length === 1000  (실제 DB 에는 2358 row)
```

→ `data.length` 만 보고 row 수 파악하면 **부분 sample 만 본 채 잘못된 결론** 도출.

검증 시나리오: Keep 데이터 2,358 expenses import 후 row count 검증. 1000 row 만 받아서 owner_id 별 group 카운트 → leftjap 772 + soyoun 228 = 1000. "소연 1,358 missing" 이라는 오진 + constraint/trigger 가설 추적에 5+ 분 낭비.

## 원인

Supabase REST API (PostgREST) 는 응답 크기 제한을 위해 default 1000 row 만 반환. 명시적 `range()` 또는 `limit()` 없으면 silent 절단 — 응답에 truncation 표시 없음.

`select("*", { count: "exact", head: true })` 는 row 데이터 안 받고 count 만 — limit 영향 없음 (정확).

## 회피 패턴

### 1. count 만 필요할 땐 `head: true`

```js
const { count } = await sb.from("today_expenses")
  .select("id", { count: "exact", head: true })
  .eq("owner_id", uid);
// count = 정확한 전체 개수 (페이지네이션 불필요)
```

### 2. 행 데이터 전체 필요할 땐 페이지네이션 helper

```js
async function pageAll(table, owner, cols) {
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select(cols)
      .eq("owner_id", owner)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
```

### 3. 검증 시 row 수와 응답 .length 가 일치하는지 sanity check

```js
// 페이지네이션 결과와 head:true count 가 일치해야 함
const { count } = await sb.from(t).select("id", { count: "exact", head: true });
const all = await pageAll(t, ...);
console.assert(count === all.length, `mismatch ${count} vs ${all.length}`);
```

## 발견 맥락

- 2026-05-03 Today Wave: Keep 데이터 (gio 772 + soyoun 1586 = 2358 expenses) import 검증 시.
- import 자체는 정상 (batch upsert ok=2358 fail=0). 검증 쿼리만 limit 에 걸림.
- 첫 진단: 'today_expenses_sms_unique constraint 충돌로 1358 row 사라짐'. 실제는 검증 쿼리 부정확.

## Why + How to avoid

- **Why**: Supabase `select()` 의 default limit 1000 은 docs 에 명시돼 있지만 silent — truncation 시 경고/메타데이터 없음. 작은 테이블 (≤1000) 만 쓰다가 큰 테이블에서 처음 부딪히면 원인 추적 어려움.
- **How to avoid**:
  1. 검증 쿼리는 항상 `head: true` count 와 페이지네이션 두 방식을 **둘 다** 써서 cross-check.
  2. row 데이터를 받는 쿼리는 **무조건 페이지네이션** 또는 명시적 `.limit()` 으로 의도 표현.
  3. PostgREST 의 `Content-Range` 헤더 (`0-999/2358`) 가 truncation 을 알려주지만 supabase-js 는 기본 노출 안 함. raw fetch 시 활용 가능.
