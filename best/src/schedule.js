// 수집 스케줄 가드.
// launchd(OS 레벨, 슬립·전원꺼짐 후 깨어날 때 따라잡음)와 Claude 루틴이 둘 다 돌 수 있으므로,
// 오늘 정상 수집이 끝났으면 재수집하지 않는다. 결손(사이트 일부 실패)이면 다시 돈다.

export const SITES = ['dcinside', 'clien', 'todayhumor', 'bobae', 'ruliweb', 'humoruniv', 'theqoo', 'ppomppu', 'slr']

export const kstToday = (now = new Date()) =>
  new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)

export function alreadyCollected(logRows, today) {
  const ok = new Set(logRows.filter((r) => r.run_on === today && r.status === 'ok').map((r) => r.site))
  return SITES.every((s) => ok.has(s))
}
