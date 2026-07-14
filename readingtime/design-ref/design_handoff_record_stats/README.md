# Handoff: 리딩타임 — 기록(통계) 화면 개선 + 위치 기능

> 이 문서는 **목업 코드(`mockups/RTRecord.dc.html`)를 사실 기준**으로 작성되었습니다. 모든 수치·색·공식·데이터는 그 파일에서 그대로 옮긴 것입니다. Claude Code는 이 문서 + 목업만으로 **시안과 100% 동일하게** 재현할 수 있어야 합니다. 값이 의심되면 목업의 해당 부분을 직접 여세요(브라우저로 열면 실제 동작).

## 0. 목업 파일 성격 / 대상 환경
- `mockups/` 파일은 **HTML 디자인 레퍼런스(프로토타입)**입니다 — 그대로 이식할 프로덕션 코드가 아닙니다.
- 리딩타임은 **iOS 네이티브 앱**입니다. 기존 앱 환경(SwiftUI 등)·패턴으로 **재구현**하세요.
- **지도 대륙은 플레이스홀더**입니다(손으로 그린 타원). 실제로는 **MapKit 또는 Google Maps SDK**를 깔고, 그 위에 이 문서가 정의하는 **핀 / 클러스터 / 배지 / 시트 / 책 상세 레이어**를 얹습니다. 목업의 투영·팬·줌·클러스터 로직은 SDK가 대체하되, **UI·상호작용 규칙은 동일하게** 유지하세요.
- **Fidelity: High.** 아래 hex/px/공식을 그대로 사용. (지형만 예외)

## 1. Overview
기존 기록 화면(주간/월간 2탭, 월간=캘린더뿐)을 **주 · 월 · 지도 3탭**으로 확장합니다.
1. **주간** — 막대 차트 + 선택일 팝오버 + 연속/시간대 카드 + 랭킹.
2. **월간** — 캘린더 + 이달 요약 + 주차별 막대 + 랭킹 + 연속/시간대.
3. **지도(신규)** — 독서 세션에 **위치**를 도입. 읽은 위치에 책 표지 핀, 여러 권이면 표지+숫자 배지로 묶음, 탭 시 그곳의 책/책 상세로 진입.

**파트너 모드**: 화면은 1인 기준. 상대(지오/소연) 데이터는 홈의 파트너 진입점 → 동일 화면 컴포넌트에 상대 데이터셋 렌더.

---

## 2. 공통 셸 (모든 탭 공통)
- **폰 프레임**: `390 × 844`, `border-radius:45`, `background:#f6f3ea`, `box-shadow:0 40px 70px -28px rgba(60,45,30,.5),0 0 0 1px rgba(0,0,0,.08)`. 폰트 `Noto Sans KR`, `letter-spacing:-.005em`, `word-break:keep-all`. (프레임은 목업용 디바이스 목. 실제 앱은 시스템 safe-area 사용.)
- **노치**: 162×29 검정, `border-radius:0 0 20px 20px`, 상단 중앙, z60.
- **상태바**: height 47, `padding:0 32px`, z55, color `#141413`. 시계 "9:41" = Poppins 600 / 15px. (디바이스 크롬 — 앱에선 시스템 상태바.)
- **홈 인디케이터**: bottom 8, 134×5, radius3, `rgba(20,20,19,.28)`, z80.
- **헤더(콘텐츠, z20)**: `padding:52px 18px 0`, flex space-between.
  - 좌: 뒤로가기 chevron(SVG viewBox 0 0 20 20, path `M12 4 6 10l6 6`, stroke `#3f3a2d` 2.2) in 38×38 + "기록" 800/17 `#17150f`, gap4.
  - 우: **세그먼트 컨트롤** `[주 | 월 | 지도]` — 컨테이너 `background:#ece7d8;border-radius:99px;padding:3px;margin-right:4px`. 각 버튼 `padding:5px 13px;border-radius:99px;font-size:11.5px`. 선택 = `font-weight:700;color:#f6f3ea;background:#17150f`. 비선택 = `font-weight:600;color:#8c8570;background:transparent`.
- **스크롤 영역**: 주/월 = `position:absolute;top:102px;left:0;right:0;bottom:0;overflow-y:auto;padding:0 22px 28px`. 지도 = `top:98px`(패딩 없음, 전면).
- 숫자·날짜·시간은 **전부** `IBM Plex Mono` + `font-variant-numeric:tabular-nums`.

### 헬퍼(정확히 이 로직)
- `fmtHM(min)` → `floor(min/60) + ":" + String(min%60).padStart(2,'0')` (예 446→`"7:26"`, 60→`"1:00"`).
- `fmtKorMin(min)` → `h=floor(min/60), m=min%60; h>0 ? h+"시간 "+m+"분" : m+"분"`.

---

