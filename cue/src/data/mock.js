/* mock.js — 데모 모드 목업 (design-ref/v8/시안-소스/data.js 값 승계, v8 shape).
   장면: 운동 완료(07:12) · 어학 19:00 · 글쓰기 19:39 · 독서 20:09 대기
   — 시안 기본 화면과 동일 (저녁 3개 몰림 → 타임라인 클러스터 묶음 시연, §3.3).
   due 는 목업 고정이 아니라 실제 dueOf(§6)가 시각으로 판정. */
import { startOfToday } from './transforms.js';

function mockCal(vals) {
  const today = startOfToday();
  const dim = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const out = new Array(dim).fill(0);
  for (let i = 0; i < Math.min(today.getDate(), vals.length); i++) out[i] = vals[i];
  return out;
}

export const MOCK_APPS = [
  {
    id: 'read', name: '독서', url: 'https://leftjap.github.io/apps/book/',
    done: false, usualMin: 20.15 * 60, atMin: null, tlMeta: null,
    hook: { title: '어제', strong: '9분', tail: ' 읽었어요' },
    hookDone: { title: '오늘', strong: '9분', tail: ' 읽었어요' },
    sub: '2일 연속이에요', cta: '이어 읽기',
    cal: mockCal([12, 0, 25, 0, 31, 22, 9, 0, 38, 14, 9, 0]), calUnit: '분',
    records: [
      { lb: '최장 연속', v: '11일', note: '지금 2일째예요' },
      { lb: '하루 최고', v: '52분', note: '어제는 9분' },
      { lb: '올해 누적', v: '38시간', note: '41일 읽었어요' },
    ],
    beat: '오늘 읽으면 3일 연속이에요 — 최장 기록은 11일',
    weekly8: [96, 120, 143, 88, 110, 64, 121, 38], total: '올해 38시간',
  },
  {
    id: 'write', name: '글쓰기', url: 'https://leftjap.github.io/apps/today/',
    done: false, usualMin: 19.65 * 60, atMin: null, tlMeta: null,
    hook: { title: '「6월 에세이」 —', strong: '9.2매', tail: '까지 썼어요' },
    sub: '마지막으로 쓴 날은 6월 4일이에요', cta: '이어 쓰기',
    cal: mockCal([0, 3.2, 2.2, 3.6, 0, 0, 0, 0, 0, 0, 0, 0]), calUnit: '매',
    records: [
      { lb: '하루 최고', v: '6.8매', note: '지난번엔 3.6매' },
      { lb: '이번 달', v: '9.2매', note: '5월엔 38.4매' },
      { lb: '올해 누적', v: '412매', note: '18일 썼어요' },
    ],
    beat: '오늘 한 매만 보태도 「6월 에세이」가 다시 자라요',
    weekly8: [10.2, 8.4, 12.4, 6.8, 12.4, 9.2, 0, 0], total: '올해 412매',
  },
  {
    id: 'lang', name: '어학', url: 'https://leftjap.github.io/apps/study/',
    done: false, usualMin: 19 * 60, atMin: null, tlMeta: null,
    hook: { title: '「구덩이 약속 — 핑키 프라미스」 ·', strong: '5월 18일', tail: '이 마지막이에요' },
    sub: '오늘 10분이면 다시 시작할 수 있어요', cta: '오늘 분량 시작',
    cal: mockCal([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), calUnit: '분',
    records: [
      { lb: '최장 연속', v: '14일', note: '오늘 하면 1일째예요' },
      { lb: '하루 최고', v: '35분', note: '5월 18일엔 35분' },
      { lb: '올해 누적', v: '21시간', note: '9일 했어요' },
    ],
    beat: '오늘 10분이면 1일째예요 — 최장 기록은 14일',
    weekly8: [0, 0, 85, 40, 0, 27, 0, 0], total: '올해 21시간',
  },
  {
    id: 'gym', name: '운동', url: null,
    done: true, usualMin: 7.2 * 60, atMin: 7 * 60 + 12, tlMeta: '07:12 · 41분',
    hook: { title: '이번 주', strong: '2회', tail: ' 했어요 — 목표는 주 4일' },
    hookDone: { title: '오늘 07:12 · 상체', strong: '41분', tail: '' },
    sub: '3주 연속으로 주 4일을 지켰어요', cta: '운동 기록 열기', ctaDone: '오늘 기록 보기',
    cal: mockCal([0, 41, 38, 0, 44, 0, 52, 0, 46, 0, 0, 41]), calUnit: '분',
    records: [
      { lb: '주 4일 연속', v: '3주', note: '최고 기록은 5주' },
      { lb: '하루 최고', v: '71분', note: '오늘은 41분' },
      { lb: '올해 운동', v: '86회', note: '모두 64시간' },
    ],
    beat: '이번 주 2번 더 하면 4주 연속이에요 — 최고 기록은 5주',
    weekly8: [4, 3, 4, 4, 3, 4, 2, 2], total: '올해 86회 · 64시간',
  },
];
