-- best 수집 파이프라인 스키마 (spec §2)
create table best_posts (
  id           bigint generated always as identity primary key,
  collected_on date not null,
  source       text not null,              -- 'issuelink' | 'dcbest' | 'bobae'
  site         text not null,              -- 커뮤니티 슬러그 (dcinside, bobae, ruliweb, ...)
  board        text,                       -- 원본 판 (판별 가능 시)
  post_key     text not null,              -- 원문 식별자 (네임스페이스 포함: freeb:3418774, best:1008318, goId)
  title        text not null,
  url          text not null,
  views        int,
  comments     int,
  posted_at    timestamptz,
  percentile   numeric,                    -- 사이트 수집 풀 내 조회수 백분위
  is_ad        boolean not null default false,
  unique (site, post_key)
);

create index best_posts_collected_on on best_posts (collected_on);
create index best_posts_site on best_posts (site, collected_on);

create table best_ingest_log (
  id       bigint generated always as identity primary key,
  run_on   date not null,
  source   text not null,
  site     text not null,
  pages    int not null default 0,
  rows     int not null default 0,
  status   text not null,                  -- 'ok' | 'http_4xx' | 'parse_zero' | 'error'
  detail   text
);

create index best_ingest_log_run_on on best_ingest_log (run_on);

-- 개인용 서버사이드 수집 (service_role 전용). 클라이언트 접근은 spec 3(리더 앱)에서 RLS 정책과 함께 설계.
alter table best_posts enable row level security;
alter table best_ingest_log enable row level security;