## 3. 주간 탭
순서(위→아래):
1. **주 범위**: mono 500/10.5, `letter-spacing:.1em`, `#b5ad97` — "5.18 – 5.24".
2. **타이틀**: 900/26, `letter-spacing:-.04em`, `#17150f`, line-height1.2 — "이번 주 7시간 26분"(숫자만 mono).
3. **델타 칩**: inline-flex gap4, 700/11.5, `#2c4a3c`, `background:#e9efe6`, `padding:4px 10px;border-radius:99px`, 위 화살표 SVG(path `M12 19V5M6 11l6-6 6 6` stroke `#2c4a3c` 3) + "52분". 옆에 mono 500/10.5 `#b5ad97` "vs 지난주".
4. **막대 차트 카드**: `margin-top:14px; background:#fdfbf4; border:1px solid #e9e2cf; border-radius:20px; padding:16px 15px 12px; box-shadow:0 1px 2px rgba(22,20,15,.03)`.
   - 내부 `position:relative; padding-top:84px`(팝오버 공간).
   - **팝오버**: `position:absolute;top:0;z-index:5; left:{tip.leftPct}%; transform:translateX(-50%); animation:v7TipPop .42s cubic-bezier(.2,1.2,.4,1)`. `leftPct = (day+0.5)/7*100`. 툴팁 `background:#17150f;border-radius:13px;padding:9px 12px;min-width:150px;box-shadow:0 12px 26px -12px rgba(22,20,15,.55)`. 날짜줄 mono 600/9.5 `#8f897b` (`"5.{18+day} {요일} · {min}분"`). 각 책행: 색점 7×7 radius2 `book.dot` + 제목 600/11 `#f2eedd` + 분 mono 600/11 `#b5ad97`(margin-left auto). 툴팁 아래 꼬리 2×10 `#17150f`.
   - **막대 행**: flex align-end justify-between gap8 `height:120px`. 막대 버튼 7개: flex1, col, align-center, justify-end, height100%, gap5. 값 span mono 9px. **막대 div**: `width:100%;max-width:26px;flex:none;border-radius:7px;transform-origin:bottom;height:{d.h}px;background:{d.barBg};box-shadow:{d.barShadow};animation:v5Stack .55s cubic-bezier(.2,.8,.2,1) both`. 요일 span mono 9.5px.
   - **막대 높이 공식**: `maxMin=96; h = round(12 + min/96*72)`.
   - **색/상태**: 선택일 → `barBg = linear-gradient(180deg,#3a5c4b,#26413a)`, `barShadow = 0 0 0 2.5px rgba(44,74,60,.22)`. 오늘(비선택) → `#c9be9c`. 그 외 → `#d6cba9`. 값색: 오늘 `#2c4a3c` / 선택 `#8c8570` / 그외 `#c6bea8`, fw 700(오늘·선택) else 500. 요일색: 오늘 `#17150f` / 일요일 `#c2553a` / 그외 `#b5ad97`, fw700 오늘.
   - **막대 탭** → `day` 상태 변경 → 팝오버가 그 요일로 이동, `tip` 재계산.
5. **연속 / 시간대 카드 행**: `margin-top:14px; display:flex; gap:11px`. 각 카드 flex1 `background:#fdfbf4;border:1px solid #e9e2cf;border-radius:18px;padding:13px 14px`.
   - **연속**: 숫자 mono 700/21 `letter-spacing:-.03em` `#c2553a` + "일 연속" 600/11.5 `#8c8570`. 아래 mt10 flex gap4, **14개 점** 7×7 radius50%. 색 배열(0→13): `#eee7d4,#eee7d4,#dd9c8b,#dd9c8b,#d67d63,#d67d63,#d67d63,#cd6647,#cd6647,#cd6647,#c2553a,#c2553a,#c2553a,#c2553a`. 마지막 점: `box-shadow:0 0 0 2.5px rgba(194,85,58,.25)` + `animation:v4Blink 2s ease-in-out infinite`.
   - **시간대**: "주로 밤 9–11시" 800/13. 트랙 mt11 height8 radius99 `#ece5d2` overflow hidden. 세그먼트1 `left:56%;width:18%;background:#c8b98f;opacity:.55`. 세그먼트2 `left:79%;width:15%;background:linear-gradient(90deg,#3a5c4b,#26413a);animation:v6Breath 3s ease-in-out infinite`. 축 mt7 justify-between: 06/12/18/24 mono 9px `#c6bea8`.
6. **이번 주 많이 읽은 책**: 헤딩 `margin:15px 2px 8px` 800/14. 각 행: flex align-center gap12 padding6px2. 표지 30×43 radius3(좌 spine 2px `rgba(0,0,0,.16)`, 제목 mt14 900/7.5 중앙 `book.tc`). 제목 700/13 + 태그 mono 9px `#b5ad97`(밀리 책이면 "밀리"). 진행바 mt5 h5 radius99 `#ece5d2`, fill `width:{pct}%;background:{book.dot};animation:v5Sweep 1s ...`. 합계 mono 700/12.5 `#17150f`. **상위 3** = 주간 세션 합산 내림차순. pct = 값/최댓값*100.

