/**
 * 체중 관리 — DB 무관 순수 함수 (spec §10-2).
 *
 * UI wiring (mocks/admin.html 통합) 은 별 파일/Wave 11.7.2b 에서 추가.
 * 여기서는 sma7 / isWeightPR / estimateGoalDate / calculateRemainingLoss 만.
 *
 * 입력 형식:
 *   weights: { date: 'YYYY-MM-DD', weight: number }[] — date 오름차순 가정.
 *   listWeightsByRange / listAllWeights 의 반환을 그대로 사용.
 */

/** 7일 이동평균 — 각 인덱스 i 에 대해 [max(0,i-6) ... i] 평균. 결과 길이 = 입력 길이. */
export function sma7(weights) {
  if (!Array.isArray(weights) || weights.length === 0) return [];
  const W = 7;
  const out = [];
  for (let i = 0; i < weights.length; i++) {
    const start = Math.max(0, i - W + 1);
    const slice = weights.slice(start, i + 1);
    const sum = slice.reduce((s, w) => s + (Number(w.weight) || 0), 0);
    out.push({ date: weights[i].date, sma: sum / slice.length });
  }
  return out;
}

/**
 * 신기록 PR 판정 — 새 weight 가 prevWeights 중 최저점보다 낮으면 true.
 * prevWeights 는 새 입력 이전의 모든 row. 비어있으면 PR 아님 (첫 입력은 비교 대상 없음).
 *
 * spec §10-2 "체중 신기록(최저점) 달성 시 PR 팝".
 */
export function isWeightPR(newWeight, prevWeights) {
  if (!Number.isFinite(newWeight)) return false;
  if (!Array.isArray(prevWeights) || prevWeights.length === 0) return false;
  const minPrev = prevWeights.reduce(
    (min, w) => Math.min(min, Number(w.weight) || Infinity),
    Infinity,
  );
  if (!Number.isFinite(minPrev)) return false;
  return newWeight < minPrev;
}

/** 남은 감량량 — currentWeight - goalWeight 가 음수면 0. */
export function calculateRemainingLoss(currentWeight, goalWeight) {
  const diff = (Number(currentWeight) || 0) - (Number(goalWeight) || 0);
  return diff > 0 ? Math.round(diff * 10) / 10 : 0;
}

/**
 * 예상 달성 시기 — 월 monthlyLossKg(기본 1.5kg) 페이스로 goalWeight 까지 도달하는 ISO 날짜.
 *  - currentWeight <= goalWeight: now() ISO 즉시 반환 (이미 달성).
 *  - monthlyLossKg <= 0: null (의미 없음).
 * 1개월 = 30.44일 (그레고리력 평균).
 */
