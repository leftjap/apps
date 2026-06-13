/* mock.js — 데모 모드 목업 (작업지시서 v9 정보 재설계 시안 = 2026-06-13 토 스냅샷).
   장면: 운동 완료(07:40) · 어학 due(복습 대기) · 글쓰기·독서 대기.
   shape 는 adapter.buildRealApps 산출과 동일 (직전/이번 주/추세 슬롯 · beat 배열 · pace · statRecords).
   독서는 실데이터(book_reading_seconds) 제약대로 제목·진도% 없음 — hook=직전 읽은 시점, slot3=이번 달.
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
    hook: { title: '어제', strong: '18분', tail: ' 읽었어요' },
    hookDone: { title: '오늘', strong: '18분', tail: ' 읽었어요' },
    sub: '2일 연속이에요', cta: '이어 읽기',
    cal: mockCal([0, 25, 0, 31, 22, 0, 40, 0, 33, 0, 28, 18, 0]), calUnit: '분',
    records: [
      { lb: '직전 읽기', v: '18분', note: '어제' },
      { lb: '이번 주', goal: { cur: 3, max: 5, unit: '일', proposed: true }, note: '지난주 4일' },
      { lb: '이번 달', v: '3시간', note: '지난달 9시간' },
    ],
    beat: ['오늘 10분이면 ', '이번 주 4일째', ' — 지난주는 4일이었어요'],
    weekly8: [4, 5, 6, 4, 5, 3, 5, 3], total: '올해 38시간 · 41일',
    pace: { now: '올해 평균 주 3.9일', goal: '제안 주 5일', proposed: true },
    statRecords: [{ lb: '최장 연속', v: '11일' }, { lb: '하루 최고', v: '52분' }, { lb: '올해 읽은 날', v: '41일' }],
  },
  {
    id: 'write', name: '글쓰기', url: 'https://leftjap.github.io/apps/today/',
    done: false, usualMin: 19.65 * 60, atMin: null, tlMeta: null,
    hook: { title: '오늘의 네비 「정치는 인물」', strong: '6.5매', tail: '까지 썼어요' },
    sub: '마지막으로 쓴 날은 6월 4일이에요', subGap: true, cta: '이어 쓰기',
    cal: mockCal([0, 3.2, 2.2, 6.5, 0, 0, 0, 0, 0, 0, 0, 0, 0]), calUnit: '매',
    records: [
      { lb: '직전 글', v: '6.5매', note: '오늘의 네비 · 6월 4일' },
      { lb: '이번 주', goal: { cur: 0, max: 3, unit: '편', proposed: true }, note: '지난주 2편' },
      { lb: '이번 달', v: '12매', note: '지난달 38.4매' },
    ],
    beat: ['오늘 1매면 ', '이번 달 13매째', ' — 지난달은 38매였어요'],
    weekly8: [3, 4, 5, 2, 4, 3, 2, 0], total: '올해 85편 · 495매',
    pace: { now: '올해 평균 주 1.9편', goal: '제안 주 3편', proposed: true },
    statRecords: [{ lb: '올해 편수', v: '85편' }, { lb: '올해 매수', v: '495매' }, { lb: '편당 평균', v: '5.8매' }],
  },
  {
    id: 'lang', name: '어학', url: 'https://leftjap.github.io/apps/study/',
    done: false, usualMin: 19 * 60, atMin: null, tlMeta: null,
    hook: { title: '「구덩이 약속」', strong: '5월 18일', tail: '이 마지막이에요' },
    sub: '복습할 문장 12개가 오늘 만료돼요', subStrong: true, cta: '오늘 분량 시작',
    cal: mockCal([0, 0, 30, 0, 45, 250, 0, 20, 0, 39, 33, 0, 0]), calUnit: '분',
    records: [
      { lb: '직전 발화', v: '9문장', note: '5월 18일 · 신규 6' },
      { lb: '이번 주', goal: { cur: 3, max: 4, unit: '일', proposed: true }, note: '지난주 2일' },
      { lb: '이번 달 익힘', v: '+48문장', note: '지난달 +32' },
    ],
    beat: ['오늘 5문장이면 ', '이번 주 4일째', ' — 복습 12개도 기다려요'],
    weekly8: [2, 3, 5, 4, 1, 3, 2, 3], total: '올해 21시간 · 발화 1,240문장',
    pace: { now: '올해 평균 주 2.7일', goal: '제안 주 4일', proposed: true },
    statRecords: [{ lb: '올해 발화', v: '1,240문장' }, { lb: '익힌 문장', v: '2,860개' }, { lb: '최장 연속', v: '14일' }],
  },
  {
    id: 'gym', name: '운동', url: null,
    done: true, usualMin: 7.66 * 60, atMin: 7 * 60 + 40, tlMeta: '07:40 · 48분',
    hook: { title: '이번 주', strong: '4회', tail: ' 했어요 — 목표는 주 4일' },
    hookDone: { title: '오늘 07:40 · 가슴·어깨', strong: '48분', tail: '' },
    sub: '이번 주 4회 · 주 4일 목표를 채웠어요', cta: '운동 기록 열기', ctaDone: '오늘 기록 보기',
    cal: mockCal([0, 52, 0, 46, 0, 0, 0, 40, 44, 0, 0, 36, 48]), calUnit: '분',
    records: [
      { lb: '오늘 한 운동', v: '가슴 · 어깨', pr: 1, note: '48분 · 볼륨 6,200kg' },
      { lb: '이번 주', goal: { cur: 4, max: 4, unit: '회', proposed: false }, note: '3주 연속' },
      { lb: '이번 달', v: '14회', note: '지난달 12회' },
    ],
    beat: ['이번 주 4일을 채웠어요', '', ' — 3주 연속이에요'],
    weekly8: [4, 3, 4, 4, 3, 4, 4, 4], total: '올해 86회 · 64시간',
    pace: { now: '올해 평균 주 3.2회', goal: '주 4일 목표', proposed: false },
    statRecords: [{ lb: '올해 횟수', v: '86회' }, { lb: '최고 주 연속', v: '5주' }, { lb: '하루 최고', v: '71분' }],
  },
];