---

## 4. 월간 탭
1. **헤더 행**: flex align-end justify-between. h1 "2026년 5월" 900/26 ls-.04. 우측 화살표 2개: 30×30 radius9 `#ece7d8`, chevron(`M12 4 6 10l6 6` / `M8 4l6 6-6 6`) stroke `#8c8570`.
2. **요약 라인**: `margin-top:7px;display:flex;align-items:center;gap:10px;padding-bottom:9px;border-bottom:1px solid #e8e1cd`. "21:08" mono 700/17 ls-.02 `#17150f` + "총 시간" 500/12 `#8c8570` + 점 3×3 `#d5cdb8` + "17 / 21일 읽음"(17만 mono 700 `#2c4a3c`).
3. **요일 헤더**: grid 7col `margin:11px 0 5px`. mono 500/10 `#b5ad97`, "일"만 `#c2553a`.
4. **캘린더 그리드**: grid 7col `gap:4px 4px; animation:v5Fade .6s ease .1s both`. **앞에 빈 셀 4개**(2026-05-01=금, 월요일 시작 기준). 셀: flex col align-center gap2 `min-height:46px`. 숫자 mono 10px(오늘 fw700 `#c2553a` / 미래 `#d3cbb6` / 일요일 `#c2553a` / 그외 `#b5ad97`). **읽은 날**(미래 아님 & noRead∉{4,11,14,18})엔 표지 25×35 radius3(좌 spine 2px `rgba(0,0,0,.15)`), `background = books[(d*3+5)%10].bg`. **오늘(21일)** 표지에 ring `0 0 0 2px #c2553a`. (범례·완독 점 없음 — 의도적 제거.)
5. **이달 요약**: 헤딩 `margin:13px 2px 8px` 800/14. 3카드 flex gap9, 각 flex1 `background:#fdfbf4;border:1px solid #e9e2cf;border-radius:16px;padding:12px 12px 11px`. 라벨 500/10.5 `#b5ad97`, 값 mono 700/16, 서브 mono 9.5 `#c6bea8`. 값: **최고의 날** 118분 / "5.17 일" · **하루 평균** 1:00 / "읽은 날 기준" · **완독** 2권(값색 `#2c4a3c`) / "이번 달". ("분"·"권" 접미는 Noto 11/600 `#8c8570`.)
6. **주차별 시간**: 헤딩 `margin:16px 2px 8px`. 카드 `background:#fdfbf4;border:1px solid #e9e2cf;border-radius:18px;padding:13px 16px 10px;box-shadow:0 1px 2px rgba(22,20,15,.03)`. 막대행 `height:88px` flex align-end justify-between gap10. 5막대: flex1 col center justify-end gap6. 값 mono 9px. 막대 `width:100%;max-width:30px;flex:none;border-radius:6px;transform-origin:bottom;height:{w.h}px;animation:v5Stack ...`. 라벨 mono 9.5. **데이터** `mw=[190,324,362,288,104]`(분), `h = round(8 + v/362*40)`. **현재 주 = idx3(4주)** → `background:linear-gradient(180deg,#3a5c4b,#26413a)`, 값색 `#2c4a3c`/라벨 `#17150f`/fw700. 그외 → `#d6cba9`, 값 `#c6bea8`/라벨 `#b5ad97`/fw500. 값 텍스트 = `fmtHM(v)`.
7. **이달 많이 읽은 책**: 헤딩 `margin:15px 2px 6px`. **상위 4** `magg=[[book0,372],[book9,228],[book3,150],[book8,125]]`(분), pct=v/372*100. 행 스타일은 주간 랭킹과 동일.
8. **연속 / 시간대 카드 행**: `margin:14px 2px 6px`, 주간과 동일 구성/데이터(streak, 시간대 히스토그램).

> **밀도 지침**: 월간은 스크롤 최소화를 위해 촘촘하게 — 위 셀 min-height 46, 캘린더 행간 4px, 섹션 간 여백 13~16px 값을 반드시 지킬 것.

---

## 5. 지도 탭
### 5.1 투영 / 뷰 (목업 로직 — 실제 SDK로 대체하되 규칙 유지)
- `proj(lat,lng) = { x:(lng+180)/360*1000, y:(90-lat)/180*500 }` (1000×500 월드, 등장방형).
- 월드 레이어 `position:absolute;top:0;left:0;width:1000px;height:500px;transform-origin:0 0;transform:translate(tx,ty) scale(scale)`.
- **기본 뷰**: `scale 0.46, tx -88, ty 258`. 줌 clamp `0.34 – 4.2`.
- 그래티큘(격자): 가로선 y=83,167,250,333,417 / 세로선 x=125,250,375,500,625,750,875, stroke `skin.grat` 1px.
- 대륙: `<ellipse>` 다수, fill `skin.land` stroke `skin.landStroke` 1.5. **플레이스홀더 — 실제 지도로 교체.**
- 배경(ocean): `skin.ocean`.

