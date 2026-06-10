/* pick — 더미 데이터: 한국어 작품 + 브랜치 그래프
   모든 텍스트는 실제 작품. summary/reason은 사람이 쓴 듯 짧게. */
(function () {
  // hue: 포스터 플레이스홀더 색조(저채도). 작품마다 결정적 색 한 점.
  const W = {
    /* ───────── 영화 ───────── */
    heojil: {
      id: 'heojil', type: 'film', title: '헤어질 결심',
      sub: '박찬욱 · 2022', year: 2022, runtime: 138, hue: 205,
      meta: {
        director: '박찬욱',
        cast: ['탕웨이', '박해일', '이정현', '고경표'],
        writer: '박찬욱 · 정서경',
      },
      tags: ['멜로', '미스터리', '느와르'],
      summary:
        '산 정상에서 추락한 남자의 죽음을 수사하던 형사 해준은, 사망자의 아내 서래를 만나 마음이 흔들린다. 의심과 관심이 같은 자리에서 자라고, 사건이 끝난 자리에서 사랑이 시작된다. 응시와 침묵으로 쌓아 올린, 끝내 “붕괴”에 이르는 멜로.',
      rating: 5,
      branches: [
        { to: 'hwayang', reason: '닿을 수 없는 거리를 응시로 버티는 절제된 멜로. 같은 온도다.' },
        { to: 'past', reason: '엇갈린 타이밍이 사랑을 완성하는 동시에 끝낸다는 점에서.' },
        { to: 'anatomy', reason: '죽음의 진술을 더듬는 의심의 구조가 닮았다.' },
      ],
    },
    past: {
      id: 'past', type: 'film', title: '패스트 라이브즈',
      sub: 'Past Lives · 셀린 송 · 2023', year: 2023, runtime: 105, hue: 25,
      meta: {
        director: '셀린 송',
        cast: ['그레타 리', '유태오', '존 마가로'],
        writer: '셀린 송',
      },
      tags: ['멜로', '드라마'],
      summary:
        '열두 살에 헤어진 나영과 해성은 스물네 해를 사이에 두고 뉴욕에서 다시 만난다. 무엇도 잘못한 사람이 없는데 모든 것이 어긋나 있다. 인연(因緣)이라는 말의 무게를, 떠나보내는 일의 품위로 그려낸다.',
      rating: 4.5,
      branches: [
        { to: 'heojil', reason: '시차가 만들어낸 사랑, 떠나보냄의 품위가 겹친다.' },
        { to: 'hwayang', reason: '“만약 그때”라는 가정을 평생 안고 사는 사람들.' },
        { to: 'cmbyn', reason: '첫 마음의 잔상이 오래 남는다는 점에서.' },
      ],
    },
    parasite: {
      id: 'parasite', type: 'film', title: '기생충',
      sub: '봉준호 · 2019', year: 2019, runtime: 132, hue: 95,
      meta: {
        director: '봉준호',
        cast: ['송강호', '이선균', '조여정', '최우식', '박소담'],
        writer: '봉준호 · 한진원',
      },
      tags: ['블랙코미디', '스릴러', '드라마'],
      summary:
        '반지하의 기택 가족이 부잣집 박 사장 가족에 하나둘 스며든다. 계단을 오르내리는 동선만으로 계급의 수직을 그리고, 웃음이 비명으로 바뀌는 순간을 정확히 안다. 냄새는 끝내 넘을 수 없는 선이었다.',
      rating: 5,
      branches: [
        { to: 'shoplifters', reason: '가짜 가족이 진짜 온기를 품는 아이러니가 통한다.' },
        { to: 'burning', reason: '계급의 분노가 조용히 끓다 터지는 결을 공유한다.' },
        { to: 'poor', reason: '아래에서 위를 올려다보는 시선의 복수극.' },
      ],
    },
    burning: {
      id: 'burning', type: 'film', title: '버닝',
      sub: '이창동 · 2018', year: 2018, runtime: 148, hue: 18,
      meta: {
        director: '이창동',
        cast: ['유아인', '스티븐 연', '전종서'],
        writer: '이창동 · 오정미 · (원작) 무라카미 하루키',
      },
      tags: ['미스터리', '드라마'],
      summary:
        '택배 일을 하는 종수는 어릴 적 동네 친구 해미와, 그가 데려온 정체 모를 남자 벤을 만난다. 사라진 사람과 타버린 비닐하우스, 무엇 하나 분명히 증명되지 않는 분노가 안개처럼 깔린다. 청춘의 무력과 계급의 허기에 관한 미스터리.',
      rating: 4,
      branches: [
        { to: 'parasite', reason: '말없이 쌓인 계급의 분노가 같은 자리에서 끓는다.' },
        { to: 'norwegian', reason: '하루키 특유의 상실과 공허가 원류로 흐른다.' },
        { to: 'drive', reason: '말해지지 않은 것을 오래 견디는 침묵의 영화.' },
      ],
    },
    hwayang: {
      id: 'hwayang', type: 'film', title: '화양연화',
      sub: '花樣年華 · 왕가위 · 2000', year: 2000, runtime: 98, hue: 8,
      meta: {
        director: '왕가위',
        cast: ['양조위', '장만옥'],
        writer: '왕가위',
      },
      tags: ['멜로', '드라마'],
      summary:
        '서로의 배우자가 불륜 관계임을 알게 된 차우와 리첸은, 그들을 닮지 않으려다 끝내 닮아간다. 좁은 복도와 스텝 프린팅의 느린 걸음, 흘러내리는 치파오의 색으로 억눌린 마음을 말한다. 다가가지 못해 더 아름다웠던 한 시절.',
      rating: 5,
      branches: [
        { to: 'heojil', reason: '응시와 거리로 사랑을 완성하는 절제의 미학.' },
        { to: 'past', reason: '끝내 말하지 못한 “만약”을 평생 품는 사람들.' },
        { to: 'cmbyn', reason: '색과 계절로 감정을 번역하는 감각.' },
      ],
    },
    cmbyn: {
      id: 'cmbyn', type: 'film', title: '콜 미 바이 유어 네임',
      sub: 'Call Me by Your Name · 루카 구아다니노 · 2017', year: 2017, runtime: 132, hue: 130,
      meta: {
        director: '루카 구아다니노',
        cast: ['티모시 샬라메', '아미 해머'],
        writer: '제임스 아이보리 · (원작) 안드레 애치먼',
      },
      tags: ['멜로', '성장'],
      summary:
        '1983년 이탈리아의 여름, 열일곱 엘리오는 아버지의 제자 올리버에게 천천히 빠져든다. 복숭아와 살구, 한낮의 권태 속에서 첫사랑은 피어나고 또 끝난다. “네 이름으로 나를 불러줘.” 슬픔을 외면하지 말라는 아버지의 말이 오래 남는다.',
      rating: 4.5,
      branches: [
        { to: 'past', reason: '첫 마음의 잔상이 한 사람의 평생을 물들인다.' },
        { to: 'hwayang', reason: '계절과 색으로 감정을 번역하는 감각이 닮았다.' },
        { to: 'demian', reason: '한 시절을 통과하며 자기 자신이 되어가는 성장.' },
      ],
    },
    shoplifters: {
      id: 'shoplifters', type: 'film', title: '어느 가족',
      sub: '万引き家族 · 고레에다 히로카즈 · 2018', year: 2018, runtime: 121, hue: 60,
      meta: {
        director: '고레에다 히로카즈',
        cast: ['릴리 프랭키', '안도 사쿠라', '마츠오카 마유'],
        writer: '고레에다 히로카즈',
      },
      tags: ['드라마', '가족'],
      summary:
        '좀도둑질로 살림을 잇는 한 가족이 추운 밤 길에서 어린 유리를 데려온다. 피로 맺어지지 않은 이들이 나누는 온기가, 무엇이 가족을 가족이게 하는지 조용히 묻는다. 따뜻함과 서늘함이 끝내 한자리에 있다.',
      rating: 4.5,
      branches: [
        { to: 'parasite', reason: '가짜로 묶인 가족이 진짜 온기를 품는 아이러니.' },
        { to: 'drive', reason: '상실을 견디며 천천히 회복하는 사람들의 속도.' },
        { to: 'almond', reason: '결핍 속에서 관계로 자라나는 마음.' },
      ],
    },
    drive: {
      id: 'drive', type: 'film', title: '드라이브 마이 카',
      sub: 'ドライブ・マイ・カー · 하마구치 류스케 · 2021', year: 2021, runtime: 179, hue: 220,
      meta: {
        director: '하마구치 류스케',
        cast: ['니시지마 히데토시', '미우라 토코'],
        writer: '하마구치 류스케 · (원작) 무라카미 하루키',
      },
      tags: ['드라마'],
      summary:
        '아내를 잃은 연극 연출가 가후쿠는 빨간 사브를 운전하는 과묵한 운전사 미사키와 긴 시간을 함께한다. 다국어로 올리는 「바냐 아저씨」 리허설과 차 안의 침묵이 겹치며, 말하지 못한 슬픔이 천천히 풀린다.',
      rating: 4,
      branches: [
        { to: 'burning', reason: '말해지지 않은 것을 오래 견디는 침묵의 결.' },
        { to: 'norwegian', reason: '상실 이후를 살아내는 하루키적 회복.' },
        { to: 'past', reason: '떠나보낸 사람을 안고 계속 살아가는 일.' },
      ],
    },
    anatomy: {
      id: 'anatomy', type: 'film', title: '추락의 해부',
      sub: 'Anatomie d’une chute · 쥐스틴 트리에 · 2023', year: 2023, runtime: 151, hue: 250,
      meta: {
        director: '쥐스틴 트리에',
        cast: ['산드라 휠러', '스완 아흘로', '밀로 마샤도 그라너'],
        writer: '쥐스틴 트리에 · 아르튀르 아라리',
      },
      tags: ['법정', '미스터리', '드라마'],
      summary:
        '눈 덮인 산장에서 남편이 추락사하고, 소설가 산드라가 유일한 용의자로 법정에 선다. 진실은 끝내 복원되지 않고, 한 결혼의 균열만이 해부된다. 보지 못한 시각장애 아들의 증언이 모든 것을 가른다.',
      rating: 4.5,
      branches: [
        { to: 'heojil', reason: '죽음의 진술을 더듬으며 의심이 자라는 구조.' },
        { to: 'burning', reason: '증명되지 않는 진실을 견디는 긴장.' },
        { to: '1984', reason: '진실과 진술 사이, 무엇을 믿을 것인가.' },
      ],
    },
    /* ───────── 책 ───────── */
    sapiens: {
      id: 'sapiens', type: 'book', title: '사피엔스',
      sub: '유발 하라리 · 김영사', year: 2015, pages: 636, hue: 35,
      meta: {
        author: '유발 하라리',
        translator: '조현욱 옮김',
        publisher: '김영사',
      },
      tags: ['인문', '역사', '과학'],
      summary:
        '인지혁명·농업혁명·과학혁명이라는 세 사건을 축으로, 별 볼 일 없던 한 영장류가 어떻게 지구의 지배종이 되었는지를 추적한다. 화폐·종교·국가를 ‘함께 믿는 허구’로 읽어내는 시선이 통렬하다. 우리가 당연하게 여기는 모든 질서를 낯설게 만든다.',
      rating: 4.5,
      branches: [
        { to: 'homodeus', reason: '인류의 과거에서 미래로, 같은 저자의 시선이 이어진다.' },
        { to: 'cosmos', reason: '거대한 시간 규모로 인간을 재배치하는 쾌감.' },
        { to: '1984', reason: '‘함께 믿는 허구’가 통제가 될 때를 상상하면.' },
      ],
    },
    demian: {
      id: 'demian', type: 'book', title: '데미안',
      sub: '헤르만 헤세 · 민음사', year: 1919, pages: 224, hue: 270,
      meta: {
        author: '헤르만 헤세',
        translator: '전영애 옮김',
        publisher: '민음사',
      },
      tags: ['고전', '성장', '문학'],
      summary:
        '밝은 세계와 어두운 세계 사이에서 흔들리던 싱클레어는 데미안을 만나 알을 깨고 나오는 법을 배운다. “새는 알을 깨고 나온다. 알은 세계다.” 자기 자신에게 이르는 길을, 한 사람의 내면 전쟁으로 그린다.',
      rating: 5,
      branches: [
        { to: 'norwegian', reason: '한 시절을 통과하며 자기 자신이 되어가는 성장.' },
        { to: 'cmbyn', reason: '내면의 깨어남과 첫 통과의례가 겹친다.' },
        { to: 'almond', reason: '감정의 결핍에서 시작해 자아로 자라는 이야기.' },
      ],
    },
    norwegian: {
      id: 'norwegian', type: 'book', title: '노르웨이의 숲',
      sub: '무라카미 하루키 · 민음사', year: 1987, pages: 488, hue: 145,
      meta: {
        author: '무라카미 하루키',
        translator: '양억관 옮김',
        publisher: '민음사',
      },
      tags: ['문학', '성장', '상실'],
      summary:
        '비행기에서 흘러나온 옛 노래에 와타나베는 스무 살의 도쿄로 돌아간다. 죽은 친구가 남긴 연인 나오코와, 삶 쪽으로 손을 내미는 미도리 사이에서 그는 상실을 통과한다. 죽음은 삶의 반대편이 아니라 그 일부로 있다.',
      rating: 4,
      branches: [
        { to: 'demian', reason: '자기 자신이 되어가는 청춘의 통과의례.' },
        { to: 'burning', reason: '하루키의 상실과 공허가 영상으로 번진 자리.' },
        { to: 'drive', reason: '떠난 이를 안고 살아가는 회복의 속도.' },
      ],
    },
    '1984': {
      id: '1984', type: 'book', title: '1984',
      sub: '조지 오웰 · 민음사', year: 1949, pages: 416, hue: 0,
      meta: {
        author: '조지 오웰',
        translator: '정회성 옮김',
        publisher: '민음사',
      },
      tags: ['고전', 'SF', '디스토피아'],
      summary:
        '빅 브라더가 모든 것을 감시하는 오세아니아에서, 윈스턴은 금지된 기록과 사랑으로 체제에 균열을 낸다. 언어를 줄여 사고를 가두는 ‘신어’와 ‘이중사고’의 무게가 끔찍하도록 정교하다. 2+2=5를 믿게 만드는 권력에 관하여.',
      rating: 4.5,
      branches: [
        { to: 'sapiens', reason: '‘함께 믿는 허구’가 통제 장치가 되는 극단.' },
        { to: 'anatomy', reason: '진실과 진술 사이에서 무엇을 믿을 것인가.' },
        { to: 'homodeus', reason: '데이터가 권력이 되는 미래의 다른 얼굴.' },
      ],
    },
    homodeus: {
      id: 'homodeus', type: 'book', title: '호모 데우스',
      sub: '유발 하라리 · 김영사', year: 2017, pages: 636, hue: 48,
      meta: {
        author: '유발 하라리',
        translator: '김명주 옮김',
        publisher: '김영사',
      },
      tags: ['인문', '미래', '과학'],
      summary:
        '기아·역병·전쟁을 어느 정도 길들인 인류의 다음 의제는 불멸·행복·신성이라고 하라리는 말한다. 데이터교(敎)와 알고리즘이 자유의지의 신화를 해체하는 미래를, 도발적으로 펼친다. 신이 되려는 사피엔스의 자화상.',
      rating: 4,
      branches: [
        { to: 'sapiens', reason: '인류의 과거에서 미래로 이어지는 한 권의 다음 장.' },
        { to: '1984', reason: '데이터가 권력이 되는 미래의 다른 얼굴.' },
        { to: 'cosmos', reason: '인간을 우주적 규모에 다시 놓는 시선.' },
      ],
    },
    cosmos: {
      id: 'cosmos', type: 'book', title: '코스모스',
      sub: '칼 세이건 · 사이언스북스', year: 1980, pages: 720, hue: 235,
      meta: {
        author: '칼 세이건',
        translator: '홍승수 옮김',
        publisher: '사이언스북스',
      },
      tags: ['과학', '천문', '교양'],
      summary:
        '“우리는 별의 먼지로 만들어졌다.” 칼 세이건은 우주의 탄생부터 생명의 진화, 인간 지성의 모험까지를 시인의 언어로 잇는다. 광막한 시공간 앞에서 겸손과 경외를 동시에 일깨우는, 과학적 상상력의 고전.',
      rating: 5,
      branches: [
        { to: 'sapiens', reason: '거대한 규모로 인간을 재배치하는 쾌감이 닮았다.' },
        { to: 'homodeus', reason: '우주적 시선에서 인류의 다음을 묻는다.' },
        { to: 'almond', reason: '광막함 앞에서 더 또렷해지는 한 사람의 마음.' },
      ],
    },
    almond: {
      id: 'almond', type: 'book', title: '아몬드',
      sub: '손원평 · 창비', year: 2017, pages: 264, hue: 320,
      meta: {
        author: '손원평',
        publisher: '창비',
      },
      tags: ['소설', '성장', '청소년'],
      summary:
        '감정을 느끼지 못하는 소년 윤재는 끔찍한 사고로 가족을 잃고, 분노로 가득한 곤이를 만난다. 두려움도 공감도 배워본 적 없던 아이가 타인을 통해 마음을 ‘배워’ 간다. 괴물은 누구이고, 사람은 어떻게 사람이 되는가.',
      rating: 4,
      branches: [
        { to: 'demian', reason: '결핍에서 출발해 자아로 자라는 성장의 형식.' },
        { to: 'shoplifters', reason: '피가 아닌 관계로 마음이 자라는 이야기.' },
        { to: 'cmbyn', reason: '처음 배우는 감정의 떨림.' },
      ],
    },
    poor: {
      id: 'poor', type: 'film', title: '가여운 것들',
      sub: 'Poor Things · 요르고스 란티모스 · 2023', year: 2023, runtime: 141, hue: 290,
      meta: {
        director: '요르고스 란티모스',
        cast: ['엠마 스톤', '마크 러팔로', '윌렘 더포'],
        writer: '토니 맥나마라 · (원작) 알래스데어 그레이',
      },
      tags: ['판타지', '블랙코미디', '성장'],
      summary:
        '되살아난 벨라 백스터는 갓난아이의 뇌로 어른의 몸을 입은 채 세상으로 뛰어든다. 수치도 규범도 배우기 전, 그는 욕망과 지성을 거리낌 없이 탐한다. 한 여성의 자유를 향한 기괴하고 찬란한 성장담.',
      rating: 4,
      branches: [
        { to: 'demian', reason: '규범의 알을 깨고 자기 자신이 되어가는 여정.' },
        { to: 'parasite', reason: '계급과 위선을 비트는 블랙코미디의 칼날.' },
        { to: 'almond', reason: '세상을 처음 배우는 자의 시선.' },
      ],
    },
  };

  // 홈 메인 추천: 평가 전부를 취합했다는 설정. 영화·책 트랙을 분리.
  const HOME = {
    heroFilm: {
      to: 'hwayang',
      reason:
        '«헤어질 결심»과 «패스트 라이브즈»에 높은 별을 주셨네요. 닿지 못한 거리를 응시로 버티는 그 절제의 원류로 «화양연화»를 권합니다.',
      basis: ['heojil', 'past'],
    },
    heroBook: {
      to: 'homodeus',
      reason:
        '«사피엔스»를 인상 깊게 보셨죠. 그 과거의 시선이 미래로 이어지는 다음 장입니다.',
      basis: ['sapiens'],
    },
    films: [
      {
        to: 'drive',
        reason:
          '«버닝»의 침묵과 «노르웨이의 숲»의 상실을 좋아하셨다면, 슬픔을 천천히 풀어내는 이 긴 호흡이 맞습니다.',
        basis: ['burning', 'norwegian'],
      },
      {
        to: 'shoplifters',
        reason:
          '«기생충»에서 가족이라는 위태로운 단위에 끌리셨다면, 그 따뜻한 이면을 보여줍니다.',
        basis: ['parasite'],
      },
      {
        to: 'poor',
        reason:
          '«데미안»의 “알을 깨는” 성장에 5★을 주셨습니다. 그 은유를 가장 기괴하고 찬란하게 밀어붙인 영화입니다.',
        basis: ['demian'],
      },
      {
        to: 'anatomy',
        reason:
          '«헤어질 결심»처럼 죽음의 진술을 더듬는 의심의 구조를 좋아하신다면, 한 결혼이 법정에서 해부됩니다.',
        basis: ['heojil'],
      },
    ],
    books: [
      {
        to: 'cosmos',
        reason:
          '«사피엔스»의 거대한 시간 규모가 좋으셨다면, 인간을 우주적 척도에 다시 놓는 이 고전이 같은 쾌감을 줍니다.',
        basis: ['sapiens'],
      },
      {
        to: 'norwegian',
        reason:
          '«데미안»의 통과의례와 «버닝»의 상실, 그 둘이 만나는 자리에 하루키의 청춘이 있습니다.',
        basis: ['demian', 'burning'],
      },
      {
        to: '1984',
        reason:
          '«사피엔스»가 말한 ‘함께 믿는 허구’가 통제가 될 때를 가장 정교하게 그린 디스토피아입니다.',
        basis: ['sapiens'],
      },
      {
        to: 'almond',
        reason:
          '«데미안»처럼 결핍에서 출발해 자아로 자라는 이야기. 더 가깝고 단단한 목소리로.',
        basis: ['demian'],
      },
    ],
  };

  // 최근 평가 활동(홈 사이드/상태용)
  const RECENT = ['heojil', 'demian', 'sapiens', 'parasite', 'cmbyn', 'cosmos'];

  window.PICK = { works: W, home: HOME, recent: RECENT,
    list: Object.values(W) };
})();
