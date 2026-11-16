// 마포 성능 측정 탐침(재작업 W19, 설계 문서 48절). 주소에 perf 를 붙여 연 페이지(main.ts 가 window.__perf 에 프레임마다 적는다)에서 돈다.
// 디버그 크롬(9333)에서 chrome-devtools MCP 로 쓴다:
//   1. new_page(url, background: true, isolatedContext: 잴 때마다 다른 이름) — 같은 사이트 탭끼리 렌더러 프로세스(곧 JS 힙)를 함께 쓰지 않게 한다
//   2. emulate(viewport '1280x800x1' 또는 '1280x800x2') 뒤 navigate_page(같은 url) — dpr 은 불러오기 전에 정한다
//   3. evaluate_script(sourcePath: 이 파일) — 처음 부르면 재기를 시작하고 'started' 를 돌려준다. 다시 부르면 지금까지의 결과(done 이면 끝)를 돌려준다
//   4. 끝나면 바로 close_page
// 재는 것: 준비(첫 프레임) 뒤 10~30초 프레임 간격 중앙·95%, 프레임당 JS 시간(사람·차 시뮬레이션·그리기 = 차·사람 그림 갱신 + render 호출),
// 그리기 호출·삼각형 수, JS 힙(30초·60초), 그다음 같은 탭에서 시점을 세 번 바꾼 뒤(각 20초, 세 번째는 처음 시점으로 돌아옴) 힙.
// 바꿀 시점은 window.__probeJumps(없으면 홍대입구역·판 전체·처음 시점, 판 전체에서 시작하면 홍대입구역·클럽거리·판 전체)로 정한다. [] 이면 바꾸지 않는다.
// 다섯 시점(W19, 모두 &perf): 합정 ?view=-497,250,140,62,30&t=22:00&dow=6, 홍대입구역 ?view=222,-410,150,20,0&t=21:00&dow=6,
// 클럽거리 ?view=290,40,130,25,0&t=21:00&dow=6, 걷고싶은거리 ?view=330,-350,150,25,0&t=18:00&dow=6, 판 전체 ?view=all&t=21:00&dow=6.
// 배포본은 https://leftjap.github.io/apps/mapo/?…&perf&nc=<숫자>. 로컬 빌드는 tools/perf-harness.mjs 로 묶은 스크립트를 https://leftjap.github.io/apps/?… 에서
// evaluate_script(format: script)로 먼저 돌려 띄운다(샌드박스가 로컬 포트를 막는다).
async () => {
  if (window.__probeResult) return window.__probeResult;
  const R = (window.__probeResult = { state: 'waiting', url: location.href, dpr: devicePixelRatio, w: innerWidth, h: innerHeight });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const heap = () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1);
  const q = (a, f) => {
    const s = Array.from(a).sort((x, y) => x - y);
    return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN;
  };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const r1 = (v) => Math.round(v * 10) / 10;
  const P = () => window.__perf;
  // 고른 구간(프레임 번호 a..b) 통계
  const stats = (a, b) => {
    const p = P();
    const N = p.gap.length;
    const pick = (arr) => Array.from({ length: b - a }, (_, i) => arr[(a + i) % N]);
    const gap = pick(p.gap);
    return {
      frames: b - a,
      fps: r1(1000 / mean(gap)),
      gapMed: r1(q(gap, 0.5)),
      gap95: r1(q(gap, 0.95)),
      js: r1(mean(pick(p.js))),
      js95: r1(q(pick(p.js), 0.95)),
      people: r1(mean(pick(p.people))),
      cars: r1(mean(pick(p.cars))),
      draw: r1(mean(pick(p.draw))),
      calls: p.calls,
      tris: p.tris,
      ...p.counts(),
    };
  };
  // 2분 손대지 않으면 드론 산책이 시작되므로(main.ts) 10초마다 키 누름을 보낸다
  setInterval(() => dispatchEvent(new KeyboardEvent('keydown')), 10_000);
  (async () => {
    while (!P() || P().n < 2) await sleep(200);
    const t0 = performance.now();
    R.state = 'running';
    R.heap0 = heap();
    const at = (s) => sleep(Math.max(0, t0 + s * 1000 - performance.now()));
    await at(10);
    const f10 = P().n;
    await at(30);
    R.run = stats(f10, P().n);
    R.heap30 = heap();
    await at(60);
    R.heap60 = heap();
    const home = new URLSearchParams(location.search).get('view') ?? 'all';
    const HONGIK = '222,-410,150,20,0';
    const CLUB = '290,40,130,25,0';
    const jumps = window.__probeJumps ?? (home === 'all' ? [HONGIK, CLUB, home] : [home === HONGIK ? CLUB : HONGIK, 'all', home]);
    R.jumps = [];
    for (const v of jumps) {
      P().jump(v);
      const s = performance.now();
      await sleep(10_000);
      const f = P().n;
      await sleep(Math.max(0, s + 20_000 - performance.now()));
      R.jumps.push({ view: v, heap: heap(), ...stats(f, P().n) });
    }
    R.heapJumps = heap();
    R.state = 'done';
  })();
  return 'started';
}