### 5.2 팬 / 줌
- 팬: pointerdown에서 시작점·tx/ty 캡처(`setPointerCapture`), pointermove에서 `tx=start.tx+dx, ty=start.ty+dy`. 이동량 5px 초과 시 `_moved=true`. pointerup에서 캡처 해제 + **60ms 뒤** `_moved=false`(탭 오인 방지). 컨테이너 `touch-action:none; cursor:grab`.
- 줌 버튼: 뷰포트 중심 `vp={cx:195, cy:373}` 기준. `zoomIn` factor 1.6, `zoomOut` 1/1.6. `zoomAround(cx,cy,f)`: `ns=clamp(scale*f,.34,4.2); tx=cx-(cx-tx)*(ns/scale); ty=cy-(cy-ty)*(ns/scale)`.
- 리셋: `scale .46, tx -88, ty 258`.

### 5.3 클러스터링
- 각 place를 화면 좌표로: `sx=x*scale+tx, sy=y*scale+ty`.
- **체인(BFS) 클러스터**, 임계 `TH=52px`(화면 거리). 서로 52px 이내면 같은 그룹(연쇄 병합).
- 그룹 마커 위치 = 그룹 구성원 화면좌표의 **평균(centroid)**, round.

### 5.4 마커(핀) — 핵심 컴포넌트
- 컨테이너: `<button>` `position:absolute;left:{left}px;top:{top}px;transform:translate(-50%,-100%);animation:rtPinDrop .4s cubic-bezier(.2,1.2,.4,1) both;z-index:{z}`. **꼬리 끝(하단)이 좌표 앵커.**
- **바닥 그림자**: `position:absolute;left:50%;bottom:-3px;transform:translateX(-50%);width:{shadowW}px;height:6px;border-radius:50%;background:rgba(30,22,12,.22);filter:blur(1.5px)`. `shadowW = round((w+6)*0.72)`.
- **프레임**(흰 폴라로이드): `padding:3px;border-radius:7px;background:{frame};outline:{frameLine};box-shadow:{shadow};animation:{glow}`.
- **표지**(프레임 안): `width:{w}px;height:{hpx}px;border-radius:4px;overflow:hidden;background:{book.bg}`. 좌 spine 2px `rgba(0,0,0,.18)`. 제목 `position:absolute;inset:0;flex center;font-weight:900;font-size:8px;line-height:1.05;padding:2px;color:{book.tc}` = `book.short || book.title`.
- **배지**(distinct 책 ≥2): `position:absolute;right:-8px;top:-8px;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:#c2553a;border:2px solid {frame};box-shadow:0 3px 7px -1px rgba(0,0,0,.42);z-index:5`. 숫자 mono 700/10.5 `#fff` = **distinct 책 권수**.
- **꼬리**(삼각형): `width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid {frame};margin-top:-1px;filter:drop-shadow(0 2px 1.5px rgba(30,22,12,.22))`.
- **라벨**: `position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:3px;` mono 600/9.5 `color:{skin.label};background:{skin.labelBg};padding:1px 5px;border-radius:5px;white-space:nowrap`.
- **마커 파생값**:
  - `rep`(대표 표지) = 그룹 세션 중 **iso 날짜 최신** 세션의 책. cover.title = `book.short||book.title`.
  - `count` = 그룹 내 distinct 책 수, `showBadge = count>1`.
  - `label` = 클러스터면 `dom.name + " 외 " + (그룹 place수-1)`(dom = 그룹에서 **누적 분 최대** place), 단일이면 place.name.
  - `w×hpx` = 클러스터 36×50 / 단일 32×44.
  - `frame,frameLine` = skin. `glow` = (야간 & 클러스터)면 `rtGlow 3.2s ease-in-out infinite` else none. `z` = 클러스터 20 else 10.
  - **스택(겹친 표지)** — distinct≥2면 대표 표지 뒤에 2·3번째 책 표지가 회전·오프셋된 폴라로이드 카드로 겹쳐 보임("여러 권"임을 탭 전 전달). `hasStack`=distinct>1→`s1bg`(레이어1 `rotate(7deg) translate(5px,3px)`), `hasS2`=distinct>2→`s2bg`(레이어2 `rotate(-7deg) translate(-5px,4px)`), 둘 다 `z-index:0`(앞 프레임 z-index:1). → `screens/1-map-stacked-pins.png`.

