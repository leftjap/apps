// 사건 데이터. 같은 팀 부장·대리·사원에게 부고를 전하고, 소식을 들은 직후의 얼굴을 평소 얼굴과 비교한다.
// 셋 다 슬퍼 보이지만 한 명의 슬픔은 꾸민 것이다. 표정 설명은 폴 에크먼 그룹의 설명을 짧게 풀어 쓴 것이다.

export const SOURCES = {
  sadness: { short: '에크먼: 슬픔', title: '폴 에크먼 그룹, What is Sadness?', url: 'https://www.paulekman.com/universal-emotions/what-is-sadness/' },
  surprise: { short: '에크먼: 놀람', title: '폴 에크먼 그룹, What is Surprise?', url: 'https://www.paulekman.com/universal-emotions/what-is-surprise/' },
};

export const EMOTIONS = {
  sadness: { name: '슬픔', face: '눈썹 안쪽 끝이 올라가 가운데로 모이고, 입꼬리가 처진다. 에크먼은 눈썹 안쪽 끝이 올라가는 것을 슬픔의 가장 믿을 만한 신호로 봤다.', source: 'sadness' },
  shockSad: { name: '놀람이 섞인 슬픔', face: '눈이 커지고 입이 살짝 벌어지면서 눈썹 안쪽 끝이 함께 올라간다.', source: 'sadness' },
  shock: { name: '놀람', face: '눈썹이 둥글게 올라가고, 눈이 커지며, 턱이 내려가 입이 벌어진다. 갑작스러운 소식에 맞는 반응이다. 에크먼은 놀람을 몇 초 안에 지나가는 가장 짧은 감정으로 봤다.', source: 'surprise' },
  fakeSad: { name: '꾸민 슬픔', face: '입꼬리는 내렸지만 눈썹 안쪽 끝이 올라가지 않았다. 에크먼에 따르면 이 근육은 일부러 움직일 수 있는 사람이 드물어서 슬픔을 꾸며 내기 어렵다.', source: 'sadness' },
};

const TEAM = {
  bujang: { name: '최동혁', role: '부장' },
  daeri: { name: '박은정', role: '대리' },
  sawon: { name: '최민지', role: '사원' },
};
const who = (key, rest) => ({ key, ...TEAM[key], ...rest });

export const CASES = [
  {
    id: 'd1', title: '김 과장의 부고',
    situation: '월요일 아침 회의실. 같은 팀 세 사람에게 소식을 전한다.',
    news: '김 과장님이 어젯밤 교통사고로 돌아가셨습니다.',
    suspects: [
      who('bujang', { says: '아… 김 과장이… 안타깝네.', emotion: 'fakeSad', liar: true, tell: { x: 0.5, y: 0.335, r: 0.08 } }),
      who('daeri', { says: '금요일까지 같이 일했는데…', emotion: 'sadness', liar: false }),
      who('sawon', { says: '네? 말도 안 돼요…', emotion: 'shock', liar: false }),
    ],
  },
  {
    id: 'd2', title: '박 상무의 부고',
    situation: '오후 탕비실. 지난해 퇴임한 박 상무의 소식을 전한다.',
    news: '박 상무님이 오늘 새벽 지병으로 별세하셨대요.',
    suspects: [
      who('bujang', { says: '박 상무님이… 내 첫 팀장이셨는데.', emotion: 'sadness', liar: false }),
      who('daeri', { says: '지난달에 뵀을 때도 괜찮으셨는데…', emotion: 'sadness', liar: false }),
      who('sawon', { says: '아, 정말요… 안타깝네요.', emotion: 'fakeSad', liar: true, tell: null }),
    ],
  },
];

// d2 는 대리·사원의 '소식 직후' 사진이 아직 없다(2026-11-11 제미나이 이미지 생성이 빈 응답으로 멈춤). 사진이 생기면 넣는다.
export const DAYS = [['d1']];

// 평소 얼굴은 사람마다 한 장, 소식을 들은 직후 얼굴은 사건마다 한 장
export const img = (caseId, key, kind) => (kind === 'base' ? `img/${key}-base.jpg` : `img/${caseId}-${key}.jpg`);