export function estimateGoalDate(currentWeight, goalWeight, monthlyLossKg = 1.5, now = new Date()) {
  if (!Number.isFinite(currentWeight) || !Number.isFinite(goalWeight)) return null;
  if (!Number.isFinite(monthlyLossKg) || monthlyLossKg <= 0) return null;
  const remaining = currentWeight - goalWeight;
  if (remaining <= 0) return toISODate(now);
  const days = Math.ceil((remaining / monthlyLossKg) * 30.44);
  const target = new Date(now);
  target.setDate(target.getDate() + days);
  return toISODate(target);
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ───────────────────────────── DOM 어댑터 (Wave 11.7.2b) ───────────────────────────── */

/**
 * weight 페이지 진입 시 호출 — admin.html 의 hardcoded fixture 를 실 데이터로 대체.
 * window.gymQueries / gymExercises 미초기화 (mocks 허브 iframe) 시엔 no-op → fixture 보존.
 *
 * 호출 시점: SPA app.js mount() 후 admin 라우트 + IIFE 안의 SPA-환경 분기.
 *
 * 매개변수 root (default: document) — 테스트에서 jsdom 또는 fake DOM 주입 가능.
 */
export async function renderWeightTab(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { skipped: 'no-document' };
  if (typeof window === 'undefined' || !window.gymQueries) {
    return { skipped: 'no-queries' }; // mocks 허브 fallback
  }
  const Q = window.gymQueries;
  const rows = await Q.listAllWeights();
  const settings = await Q.getUserSettings();
  const latest = rows.length ? rows[rows.length - 1] : null;
  const goalWeight = Number(settings.goalWeight) || 69;

  // 1) hero: 현재 체중 + 메타 (남은 감량 + 예상 시기)
  const heroNum = doc.querySelector('[data-bind="weight-hero-num"]');
  const heroMeta = doc.querySelector('[data-bind="weight-hero-meta"]');
  if (heroNum) {
    heroNum.textContent = latest ? formatWeight(latest.weight) : '—';
  }
  if (heroMeta) {
    if (!latest) {
      heroMeta.textContent = `목표 ${goalWeight}kg · 첫 입력을 기다립니다`;
    } else {
      const remaining = calculateRemainingLoss(latest.weight, goalWeight);
      const target = estimateGoalDate(latest.weight, goalWeight, 1.5);
      const weeks = target ? estimateWeeksUntil(target) : null;
      const remainText = remaining > 0 ? `−${remaining.toFixed(1)}kg 남음` : '목표 달성';
      const weeksText = weeks != null && weeks > 0 ? ` · 약 ${weeks}주` : '';
      heroMeta.innerHTML = `목표 ${goalWeight}kg · <strong>${escapeHtml(remainText)}</strong>${escapeHtml(weeksText)}`;
    }
  }

  // 2) 리스트
  const listRoot = doc.querySelector('[data-bind="weight-list"]');
  if (listRoot) {
    if (!rows.length) {
      listRoot.innerHTML = `<div class="weight-empty" data-empty="1">아직 기록이 없습니다. 아래 + 버튼으로 입력하세요.</div>`;
    } else {
      const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      const minWeight = Math.min(...rows.map(r => Number(r.weight) || Infinity));
      listRoot.innerHTML = sorted.slice(0, 10).map(r => {
        const isPr = Number(r.weight) === minWeight && rows.length > 1;
        const prMark = isPr ? '<span class="pr-mark">PR</span>' : '';
        const cls = isPr ? 'wr-val pr' : 'wr-val';
        return `<div class="weight-row" data-date="${escapeHtml(r.date)}">`
          + `<span class="wr-date">${escapeHtml(r.date)}</span>`
          + `<span class="${cls}">${formatWeight(r.weight)} kg${prMark}</span>`
          + `</div>`;
      }).join('');
    }
  }

  // 3) chart (sma7 라인) — 단순 SVG path 갱신.
  const chartWeight = doc.querySelector('[data-bind="chart-weight"]');
  const chartAvg = doc.querySelector('[data-bind="chart-avg"]');
  const chartGoal = doc.querySelector('[data-bind="chart-goal"]');
  if (chartWeight && chartAvg && chartGoal) {
    if (rows.length >= 2) {
      const last30 = rows.slice(-30);
      const sma = sma7(last30);
      const { weights, avgs, goalY } = projectChart(last30, sma, goalWeight);
      chartWeight.setAttribute('d', weights);
      chartAvg.setAttribute('d', avgs);
      chartGoal.setAttribute('y1', String(goalY));
      chartGoal.setAttribute('y2', String(goalY));
    } else {
      // 데이터 부족 — path 비움
      chartWeight.setAttribute('d', '');
      chartAvg.setAttribute('d', '');
    }
  }

  // 4) chart-legend (30일 전·변화·오늘) — Wave 11.7.5 hotfix
  updateChartLegend(doc, rows);

  return { rendered: true, count: rows.length, latestWeight: latest?.weight ?? null };
}

/**
 * chart-legend 의 3 span 갱신 — 30일 전 / 변화 / 오늘.
 *  - rows 가 0 건: 모두 — 표기.
 *  - 1 건: 오늘만 표시, 30일 전·변화 — 표기.
 *  - 2 건 이상: 가장 오래된 row 를 "30일 전" 으로 (실제로 30일 정확 일치 아님 — 라벨 의미는 "비교 시작점").
 */
function updateChartLegend(doc, rows) {
  const legend = doc.querySelector('.chart-legend');
  if (!legend) return;
  const spans = legend.querySelectorAll('span');
  if (spans.length < 3) return;
  if (!rows.length) {
    spans[0].innerHTML = '<strong>—</strong>30일 전';
    spans[1].innerHTML = '<strong>—</strong>변화';
    spans[2].innerHTML = '<strong>—</strong>오늘';
    return;
  }
  const last30 = rows.slice(-30);
  const oldest = last30[0];
  const newest = last30[last30.length - 1];
  const diff = Number(newest.weight) - Number(oldest.weight);
  const diffSign = diff > 0 ? '+' : (diff < 0 ? '−' : '');
  const diffAbs = Math.round(Math.abs(diff) * 10) / 10;
  spans[0].innerHTML = `<strong>${formatWeight(oldest.weight)} kg</strong>30일 전`;
  spans[1].innerHTML = `<strong>${diffSign}${diffAbs.toFixed(1)} kg</strong>변화`;
  spans[2].innerHTML = `<strong>${formatWeight(newest.weight)} kg</strong>오늘`;
}

/**
 * weight 입력 저장 — upsertWeight + isWeightPR → PR pop + renderWeightTab 재호출.
 * input 은 string/number 모두 허용. 소수점 1자리 반올림.
 */
export async function saveWeightInput(input, dateISO, root) {
  if (typeof window === 'undefined' || !window.gymQueries) {
    throw new Error('[saveWeightInput] window.gymQueries 미초기화');
  }
  const num = parseWeightInput(input);
  if (num == null) {
    return { ok: false, reason: 'invalid-input' };
  }
  const Q = window.gymQueries;
  const date = dateISO || Q.toISODate(new Date());
  const prevAll = await Q.listAllWeights();
  const prevExcludingToday = prevAll.filter(r => r.date !== date);
  const isPR = isWeightPR(num, prevExcludingToday);
  await Q.upsertWeight(date, num);
  await renderWeightTab(root);
  if (isPR) showPRPop(root);
  return { ok: true, weight: num, date, isPR };
}

/** "73.45" / 73.45 / "  73 " → 73.5 (소수점 1자리). 잘못된 입력 → null. */
export function parseWeightInput(input) {
  if (input == null) return null;
  const str = String(input).trim().replace(',', '.');
  const num = Number(str);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 10) / 10;
}