### 5.5 오버레이 요소
- **통계 칩**(좌상단): `position:absolute;top:12px;left:14px;` inline-flex gap8 `padding:7px 12px;border-radius:99px;background:{skin.chipBg};border:1px solid {skin.chipBorder};box-shadow:0 4px 12px -6px rgba(0,0,0,.3)`. 핀 SVG(stroke `skin.chipIcon`) + "13개 도시 · 5개 대륙" mono 600/11 `skin.chipText`. (표시용 상수 — 실제앱은 집계값.)
- **줌 컨트롤**(우하단): `right:14px;bottom:24px;` col gap8. 3버튼 38×38 radius12 `background:{skin.ctrlBg};border:1px solid {skin.ctrlBorder};box-shadow:0 6px 14px -6px rgba(0,0,0,.4)`. 아이콘 stroke `skin.ctrlIcon`: ＋(`M12 5v14M5 12h14`) / －(`M5 12h14`) / 리셋 컴퍼스(원+십자).

### 5.6 탭 규칙 (⚠ 정확히 이 분기)
1. 드래그였던 pointerup(`_moved`) → **탭 무시**.
2. 마커 탭: **클러스터** → `fitOrSheet(members)`. **단일** → `openTarget([placeId])`.
3. `fitOrSheet(ids)`: place들의 월드 바운딩박스 → `raw = min(320/bw, 300/bh)`(bw,bh 최소 4). **raw>5.6**(너무 붙어 분리 불가)이면 → `openTarget(ids)`. 아니면 **줌 투 핏**: `ns=clamp(max(raw, scale*1.5), .46, 5.6); tx=195-cx*ns; ty=360-cy*ns`(cx,cy=박스 중심).
4. `openTarget(ids)`: ids 전체의 **distinct 책 수**. **1권 → `openBook(bookId)`(책 상세 직행)**. **2권 이상 → `openSheet(ids)`(장소 시트)**.
5. `openSheet(ids)`: place를 세션수 내림차순 정렬, `name`=대표 place명, `sub`= 단일이면 place.sub, 복수면 `"{국가} · {N}개 지역"`.

즉 사용자 관점: **위치에 책 1권이면 탭→책 상세 / 여러 권이면 탭→시트로 펼침 / 시트에서 표지 탭→그 책 상세.** 지리적으로 겹친 클러스터는 먼저 확대되고, 더 못 나뉘면 위 규칙(1권 상세 / 여러 권 시트)으로 진입.

---

## 6. 장소 시트 (Place Sheet)
- 딤 `position:absolute;inset:0;z-index:70;background:rgba(23,18,12,.42)`(탭 시 닫힘).
- 카드 `left:0;right:0;bottom:0;z-index:71;background:#faf7ee;border-radius:26px 26px 0 0;padding:12px 24px 30px;box-shadow:0 -20px 48px -14px rgba(20,16,10,.4);animation:v8Up .5s cubic-bezier(.2,.9,.3,1) both;max-height:78%;overflow-y:auto`.
- 그래버 40×4 radius99 `#e2dccb` (mt/mb 14, 중앙).
- 헤더: 40×40 radius12 `#e9efe6` 핀아이콘(stroke `#2c4a3c`) + [name 900/20 ls-.02 `#17150f`, sub 500/12 `#8c8570`] + 닫기버튼 32×32 radius9 `#ece7d8`(× path `M6 6l12 12M18 6L6 18` stroke `#8c8570`).
- **스탯 3칸**(mt16 flex gap9): 각 flex1 `#fdfbf4` border radius14 padding11px12. ① statBooks mono 700/17 + "권"(11 `#8c8570`) / 라벨 "여기서 읽은 책". ② statTime mono 700/17 / "누적 시간". ③ period mono 700/13(padding-top3) / "기간". 라벨 500/10.5 `#b5ad97`.
- "여기서 읽은 책" 헤딩 800/13 `margin:18px 0 10px`.
- **표지 그리드**: flex wrap `gap:14px 12px`, **`max-height:300px;overflow-y:auto`(스크롤 캡 — 책이 많아도 시트 높이가 일정 이상 커지지 않고 표지 영역만 내부 스크롤)**. 각 표지 = **`<button>`**(`width:66px;text-align:left;background:none;border:0;padding:0;cursor:pointer`, `style-active`/press: `transform:scale(.96)`). 표지 66×95 radius5(좌 spine 3px, 제목 900/12 중앙). **밀리** 세션 책이면 좌하단 태그(mono 6.5 `#fff` `background:rgba(184,134,46,.9)` padding1px3 radius3 "밀리"). 아래 제목 600/11 ellipsis, 시간 mono 10 `#8c8570`. **탭 → `openBook(bookId)`**.
- **표지 등장 애니(펼침)**: 시트가 열리면 각 표지 버튼이 `animation:{cv.anim}`으로 좌→우 순차 팝인(겹쳐 있던 책들이 펼쳐지는 느낌). → `screens/2-place-sheet.png`.
- **시트 데이터**: `covers` = ids 전체 세션을 책별 합산, **분 내림차순**. `time = fmtKorMin(합)`. `statBooks`=책 수, `statTime=fmtHM(총분)`, `period` = 세션 1개면 그 날짜, 여러 개면 `"{최소 shortDate} – {최대 shortDate}"`.

