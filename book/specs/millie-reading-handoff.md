# 밀리 독서시간 → 북앱 통계 연동 — 핸드오프 (2026-06-06)

> 대상: 다음 세션 Claude (로컬, ~/apps). 밀리의서재 읽은 시간을 북앱(book) 통계에 자동 기록하는 작업.
> **남은 건 단 하나: `/bin/zsh`에 FDA(전체 디스크 접근) 부여 → 검증 → 구 트래커 제거.**

## 목표
밀리의서재로 책 읽은 시간을 북앱 통계 화면 "밀리 독서시간" 카드에 **자동**으로 쌓는다.

## 핵심 사실 (먼저 읽을 것)
- 밀리는 "읽은 시간(duration)"을 **웹 API·로컬 DB 어디에도 저장 안 함** (진도 read_percent·읽은 시각만). → 시간은 외부 측정만 가능.
- 측정 소스 = **macOS 스크린타임(knowledgeC.db)**의 밀리 앱 사용시간. (구 frontmost 폴링 트래커보다 정확: 오늘 기준 트래커 110초 vs 스크린타임 946초)
- 스크린타임 = "밀리 앱 띄운 시간"이라 엄밀한 독서시간 아닌 근사치 (사용자 인지함).
- 인증: book/study 동일 Supabase 프로젝트라 **study service role key 재사용** (`~/.config/study/.env`). owner=지오 `7bae5645-61c6-4476-9ff2-4c30a72812ff` 고정.

## ✅ 완료된 것
1. **Supabase 테이블** `book_reading_seconds(owner_id, day, seconds, source, updated_at, PK(owner_id,day))` + RLS(본인+파트너, quotes 패턴). 마이그 `book/supabase/migrations/0003_book_reading.sql`. **대시보드 SQL Editor로 적용 완료** (공유 프로젝트라 `supabase db push` 불가 — 버전 충돌).
2. **백필 완료**: 5/10~6/5 일별 스크린타임 적재됨 (`source=millie-screentime`). 수동 1회 실행으로.
3. **북앱 stats.js**: "밀리 독서시간" 카드(오늘/이번주/이번달) 추가 + 배포 완료. **화면 검증됨** — 오늘 15분 / 이번주 39분 / 이번달 30분. 카드 하단 패딩(marginBottom 28)도 수정·배포됨. (커밋들 origin/main에 있음, WIP 스냅샷 경유)
4. **싱크 스크립트** `~/.local/bin/millie-sync.sh`: knowledgeC에서 최근 35일 밀리 일별 사용 초를 읽어 Supabase upsert. 터미널(FDA 있음)에서 수동 실행 시 정상 동작 확인됨.
5. **LaunchAgent** `~/Library/LaunchAgents/com.gio.millie-sync.plist`: 15분(StartInterval 900) 간격. **ProgramArguments를 `/bin/zsh` 명시 실행으로 수정함** (책임 프로세스를 zsh로 고정하려고).

## ⏳ 남은 것 — FDA 권한 (이거 하나면 끝)
**문제**: launchd 백그라운드 잡이 `~/Library/Application Support/Knowledge/knowledgeC.db`(TCC 보호)를 읽으려면 Full Disk Access 필요. 현재 `authorization denied`.

**중요 — 책임 프로세스**: FDA에 `millie-sync.sh`를 추가해도 **denied 여전**. macOS가 권한 확인하는 대상은 스크립트가 아니라 **그걸 실행하는 `/bin/zsh`**. 그래서 plist를 `/bin/zsh <script>`로 바꿨고, **`/bin/zsh`를 FDA에 추가해야 함**.

**다음 단계 (순서대로)**:
1. **`/bin/zsh`를 FDA에 추가**: 시스템 설정 > 개인정보 보호 및 보안 > 전체 디스크 접근 권한 > `+` > `⌘⇧G` > `/bin/zsh` > 추가 > 토글 ON.
   - 사용자 직접이 빠름. (computer-use로 시도 시 **알림 센터/데스크톱 위젯이 `+` 클릭을 가로챔** — `killall NotificationCenter`로 닫아도 재등장. 주의.)
2. **검증**: `launchctl unload ~/Library/LaunchAgents/com.gio.millie-sync.plist; sleep 1; launchctl load -w ...; sleep 9` 후
   - `~/.local/share/millie-tracker/sync-stdout.log`에 `sync 2026-... -> 200/201` 뜨면 **성공**.
   - `~/.local/share/millie-tracker/sql-err.log`에 `authorization denied`면 아직.
3. **성공 시 구 트래커 제거**: `launchctl unload ~/Library/LaunchAgents/com.gio.millie-tracker.plist` + 파일 삭제 (`~/Library/LaunchAgents/com.gio.millie-tracker.plist`, `~/.local/bin/millie-tracker.sh`, `~/.local/bin/millie`). (frontmost 폴링은 부정확해서 스크린타임으로 완전 대체)
4. **정리(선택)**: `millie-sync.sh`의 `2>>"...sql-err.log"`를 `2>/dev/null`로 되돌려도 됨 (디버그 잔재).
5. **최종 화면 검증**: 북앱 stats 새로고침(SW 캐시 비우고) → 자동 갱신 반영 확인.

## 파일 맵
- `~/.local/bin/millie-sync.sh` — **현행** 싱크 (스크린타임 기반)
- `~/.local/bin/millie-tracker.sh`, `~/.local/bin/millie` — **구** 트래커/CLI (FDA 성공 시 제거)
- `~/Library/LaunchAgents/com.gio.millie-sync.plist` — 현행 (15분, /bin/zsh 실행)
- `~/Library/LaunchAgents/com.gio.millie-tracker.plist` — 구 (제거 대상)
- `~/.local/share/millie-tracker/` — sync-stdout.log, sql-err.log, (구)YYYY-MM-DD.log
- `~/apps/book/supabase/migrations/0003_book_reading.sql`
- `~/apps/book/src/features/stats.js` — 밀리 독서시간 카드 (line ~93 데이터 조회, ~170 카드)

## knowledgeC 쿼리 메모
```sql
SELECT date(datetime(ZSTARTDATE+978307200,'unixepoch','localtime')) AS day,
       CAST(SUM(ZENDDATE-ZSTARTDATE) AS INTEGER) AS sec
FROM ZOBJECT
WHERE ZSTREAMNAME='/app/usage' AND ZVALUESTRING='kr.co.millie.MillieShelf'
      AND datetime(ZSTARTDATE+978307200,'unixepoch','localtime') >= date('now','-35 days')
GROUP BY day HAVING sec > 0
```
- Cocoa epoch → Unix: `+978307200`. 날짜 필터는 **datetime() 문자열 비교**로 (strftime 숫자 비교는 타입 불일치로 0건 반환됨 — 함정).
