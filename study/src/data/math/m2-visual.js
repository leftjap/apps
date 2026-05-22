// 모듈: 시각·기하 strand (미적분 직관의 다리)
const TRI_SVG =
  '<svg width="260" height="190" viewBox="0 0 260 190" role="img" aria-label="밑변 6 높이 4 삼각형">' +
  '<rect x="30" y="20" width="200" height="130" fill="none" stroke="#cfc7ba" stroke-dasharray="5 4"/>' +
  '<polygon points="30,150 230,150 95,20" fill="#dce7d0" stroke="#6f8a52" stroke-width="2.5"/>' +
  '<line x1="95" y1="20" x2="95" y2="150" stroke="#6f8a52" stroke-width="1.5" stroke-dasharray="4 3"/>' +
  '<text x="118" y="172" font-size="14" fill="#3a3a3a">밑변 6</text>' +
  '<text x="40" y="92" font-size="14" fill="#3a3a3a">높이 4</text>' +
  '<text x="150" y="40" font-size="13" fill="#9a9a9a">(직사각형의 절반)</text></svg>';

export const MODULE_VISUAL = [
  {
    id: 'vis-1',
    tag: '시각 통찰 · 누적',
    lesson: '수를 “모양”으로 바꿔 보면, 계산 없이 답이 보일 때가 있어요.',
    figure: { type: 'dots', n: 5, legend: '색이 같은 ㄱ자 한 겹 = 홀수 한 개 (1·3·5·7·9)' },
    prompt: '1 + 3 + 5 + 7 + 9 = ?  (그림에서 몇 × 몇으로 보이나요?)',
    answer: '25',
    accept: ['25', '5x5'],
    solution: {
      core: '홀수를 ㄱ자로 한 겹씩 두르면 항상 정사각형이 된다.',
      idea:
        '점 1개에서 시작해 ㄱ자(3개)를 씌우면 2×2, 또 ㄱ자(5개)면 3×3… ' +
        '홀수 하나가 정사각형 “한 겹”이에요. 그래서 연속한 홀수의 합은 늘 제곱수.',
      steps: ['1·3·5·7·9를 차례로 두르기 → 5×5 격자', '5 × 5 = 25'],
      refresh: '곱셈 · 제곱(5² = 25)',
      example: '계산기 없이도 “홀수 다섯 개의 합 = 5의 제곱”이라고 바로 말할 수 있어요.',
      think: '쌓임이 넓이가 된다 — 적분의 씨앗.',
    },
  },
  {
    id: 'vis-2',
    tag: '기하 · 넓이',
    lesson: '넓이는 “이미 아는 모양으로 바꿔 보기”가 핵심.',
    figure: { type: 'svg', svg: TRI_SVG },
    prompt: '밑변 6, 높이 4인 삼각형의 넓이는?',
    answer: '12',
    accept: ['12'],
    solution: {
      core: '삼각형 = 같은 밑변·높이 직사각형의 절반.',
      idea: '직사각형을 대각선으로 자르면 똑같은 삼각형 둘이 나와요. 그러니 삼각형은 직사각형의 반.',
      steps: ['직사각형 6 × 4 = 24', '절반 → 12   (½ × 밑변 × 높이)'],
      refresh: '½ · 곱셈',
      example: '텃밭·천 조각·벽 한 면의 넓이도 똑같이 “직사각형으로 바꿔” 구하면 돼요.',
      think: '모르는 모양은, 아는 모양으로 쪼개거나 채워라.',
    },
  },
];