---

## 7. 책 상세 (Book Detail Sheet) — 신규
- 딤 `z-index:81;background:rgba(23,18,12,.46)`. 카드 `z-index:82;background:#f6f3ea;border-radius:26px 26px 0 0;padding:12px 22px 30px;box-shadow:0 -22px 50px -14px rgba(20,16,10,.45);animation:v8Up .5s ...;max-height:92%;overflow-y:auto`. **장소 시트 위에 겹쳐 열림**(시트에서 진입 시 닫으면 시트로 복귀; 지도 단일책에서 진입 시 닫으면 지도로 복귀).
- 그래버 40×4 `#e2dccb`.
- **헤더**: 표지 72×104 radius5(좌 spine 3px, 제목 900/13 중앙 `book.tc`) `box-shadow:0 10px 20px -7px rgba(58,44,28,.45)` + [태그 칩 + 제목 + 저자] + 닫기 32×32 `#ece7d8`.
  - **태그 칩**: 700/10 `padding:3px 8px;border-radius:99px`. 밀리 책 → `color:#b8862e;background:#f6ecd6` "밀리의서재". 아니면 → `color:#2c4a3c;background:#e9efe6` "직접 기록".
  - 제목 900/20 ls-.02 `#17150f`. 저자 500/13 `#8c8570`.
- **스탯 3칸**(mt16 flex gap9, 카드 스타일 = 장소 시트와 동일): ① 총 시간 `fmtHM` mono 700/17. ② 세션 `n회`(회 = 11 `#8c8570`). ③ 읽은 곳 `n곳`. 라벨 500/10.5 `#b5ad97`.
- **읽은 곳** 헤딩 800/13 `margin:18px 0 9px`. 칩들 flex wrap gap7: pill `background:#fff;border:1px solid #e9e2cf;padding:4px 10px;border-radius:99px` 핀SVG(stroke `#2c4a3c`) + place명 600/11 `#6f6752`.
- **읽은 기록** 헤딩 800/13 `margin:18px 0 4px`. 세션 행: flex align-center gap10 `padding:11px 2px;border-bottom:1px solid #ece5d2`. date mono 600/12 `#17150f` min-width38 · place(핀SVG stroke `#b5ad97` + 500/12 `#8c8570`) · dur(margin-left auto) mono 600/12 `#2c4a3c`.
- **책 상세 데이터**: 해당 책의 **모든 place 세션 집계**(위치 무관, 전체). `sessions` iso 내림차순. `statTime=fmtHM(총분)`, `statSessions=세션수`, `statPlaces=distinct place수`, `places=중복 제거 place명`, `dur=fmtKorMin`.

---

## 8. 애니메이션 (keyframes 정의)
- `v4Blink` — opacity 1↔.25 (연속 마지막 점).
- `v5Stack` — scaleY .001→1.06→1, .55s (막대 자라남).
- `v5Sweep` — scaleX .001→1 (랭킹 진행바).
- `v5Fade` — opacity+translateY(8→0) (캘린더 등장).
- `v6Breath` — opacity .45↔1, 3s (시간대 피크).
- `v7TipPop` — scale .55→1 + translateX(-50%) (주간 팝오버).
- `v8Up` — translateY(46→0)+opacity, .5s (모든 하단 시트).
- `rtPinDrop` — translate(-50%,-118%)scale.4 → (-50%,-100%)scale1, .4s (핀 드롭인).
- `v5Pop` — scale .6→1.1→1: **장소 시트 표지들의 순차 펼침**(각 표지 `animation-delay = index×0.05s`) — 겹쳤던 책들이 '펼쳐지는' 연출. `cv.anim = "v5Pop .42s cubic-bezier(.2,1.2,.4,1) {i*0.05}s both"`.
- `rtGlow` — 골드 글로우(야간 클러스터 전용). `rtDash` — stroke-dashoffset(루트 점선). `v6Spin`/`v4Float` — 정의돼 있으나 미사용.
> 실제 앱에선 대응 네이티브 트랜지션으로 구현(값·의도 유지).

---

## 9. State
- `tab`: `'week'|'month'|'map'` (초기 = prop `initialTab`, 기본 `'map'`).
- `day`: 주간 선택 요일 인덱스(0=월 … 6=일, 기본 3=목).
- 지도 뷰: `scale, tx, ty`.
- `open`: 장소 시트 `{ids, name, sub}` 또는 `null`.
- `book`: 책 상세 `{id}` 또는 `null`.
- `_pan, _moved`: 팬/탭 제어 플래그.
- **파트너 모드**: 보는 대상(본인/파트너). 홈에서 진입, 동일 컴포넌트에 상대 데이터셋.

