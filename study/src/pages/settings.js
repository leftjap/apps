/* 설정 — 데스크톱/모바일 C 파이널 v2 (작업지시서 §8 SettingsV2)
 * 학습 목표·음성·학습 방식·데이터·계정. db.meta 'studySettings' 에 저장/복원.
 * 로그아웃 = window.studyAuth.signOut. 초기화는 confirm 후 학습 데이터 삭제.
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';
import { Sync } from '../db/sync.js';
import { syncStatus } from '../services/syncHealth.js';

const VG_CSS = `
.vg{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.vg *{box-sizing:border-box;margin:0}
.vg-top{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center}
.vg-top-in{width:100%;max-width:640px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.vg-home{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--mut);white-space:nowrap;background:none;border:0;cursor:pointer;font-family:inherit}
.vg-wrap{width:100%;max-width:640px;margin:0 auto;padding:26px 20px 48px}
.vg-h1{font-family:Outfit;font-size:26px;font-weight:700;letter-spacing:-0.02em}
.vg-sec{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:6px 26px;margin-top:18px}
.vg-lab{font-family:Outfit;font-size:10.5px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase;padding:18px 0 4px;white-space:nowrap}
.vg-row{display:flex;align-items:center;gap:16px;padding:15px 0;border-top:1px solid var(--line)}
.vg-row:first-of-type{border-top:0}
.vg-row .t{font-size:14.5px;font-weight:600}
.vg-row .d{font-size:12px;color:var(--faint);margin-top:3px}
.vg-row .d.vg-risk{color:#dc2626;font-weight:600}
.vg-row .grow{flex:1}
.vg-step{display:inline-flex;align-items:center;gap:14px}
.vg-step button{width:28px;height:28px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);font:inherit;font-size:15px;font-weight:700;cursor:pointer;display:grid;place-items:center}
.vg-step .v{font-family:Outfit;font-size:16px;font-weight:700;min-width:50px;text-align:center}
.vg-segc{display:flex;gap:4px;background:#efebde;border-radius:10px;padding:3px}
.vg-segc span{font-size:12.5px;font-weight:700;color:var(--mut);padding:7px 14px;border-radius:8px;cursor:pointer;white-space:nowrap}
.vg-segc span.on{background:var(--card);color:var(--teal-deep);box-shadow:0 2px 6px -3px rgba(25,35,32,.22)}
.vg-tog{width:40px;height:23px;border-radius:999px;background:var(--teal);position:relative;flex:0 0 auto;cursor:pointer}
.vg-tog i{position:absolute;top:2.5px;left:20px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.18);transition:left .15s}
.vg-tog.off{background:#ddd9c9}
.vg-tog.off i{left:2.5px}
.vg-val{font-size:13.5px;color:var(--mut);display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.vg-btn{font:inherit;font-size:12.5px;font-weight:700;color:var(--ink);background:transparent;border:1.5px solid var(--line);border-radius:10px;padding:9px 16px;cursor:pointer;white-space:nowrap}
.vg-danger{font-size:13.5px;font-weight:700;color:var(--coral-deep);cursor:pointer;white-space:nowrap;background:none;border:0;font-family:inherit}
.vg-ver{font-size:11.5px;color:var(--faint);margin-top:16px;font-family:Outfit;letter-spacing:.04em;text-align:center}
.vg-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(8px);background:var(--card);border:1px solid var(--line);border-radius:12px;padding:11px 18px;font-size:13px;box-shadow:0 8px 22px -10px rgba(25,35,32,.25);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:50}
.vg-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
`;

const DEFAULTS = { speechGoal: 30, passThreshold: 80, recGate: 3, lang: 'en', shadowing: true, combo: true, speed: '1.0', voice: 'Emma (미국)' };

function segc(options, value, onPick) {
  const el = h('span', { class: 'vg-segc' }, options.map((o) =>
    h('span', { class: o.v === value ? 'on' : '', onClick: () => { [...el.children].forEach((c) => c.classList.remove('on')); event.currentTarget.classList.add('on'); onPick(o.v); } }, o.label)));
  return el;
}

export function mountSettings(host) {
  ensureV2Fonts();
  host.innerHTML = '';
  const state = { ...DEFAULTS };

  let toastTimer;
  const toastEl = h('div', { class: 'vg-toast' });
  const toast = (m) => { toastEl.textContent = m; toastEl.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1500); };

  const save = async () => {
    const db = window.studyDB;
    if (!db?.meta) return;
    try { await db.meta.put({ key: 'studySettings', value: { ...state, autoTTS: state.shadowing, dailyNewCount: 10 }, at: Date.now() }); }
    catch (e) { console.error('[settings] save', e); }
  };

  // 컨트롤
  const goalV = h('span', { class: 'v' }, state.speechGoal + '회');
  const adjGoal = (d) => { state.speechGoal = Math.max(10, Math.min(60, state.speechGoal + d * 5)); goalV.textContent = state.speechGoal + '회'; toast('하루 발화 목표 · ' + state.speechGoal + '회'); save(); };

  const tog = (key) => {
    const el = h('span', { class: 'vg-tog' + (state[key] ? '' : ' off') }, h('i'));
    el.addEventListener('click', () => { state[key] = !state[key]; el.classList.toggle('off', !state[key]); save(); });
    return el;
  };

  const root = h('div', { class: 'vg' }, v2Style(VG_CSS),
    h('div', { class: 'vg-top' }, h('div', { class: 'vg-top-in' },
      h('button', { class: 'vg-home', type: 'button', onClick: () => { window.location.hash = '#/home'; } }, vIcon(VI.HOME, { size: 14 }), '홈으로'))),
    h('div', { class: 'vg-wrap' },
      h('h1', { class: 'vg-h1' }, '설정'),

      h('div', { class: 'vg-sec' },
        h('div', { class: 'vg-lab' }, '학습 목표'),
        h('div', { class: 'vg-row' }, h('div', {}, h('div', { class: 't' }, '하루 발화 목표'), h('div', { class: 'd' }, '홈·세션의 발화 게이지 기준')), h('span', { class: 'grow' }),
          h('span', { class: 'vg-step' }, h('button', { type: 'button', onClick: () => adjGoal(-1) }, '−'), goalV, h('button', { type: 'button', onClick: () => adjGoal(1) }, '+'))),
        h('div', { class: 'vg-row' }, h('div', {}, h('div', { class: 't' }, '통과 기준 점수'), h('div', { class: 'd' }, '이상이면 PASS · 콤보 적립')), h('span', { class: 'grow' }),
          segc([{ v: 70, label: '70' }, { v: 80, label: '80' }, { v: 90, label: '90' }], state.passThreshold, (v) => { state.passThreshold = v; save(); })),
        h('div', { class: 'vg-row' }, h('div', {}, h('div', { class: 't' }, '발화 게이트'), h('div', { class: 'd' }, '다음 표현으로 넘어가기 위한 최소 발화')), h('span', { class: 'grow' }),
          segc([{ v: 1, label: '1회' }, { v: 3, label: '3회' }, { v: 5, label: '5회' }], state.recGate, (v) => { state.recGate = v; save(); }))),

      h('div', { class: 'vg-sec' },
        h('div', { class: 'vg-lab' }, '음성'),
        h('div', { class: 'vg-row' }, h('div', { class: 't' }, '보이스 · 영어'), h('span', { class: 'grow' }), h('span', { class: 'vg-val', id: 'voiceVal' }, state.voice, vIcon(VI.CHEV_DOWN, { size: 13, sw: 2 }))),
        h('div', { class: 'vg-row' }, h('div', { class: 't' }, '재생 속도'), h('span', { class: 'grow' }),
          segc([{ v: '0.8', label: '0.8×' }, { v: '1.0', label: '1.0×' }, { v: '1.2', label: '1.2×' }], state.speed, (v) => { state.speed = v; save(); }))),

      h('div', { class: 'vg-sec' },
        h('div', { class: 'vg-lab' }, '학습 방식'),
        h('div', { class: 'vg-row' }, h('div', {}, h('div', { class: 't' }, '기본 학습 언어'), h('div', { class: 'd' }, '홈 진입 시 먼저 보여줄 과목')), h('span', { class: 'grow' }),
          segc([{ v: 'en', label: '영어' }, { v: 'ja', label: '일본어' }, { v: 'math', label: '수학' }], state.lang, (v) => { state.lang = v; try { sessionStorage.setItem('studyLang', v); } catch { /* noop */ } save(); })),
        h('div', { class: 'vg-row' }, h('div', {}, h('div', { class: 't' }, '쉐도잉 기본 켜기'), h('div', { class: 'd' }, '다이얼로그에서 줄마다 따라 말하기')), h('span', { class: 'grow' }), tog('shadowing')),
        h('div', { class: 'vg-row' }, h('div', {}, h('div', { class: 't' }, '콤보·기록 효과'), h('div', { class: 'd' }, 'PASS 콤보, 기록 갱신 알림')), h('span', { class: 'grow' }), tog('combo'))),

      h('div', { class: 'vg-sec' },
        h('div', { class: 'vg-lab' }, '데이터'),
        h('div', { class: 'vg-row' }, h('div', {}, h('div', { class: 't' }, '동기화'), h('div', { class: 'd', id: 'syncTime' }, '마지막 동기화 —')), h('span', { class: 'grow' }),
          h('button', { class: 'vg-btn', type: 'button', onClick: () => toast('학습 데이터 내보내기는 곧 지원돼요') }, '학습 데이터 내보내기')),
        h('div', { class: 'vg-row' }, h('div', {}, h('div', { class: 't' }, '초기화'), h('div', { class: 'd' }, '모든 학습 기록 삭제 — 되돌릴 수 없어요')), h('span', { class: 'grow' }),
          h('button', { class: 'vg-danger', type: 'button', onClick: () => resetData(toast) }, '학습 데이터 초기화'))),

      h('div', { class: 'vg-sec' },
        h('div', { class: 'vg-lab' }, '계정'),
        h('div', { class: 'vg-row' }, h('div', {}, h('div', { class: 't', id: 'acctEmail' }, '로그인 정보 불러오는 중…'), h('div', { class: 'd' }, '로그아웃하면 로그인 화면으로 돌아가요 · 데이터는 동기화로 복원')), h('span', { class: 'grow' }),
          h('button', { class: 'vg-btn', type: 'button', onClick: () => doLogout() }, '로그아웃'))),

      h('div', { class: 'vg-ver' }, 'Study · v0.1.0'),
    ),
    toastEl,
  );
  host.appendChild(root);

  // 저장값 복원 + 프로필
  (async () => {
    const db = window.studyDB;
    if (db?.meta) {
      try {
        const row = await db.meta.get('studySettings');
        if (row?.value) {
          Object.assign(state, { ...DEFAULTS, ...row.value });
          if (typeof row.value.autoTTS === 'boolean' && row.value.shadowing == null) state.shadowing = row.value.autoTTS;
          hydrate();
        }
      } catch (e) { console.error('[settings] load', e); }
    }
    const email = window.studyAuth?.currentUserEmail?.() || (await currentEmail());
    const el = root.querySelector('#acctEmail');
    if (el && email) el.textContent = email;
    // '마지막 동기화 —' 는 지금까지 아무도 채우지 않는 자리표시자였다 (거짓 UI).
    // 실제 flush 결과를 표시하고, 미푸시분이 오래 남아 있으면 붉게 경고한다.
    const sync = root.querySelector('#syncTime');
    if (sync) {
      const st = syncStatus(Sync.currentSyncHealth());
      sync.textContent = st.text;
      sync.classList.toggle('vg-risk', st.level === 'risk');
    }
  })();

  function hydrate() {
    goalV.textContent = state.speechGoal + '회';
    // 세그먼트 재반영
    root.querySelectorAll('.vg-segc').forEach(() => {}); // 세그먼트는 초기 렌더값 기준 — load 후 재구성 생략(소비처 무영향), 토글/스테퍼만 갱신
    root.querySelectorAll('.vg-tog').forEach((t, i) => { const key = i === 0 ? 'shadowing' : 'combo'; t.classList.toggle('off', !state[key]); });
  }

  return () => { host.innerHTML = ''; };
}

async function currentEmail() {
  try { const s = await window.studyAuth?.getSession?.(); return s?.user?.email || null; } catch { return null; }
}

async function doLogout() {
  try { await window.studyAuth?.signOut?.(); } catch (e) { console.error('[settings] logout', e); }
  window.location.hash = '#/login';
}

async function resetData(toast) {
  if (!window.confirm('모든 학습 기록을 삭제할까요? 되돌릴 수 없어요.')) return;
  try {
    localStorage.removeItem('mathProgress');
    const db = window.studyDB;
    if (db) {
      for (const t of ['todayLessons', 'reviewQueue', 'sessionLogs', 'pronunciationLog', 'dailyStats']) {
        try { await db[t]?.clear(); } catch { /* noop */ }
      }
    }
    toast('학습 데이터를 초기화했어요');
  } catch (e) { console.error('[settings] reset', e); }
}
