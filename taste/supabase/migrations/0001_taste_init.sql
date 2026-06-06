-- taste 초기 스키마. Project: geo-apps 공유 → prefix taste_. 개인 격리(partner 없음).
-- Wave 1: ratings 중심. recommendations 는 Wave 2 엔진까지 미사용(갈래 차원은 0002에서 추가).

create table if not exists taste_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists taste_ratings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  media_type text not null check (media_type in ('movie','book')),
  title text not null,
  year int,
  external_id text,                 -- TMDB id(영화) / ISBN13(책)
  rating numeric(2,1) not null check (rating >= 0.5 and rating <= 5.0),
  source text not null check (source in ('watcha','app')),
  rated_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, media_type, title, year)
);
create index if not exists taste_ratings_owner_updated on taste_ratings (owner_id, updated_at);

create table if not exists taste_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  media_type text not null check (media_type in ('movie','book')),
  title text not null,
  year int,
  external_id text,
  reason text not null,
  poster_url text,
  batch_id text not null,
  generated_at timestamptz not null default now()
);
create index if not exists taste_reco_owner_batch on taste_recommendations (owner_id, batch_id);

alter table taste_profiles enable row level security;
alter table taste_ratings enable row level security;
alter table taste_recommendations enable row level security;

create policy taste_profiles_own on taste_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy taste_ratings_own on taste_ratings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy taste_reco_own on taste_recommendations
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter publication supabase_realtime add table taste_ratings;
