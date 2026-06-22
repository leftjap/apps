// 오늘의 네비 자동 댓글 — 검증 순수 로직 (navi-realtime-daemon 오케스트레이션용).
// 부수효과·DB·에이전트 호출 없음 → 단위 테스트 용이. 비결정 에이전트의 출력을 보수적으로 해석한다.

/** 에이전트 출력(설명+JSON)에서 마지막 JSON 객체 추출. 실패 시 보수적 ok=false. */
export function parseVerdict(text) {
  const lines = String(text ?? '').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const s = lines[i].trim();
    if (s.startsWith('{') && s.endsWith('}')) {
      try {
        const o = JSON.parse(s);
        return { ok: o.ok === true, problems: Array.isArray(o.problems) ? o.problems : [], fix: o.fix || '' };
      } catch { /* 다음 줄 시도 */ }
    }
  }
  return { ok: false, problems: ['verdict 파싱 실패(보수적 차단)'], fix: '' };
}

/** verdict 들로 다음 행동 결정. fact 만 게이트(차단), tone 은 권고(피드백만). */
export function gateDecision(verdicts, { revisesLeft }) {
  const fact = verdicts.fact || { ok: false, problems: [] };
  const tone = verdicts.tone || { ok: true, problems: [] };
  if (fact.ok === true) {
    return { action: 'submit', reason: 'fact 통과' + (tone.ok ? '' : ' (tone 권고만)') };
  }
  if (revisesLeft > 0) {
    const feedback = [...(fact.problems || []), ...((tone.ok ? [] : tone.problems) || [])];
    return { action: 'revise', reason: 'fact 실패 → 사실 교정 재작성', feedback };
  }
  return { action: 'hold', reason: '재작성 소진 후에도 fact 실패 → 미게시(self-heal 재시도)' };
}

/** verdict 들을 REVISE 패스용 '지적+수정지시' 텍스트로. */
export function buildFixText(verdicts) {
  const fact = verdicts.fact || { problems: [], fix: '' };
  const tone = verdicts.tone || { ok: true, problems: [] };
  const probs = [...(fact.problems || []), ...((tone.ok ? [] : tone.problems) || [])];
  return [
    '[팩트체크/톤 지적]',
    ...probs.map((p, i) => `${i + 1}. ${p}`),
    '',
    '[수정 지시]',
    fact.fix || '(지적 항목을 사실에 맞게 교정. 유머·톤·구조·길이 유지, 무리한 새 연구 추가 금지.)',
  ].join('\n');
}
