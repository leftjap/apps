-- taste 0002 — recommendations 갈래(branch) 차원 + 홈 근거 + realtime.
-- 0001 의 recommendations 는 홈 추천만 담을 수 있었음(kind 없음). Wave 2 엔진은:
--   kind=home   (다음에 볼/읽을)  + basis (근거 평가작 식별자[])
--   kind=branch (작품별 갈래)     + source_work (갈래 출발 작품 식별자)
-- 전부 additive (ADD COLUMN ... default) → 비파괴. 재실행 안전(IF NOT EXISTS).

alter table taste_recommendations
  add column if not exists kind text not null default 'home' check (kind in ('home','branch'));
alter table taste_recommendations
  add column if not exists source_work text;            -- 갈래 출발 작품 식별자(title|year 또는 id). 외부 FK 아님.
alter table taste_recommendations
  add column if not exists basis jsonb not null default '[]'::jsonb;  -- 홈 추천 근거 평가작 식별자[]

create index if not exists taste_reco_owner_kind on taste_recommendations (owner_id, kind, source_work);

-- §7 라이브 도착(별점 변경 → 분석 중 → 새 batch 교체)용 realtime. 이미 등록돼 있으면 무시.
do $$
begin
  alter publication supabase_realtime add table taste_recommendations;
exception when others then null;
end $$;
