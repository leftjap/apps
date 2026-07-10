// 데이터 접근 (PostgREST)
import { pg } from './supabase.js'
import { periodStart, COMMUNITIES } from './logic.js'

const POST_COLS = 'id,site,board,title,url,views,comments,posted_at,percentile,collected_on'

// 최신 수집 실행 (푸터 "오늘 HH:MM 수집" + 기간 기준일)
export async function fetchLatestRun() {
  const { data, error } = await pg
    .from('best_ingest_log')
    .select('run_on,created_at')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}

export async function fetchPosts({ period, latest, sites, offset = 0, limit = 100 }) {
  let q = pg
    .from('best_posts')
    .select(POST_COLS, { count: 'exact' })
    .eq('is_ad', false)
    .gte('posted_at', periodStart(period, latest))
    .order('percentile', { ascending: false, nullsFirst: false })
    .order('views', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)
  if (sites?.length) q = q.in('site', sites)
  const { data, count, error } = await q
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

// 커뮤니티별 글 수 (사이드바) — 사이트별 head count.
// 행을 받아 세면 PostgREST 기본 1000행 상한에 잘린다 (2026-07-11 실측: 6개 커뮤가 0으로 표시).
export async function fetchSiteCounts({ period, latest, sites }) {
  const from = periodStart(period, latest)
  const entries = await Promise.all(
    sites.map(async (site) => {
      const { count, error } = await pg
        .from('best_posts')
        .select('id', { count: 'exact', head: true })
        .eq('is_ad', false)
        .eq('site', site)
        .gte('posted_at', from)
      if (error) throw error
      return [site, count ?? 0]
    }),
  )
  return Object.fromEntries(entries)
}

export async function searchPosts({ plan, limit = 100 }) {
  const safe = plan.text.replace(/[,()%_*]/g, ' ').trim()
  let q = pg
    .from('best_posts')
    .select(POST_COLS)
    .eq('is_ad', false)
    // 수집 범위 축소(16곳→9곳) 전 데이터가 DB 에 남아 있어 화이트리스트 필수 (2026-07-11)
    .in('site', COMMUNITIES.map((c) => c.site))
    .order('percentile', { ascending: false, nullsFirst: false })
    .limit(limit)
  const ors = []
  if (safe) ors.push(`title.ilike.*${safe}*`, `board.ilike.*${safe}*`)
  if (plan.sites.length) ors.push(`site.in.(${plan.sites.join(',')})`)
  if (plan.boards.length) ors.push(`board.in.(${plan.boards.join(',')})`)
  if (!ors.length) return []
  q = q.or(ors.join(','))
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// 사용자 상태 (읽음·저장)
export async function fetchUserState() {
  const { data, error } = await pg.from('best_user_state').select('post_id,saved,saved_at,read_at')
  if (error) throw error
  return new Map((data ?? []).map((r) => [r.post_id, r]))
}

export async function upsertState(userId, postId, patch) {
  const { error } = await pg
    .from('best_user_state')
    .upsert({ user_id: userId, post_id: postId, ...patch }, { onConflict: 'user_id,post_id' })
  if (error) throw error
}

export async function fetchSaved() {
  const { data, error } = await pg
    .from('best_user_state')
    .select(`saved_at,read_at,best_posts(${POST_COLS})`)
    .eq('saved', true)
  if (error) throw error
  return (data ?? [])
    .filter((r) => r.best_posts)
    .map((r) => ({ ...r.best_posts, saved_at: r.saved_at, read_at: r.read_at }))
}