## 10. Props (tweak)
- `mapStyle`: `'paper'|'night'|'route'` (기본 `paper` — **확정**). night/route는 대안 스타일(스킨 아래).
- `initialTab`: `'week'|'month'|'map'` (기본 `map`).
- `streak`: int (기본 23).

---

## 11. Design Tokens
**Colors** — 배경/표면: 화면 `#f6f3ea`, 카드 `#fdfbf4`, 시트 `#faf7ee`, 카드보더 `#e9e2cf`, 구분선 `#e8e1cd`, 세그/back칩/닫기 `#ece7d8`, 트랙 `#ece5d2`, 그래버 `#e2dccb`. 잉크 본문 `#17150f`, 아이콘 `#3f3a2d`. 초록 `#2c4a3c`, 그라데이션 `#3a5c4b→#26413a`, 연초록 `#e9efe6`. 테라코타 `#c2553a`. muted `#8c8570 / #b5ad97 / #9a927d / #c6bea8 / #6f6752`. 골드(밀리) `#b8862e`, bg `#f6ecd6`. 막대 idle `#d6cba9 / #c9be9c`. 상태바 텍스트 `#141413`.

**Typography** — 한글/UI `Noto Sans KR`(400–900). 숫자/날짜/시간 `IBM Plex Mono`(400–700, tabular-nums). 시계만 Poppins 600. 스케일: 화면타이틀 800/17 · 대형숫자 900/26(ls-.04) · 섹션헤딩 800/13~14 · 카드스탯 700/16~21 mono · 본문/라벨 500~700/11~13 · 마이크로 9~10.5.

**Radius**: 카드 14/16/18/20, pill 99, 표지 3/4/5, 핀프레임 7, 컨트롤 9/12, 시트 top 26. **Shadow**: 카드 `0 1px 2px rgba(22,20,15,.03)`, 핀 `0 9px 16px -7px rgba(40,30,15,.5)`, 장소시트 `0 -20px 48px -14px rgba(20,16,10,.4)`, 책상세 `0 -22px 50px -14px rgba(20,16,10,.45)`. **Spacing**: 주/월 좌우 패딩 22, 지도 전면.

**지도 스킨(3종)**
- **paper**(기본): ocean `radial-gradient(130% 100% at 28% 18%, #eef1ee 0%, #e5eae8 52%, #dce2df 100%)`, land `#dccfb4`, landStroke `rgba(120,105,72,.22)`, grat `rgba(120,105,72,.08)`, label `#6f6752`, labelBg `rgba(255,255,255,.72)`, pinFrame `#fdfbf4`, pinFrameLine `1px solid rgba(120,105,72,.16)`, chipBg `rgba(255,255,255,.86)`, chipBorder `#e5dfcd`, chipIcon/route `#3a5c4b`, chipText `#6f6752`, ctrlBg `rgba(255,255,255,.92)`, ctrlBorder `#e5dfcd`, ctrlIcon `#6f6752`, 마커shadow `0 9px 16px -7px rgba(40,30,15,.5)`.
- **night**: ocean `linear-gradient(175deg,#15211a,#0e1712 52%,#0a100c)`, land `rgba(226,207,158,.07)`, landStroke `rgba(226,207,158,.16)`, route/pinDot `#e2cf9e`, label `#cdbd93`, labelBg `rgba(255,255,255,.05)`, pinFrame `#26332b`, pinFrameLine `1px solid rgba(226,207,158,.32)`, chipBg `rgba(20,30,24,.72)`, chipText `#d7d0bb`, ctrlBg `rgba(22,32,26,.82)`, ctrlIcon `#d7d0bb`, 마커shadow `0 10px 20px -8px rgba(0,0,0,.7)`. (클러스터 핀 `rtGlow`.)
- **route**: ocean `#e8ecec`, land `#ded3bc`, route/chipIcon/pinDot `#c2553a`, pinFrame `#fdfbf4`, 그 외 paper와 유사. + 읽은 순서대로 도시를 잇는 점선 폴리라인(stroke `skin.route`, `stroke-dasharray:1 9`, `animation:rtDash`, `vector-effect:non-scaling-stroke`, width 2.4).

---

## 12. 데모 데이터 (시안과 동일 화면을 위해 그대로 사용)
> 실제 앱에선 실데이터로 대체. 목업 화면을 1:1 재현하려면 아래 값 사용.