/** PR 팝 — accent 색 짧은 페이드 (spec §6-11 동일 방식). DOM 미존재면 no-op. */
export function showPRPop(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const el = doc.querySelector('[data-bind="weight-pr-pop"]');
  if (!el) return;
  el.classList.remove('is-pop');
  // reflow 강제 — 연속 클릭 시 애니메이션 재시작
  void el.offsetWidth;
  el.classList.add('is-pop');
  setTimeout(() => el.classList.remove('is-pop'), 1100);
}

/** weight 페이지 진입 시 inline 입력 form 토글 — open/close 단순 클래스 토글 */
export function toggleWeightInputForm(open, root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const form = doc.querySelector('[data-bind="weight-entry-form"]');
  if (!form) return;
  if (open) {
    form.removeAttribute('hidden');
    const input = form.querySelector('input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 0);
    }
  } else {
    form.setAttribute('hidden', '');
  }
}

/* ───────────────────────────── helpers ───────────────────────────── */

function formatWeight(w) {
  const n = Number(w);
  if (!Number.isFinite(n)) return '—';
  return (Math.round(n * 10) / 10).toFixed(1);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

function estimateWeeksUntil(targetISO, now = new Date()) {
  const [y, m, d] = targetISO.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / 86400000);
  return Math.ceil(diffDays / 7);
}

/**
 * SVG path 좌표 산출 — 0~300 x, 0~120 y. 가벼운 정규화.
 *  - x: 0 ~ 300 균등 (n>=2)
 *  - y: weight 분포 min~max 를 chart 영역 [10, 110] 로 매핑 (위가 무거움 → invert).
 *  - goalY: goalWeight 가 같은 범위 안에서 어디 위치하는지.
 */
function projectChart(rows, smaRows, goalWeight) {
  const W = 300, H = 120;
  const top = 10, bottom = H - 10;
  const all = [
    ...rows.map(r => Number(r.weight)),
    ...smaRows.map(s => Number(s.sma)),
    Number(goalWeight),
  ].filter(Number.isFinite);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = (max - min) || 1;
  const yOf = (val) => bottom - ((val - min) / span) * (bottom - top);

  const xOf = (i, n) => (n <= 1) ? 0 : (i / (n - 1)) * W;
  const weightsPath = rows.map((r, i) => {
    const x = xOf(i, rows.length).toFixed(1);
    const y = yOf(Number(r.weight)).toFixed(1);
    return (i === 0 ? 'M' : 'L') + x + ',' + y;
  }).join(' ');
  const avgsPath = smaRows.map((r, i) => {
    const x = xOf(i, smaRows.length).toFixed(1);
    const y = yOf(Number(r.sma)).toFixed(1);
    return (i === 0 ? 'M' : 'L') + x + ',' + y;
  }).join(' ');
  return { weights: weightsPath, avgs: avgsPath, goalY: yOf(goalWeight).toFixed(1) };
}

/* mocks 허브 inline script 접근용 — 11.7.2b admin wiring 에서 활용 */
if (typeof window !== 'undefined') {
  window.gymWeights = {
    sma7,
    isWeightPR,
    calculateRemainingLoss,
    estimateGoalDate,
    renderWeightTab,
    saveWeightInput,
    parseWeightInput,
    showPRPop,
    toggleWeightInputForm,
  };
}
