import { describe, it, expect } from 'vitest'
import { kstToday, alreadyCollected } from './schedule.js'

describe('kstToday — 수집일(KST) 계산', () => {
  it('UTC 자정 직후에도 KST 날짜를 준다', () => {
    expect(kstToday(new Date('2026-07-10T15:30:00Z'))).toBe('2026-07-11') // KST 00:30
    expect(kstToday(new Date('2026-07-10T14:59:00Z'))).toBe('2026-07-10') // KST 23:59
  })
})

describe('alreadyCollected — 오늘 정상 수집이 끝났는지 (launchd × Claude 루틴 중복 방지)', () => {
  const today = '2026-07-11'

  it('오늘 ok 로그가 9개 사이트 전부 있으면 true', () => {
    const rows = ['dcinside', 'clien', 'todayhumor', 'bobae', 'ruliweb', 'humoruniv', 'theqoo', 'ppomppu', 'slr']
      .map((site) => ({ run_on: today, site, status: 'ok' }))
    expect(alreadyCollected(rows, today)).toBe(true)
  })

  it('일부 사이트만 ok 면 false (결손 → 다시 돈다)', () => {
    const rows = [
      { run_on: today, site: 'dcinside', status: 'ok' },
      { run_on: today, site: 'clien', status: 'http_4xx' },
    ]
    expect(alreadyCollected(rows, today)).toBe(false)
  })

  it('어제 로그만 있으면 false', () => {
    const rows = [{ run_on: '2026-07-10', site: 'dcinside', status: 'ok' }]
    expect(alreadyCollected(rows, today)).toBe(false)
  })

  it('로그가 없으면 false', () => {
    expect(alreadyCollected([], today)).toBe(false)
  })
})
