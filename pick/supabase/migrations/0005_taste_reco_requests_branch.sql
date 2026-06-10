-- taste 0005 — 추천 요청 큐에 갈래(branch) 차원 추가.
-- 버튼/평가 = 홈 재생성(kind 기본 home), 상세페이지 = 작품별 갈래(kind=branch + source_work).
-- source_work = 갈래 출발 작품 식별자 "<title>|<year>" (taste-reco.md §2.4 와 동일 키).
-- additive·비파괴. 재실행 안전.

alter table taste_reco_requests
  add column if not exists kind text not null default 'home' check (kind in ('home','branch'));
alter table taste_reco_requests
  add column if not exists source_work text;   -- branch 요청의 출발 작품. home 이면 null.

create index if not exists taste_reco_requests_kind on taste_reco_requests (owner_id, kind, source_work);

-- source 는 정보용 라벨(button/rating/detail/backfill …) → 0004 의 값 제약 제거(확장성).
alter table taste_reco_requests drop constraint if exists taste_reco_requests_source_check;
