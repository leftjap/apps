/* data-l.jsx — 런처 (springboard)
   데이터 모델: 데몬이 각 앱 수치를 동기화 → 런처는 그 "양"을 반영(체크 아님).
   운동=시간(분) · 어학=문장수 · 글쓰기=원고지 매수 · 독서=독서시간(분)
   색: DESIGN.md — 히트맵 농담은 웜그레이(양), Crail은 점 단위 액센트만. */

const SENTENCES = [
  { text: "오늘 하지 않았다면 내일도 하지 않는다. 그냥 한다.", hi: "그냥 한다" },
  { text: "내가 매일 하는 일이 가끔 하는 일보다 더 중요하다.", hi: "매일 하는 일" },
  { text: "걱정이 시작되면 뭐라도 한다.", hi: "뭐라도 한다" },
  { text: "행동이 생각의 주인이다. 지금 뭘 하고 있는지를 먼저 본다.", hi: "행동이 생각의 주인" },
  { text: "첫 번째 팬케이크는 항상 망친다. 시작이 구린 건 당연하다.", hi: "시작이 구린 건 당연" },
  { text: "달리는 중에 무기력한 사람은 없다.", hi: "달리는 중" },
  { text: "꾸준히 하면 뭐든 는다.", hi: "꾸준히 하면" },
  { text: "당신은 당신의 생각이 아니다. 당신이 하는 일이 당신을 규정한다.", hi: "하는 일이 당신을 규정" },
  { text: "어려운 일을 해냄으로써 더 강해지는 것은 자연의 기본 법칙이다.", hi: "더 강해지는 것" },
  { text: "쓰는 순간, 주의가 그곳으로 향한다.", hi: "쓰는 순간" },
  { text: "모험을 하지 않는 것이 가장 위험하다.", hi: "가장 위험" },
  { text: "하기 쉬운 행동일수록 습관이 된다.", hi: "습관이 된다" },
  { text: "개구리를 먼저 먹어라.", hi: "먼저" },
  { text: "기분 좋은 상태를 유지하는 것이 최고의 수행이다.", hi: "최고의 수행" },
];

/* 각 습관 = 연속 수치 지표.
   metric:{unit, max(농담 기준)} · hist: 27일 일별 수치(old→new, 0=안함)
   states.today: 오늘 수치 → 히트맵 오늘칸 + 카드 표시 */
const HABITS = [
  {
    id:"today", ko:"글쓰기", en:"Today", url:"https://leftjap.github.io/apps/today/",
    metric:{ unit:"매", max:3.4 }, slot:{ time:"06:40", pos:11 }, last:"어제 07:10",
    hist:[2.1,1.8,0,2.4,1.5,3.0,2.2,0,1.9,2.6,1.4,2.0,0,2.8,1.7,2.2,3.4,1.9,2.5,2.1,2.3,1.7,2.4,0,2.6,1.9,2.1],
    cycle:["none","progress","done"], start:"done",
    states:{
      none:    { kind:"none",     big:3, unit:"일 연속", today:0,   line:"오늘 아직",       enter:"쓰기" },
      progress:{ kind:"progress", big:3, unit:"일 연속", today:1.6, line:"오늘까지 1.6매",   enter:"이어서" },
      done:    { kind:"done",     big:4, unit:"일 연속", today:2.1, line:"오늘 2.1매",      enter:"다시 열기" },
    },
  },
  {
    id:"gym", ko:"운동", en:"Gym", url:null, device:"iPhone",
    metric:{ unit:"분", max:60 }, slot:{ time:"13:50", pos:48 }, last:"그제 13:20",
    hist:[45,0,0,52,38,0,41,0,48,0,0,44,50,0,46,0,55,42,0,0,47,40,0,49,0,43,0],
    cycle:["none","progress","done"], start:"progress",
    states:{
      none:    { kind:"none",     big:2, unit:"이번주 회", today:0,  line:"마지막 운동 2일 전", enter:null },
      progress:{ kind:"progress", big:2, unit:"이번주 회", today:0,  line:"운동 중", timer:735, enter:null },
      done:    { kind:"done",     big:3, unit:"이번주 회", today:48, line:"오늘 48분",       enter:null },
    },
  },
  {
    id:"study", ko:"어학", en:"Study", url:"https://leftjap.github.io/apps/study/",
    metric:{ unit:"문장", max:46 }, slot:{ time:"20:00", pos:70 }, last:"어제 20:14",
    hist:[32,28,0,40,35,44,30,0,38,42,26,33,0,45,29,36,48,31,39,0,41,39,37,43,28,35,32],
    cycle:["none","progress","done"], start:"none",
    states:{
      none:    { kind:"none",     big:7, unit:"일 연속", today:0,  line:"복습 8개 대기",     enter:"열기" },
      progress:{ kind:"progress", big:7, unit:"일 연속", today:18, line:"복습 5 / 8 · 18문장", enter:"이어서" },
      done:    { kind:"done",     big:8, unit:"일 연속", today:32, line:"오늘 32문장",      enter:"다시 열기" },
    },
  },
  {
    id:"book", ko:"독서", en:"Book", url:"https://leftjap.github.io/apps/book/",
    metric:{ unit:"분", max:50 }, slot:{ time:"22:30", pos:90 }, last:"어제 22:30",
    hist:[28,0,35,30,42,25,0,33,38,0,45,29,31,0,40,36,27,44,30,32,48,0,33,38,35,41,28],
    cycle:["none","done"], start:"none",
    states:{
      none: { kind:"none", big:5, unit:"일 연속", today:0,  line:"어제 28분 읽음", enter:"읽기" },
      done: { kind:"done", big:6, unit:"일 연속", today:28, line:"오늘 28분",     enter:"다시 열기" },
    },
  },
];

/* 일별 수치 배열(28) = 27 hist + 오늘 */
function fullSeq(h, st){ return h.hist.concat([ st.today || 0 ]); }
/* 양 → 웜그레이 농담 단계 (해당 습관 max 기준) */
function level(v, max){ if(v<=0) return ""; const r=v/max; return r<0.34?"g1":r<0.7?"g2":"g3"; }
/* 연속 일수 (수치>0 인 날) */
function runDays(seq){ let n=0; for(let i=seq.length-1;i>=0;i--){ if(seq[i]>0) n++; else break; } return n; }
/* 최장 연속 */
function longestRun(seq){ let best=0,cur=0; for(const v of seq){ if(v>0){cur++;best=Math.max(best,cur);} else cur=0; } return best; }
/* 최근 n일 활동일수 */
function activeDays(seq, n){ return seq.slice(-n).filter(v=>v>0).length; }

const WD = ["일","월","화","수","목","금","토"];
function dayMeta(daysAgo, base){ const d=new Date(base); d.setDate(d.getDate()-daysAgo); return { m:d.getMonth()+1, d:d.getDate(), wd:WD[d.getDay()] }; }
function sentenceOfDay(){ const now=new Date(); const start=new Date(now.getFullYear(),0,0); return Math.floor((now-start)/86400000) % SENTENCES.length; }
const p2 = (n)=>String(n).padStart(2,"0");

/* 표시 순서 — 하루 흐름(아침→밤). 문·동선·기록 모두 이 순서로 일관 */
const ORDER = ["today","gym","study","book"];

Object.assign(window, {
  SENTENCES, HABITS, ORDER,
  fullSeq, level, runDays, longestRun, activeDays, dayMeta, sentenceOfDay, p2, WD
});