**books[10]** `{title, short(핀·캘린더용 축약, \n=줄바꿈), author, bg, tc(표지 글자색), dot(강조색), millie?}`:
0 몰입/몰입/황농문 · 1 돈의 심리학/"돈의\n심리학"/모건 하우절 · 2 도둑맞은 집중력/집중력/요한 하리/**millie** · 3 작별하지 않는다/작별/한강 · 4 파친코/파친코/이민진 · 5 미드나잇 라이브러리/"미드\n나잇"/매트 헤이그 · 6 1984/1984/조지 오웰 · 7 페스트/페스트/알베르 카뮈 · 8 노르웨이의 숲/"노르\n웨이"/무라카미 하루키 · 9 사피엔스/"사피\n엔스"/유발 하라리. (색상 hex는 목업 `books` 배열 참조.)

**places[13]** `{id, name, sub, lat, lng, s:[[bookIdx, minutes, isoDate, shortDate], …]}`:
- seoul 서울/"대한민국 · 홈"/37.5,127.0 → [0,180,6.20][0,150,6.08][1,120,5.14][3,96,5.09][9,88,6.16][2,64,5.24][6,54,4.30]
- jeju 제주/대한민국/33.5,126.5 → [8,72,5.30][8,40,5.31]
- tokyo 도쿄/일본/35.7,139.7 → [4,88,6.05][8,52,6.04][4,36,6.06]
- hongkong 홍콩/홍콩/22.3,114.2 → [6,66,4.18]
- bangkok 방콕/태국/13.8,100.5 → [7,58,3.22]
- singapore 싱가포르/싱가포르/1.35,103.8 → [9,74,2.11]
- dubai 두바이/아랍에미리트/25.2,55.3 → [5,84,6.12][9,40,6.11]
- paris 파리/프랑스/48.9,2.35 → [7,90,5.16][3,60,5.15]
- london 런던/영국/51.5,-0.13 → [5,70,5.09][6,44,5.08]
- rome 로마/이탈리아/41.9,12.5 → [9,52,5.02]
- ny 뉴욕/미국/40.7,-74.0 → [4,96,6.24][2,48,6.23]
- la LA/미국/34.05,-118.24 → [5,60,1.20]
- sydney 시드니/호주/-33.87,151.21 → [8,55,3.05]

**week[7]** `{lbl, min, sun, today, sp:[[bookIdx,min]…]}` (합 446=7:26, today=목):
월 52[[0,52]] · 화 74[[0,40][9,34]] · 수 43[[1,43]] · 목 96(today)[[0,60][1,36]] · 금 63[[3,63]] · 토 34[[2,34]] · 일 84(sun)[[0,50][9,34]].

**월간 상수**: 총 21:08(1268분), 17/21일, 최고의날 118분(5.17), 하루평균 1:00, 완독 2권. 캘린더: today=21, noRead={4,11,14,18}, 앞 빈칸 4. 주차별 mw=[190,324,362,288,104], 현재=4주. 이달랭킹 magg=[[0,372],[9,228],[3,150],[8,125],[1,100]](상위4 표시).

---

## 13. Data Model (백엔드 핵심 변경)
ReadingSession에 위치 추가: `latitude, longitude, placeId, placeName, country`. 세션 소스(직접/탭/**밀리 동기화**) 구분은 유지하되 **UI에 "동기화" 문구·아이콘 노출 안 함**(요청).
집계: 장소별(책별 합산분·distinct수·최신세션·기간), 책별(전체 세션·장소·총시간).
> ⚠ 초기 스펙은 "읽은 장소"를 **의도적으로 제외**했으나, 오너 결정으로 **철회하고 도입**. 위치 권한 배관(Info.plist·백그라운드 모드)은 앱에 이미 존재.

## 14. Assets
- 아이콘: 전부 인라인 SVG(뒤로/핀/줌±/리셋/닫기/밀리). 앱 아이콘셋으로 대체 가능(path는 목업 참조).
- 책 표지: 목업은 색+제목 플레이스홀더 → 실제 표지 이미지.
- 지도: 손그림 대륙 → 지도 SDK.
- 폰트: Noto Sans KR, IBM Plex Mono(Google Fonts) → 앱 번들.

## 15. Files
- `mockups/RTRecord.dc.html` — **메인 목업(동작)**. 3탭 + 장소 시트 + **책 상세** + 지도 엔진. 하단 `class Component`에 전 로직(투영·팬/줌·클러스터·집계·상태·시트/상세 분기). 브라우저로 열면 실제 동작.
- `mockups/리딩타임 기록 개선.dc.html` — paper 기준 3탭 나열 프레젠테이션.
- `mockups/support.js` — 목업 런타임(이식 대상 아님).
- `screens/` — 상태별 참고 스크린샷: `1-map-stacked-pins`(다중 책=겹친 스택 핀+배지), `2-place-sheet`(여러 권 펼침), `3-book-detail`(책 상세), `4-week`, `5-month`. 동작·애니는 `mockups/RTRecord.dc.html`을 직접 열어 확인.

## 16. 구현 시 결정(목업 미확정)
- 지도 SDK 선택(MapKit vs Google) 및 클러스터/줌 파라미터 실측 튜닝.
- 위치 획득 시점(앱 실행 1회 vs 세션 시작)과 프라이버시.
- 세션 행 탭 시 편집/삭제 등 세부 동작, 핀/시트 press 피드백.
- 파트너 모드 데이터 접근/동기화 방식.
