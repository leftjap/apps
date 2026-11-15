// 지하철 출구마다 실제 모양. 서울교통공사 출구(2·6호선)는 서울교통공사_외부출입구_캐노피_설치정보(OA-22449, 2025-08-05 기준,
// 서울 열린데이터광장, 공공누리 제1유형)의 캐노피 종류와 출입구 폭을 쓰고, 공항철도·경의중앙선 출구는 자료가 없어 로드뷰로 정했다.
// 모양은 출구마다 카카오맵 로드뷰(2026-06 촬영)를 출구 쪽으로 돌려 대조했다(참고만 하고 사진은 저장하지 않는다).
// 길이는 항공사진·로드뷰에서 어림한 값이다.

/**
 * 출구 모양:
 *  - open: 지붕 없는 개방형 계단(낮은 화강석 벽과 난간). 캐노피 '미설치'
 *  - old: 화강석 낮은 벽 위에 기둥으로 얇은 평지붕을 얹고 옆이 트인 1984년형, 띠 간판. 캐노피 '구형'
 *  - vault: 유리 옆벽에 은색 테의 둥근(반원통) 유리 지붕. 캐노피 '신형'(2000년 둘레)
 *  - box: 진회색 틀, 유리 옆벽, 평지붕, 띠 간판. 캐노피 '표준형'(2010년 이후)
 *  - slim: 얇은 틀의 유리 옆벽, 계단을 따라 낮아지는 지붕. 캐노피 '도시형'(2016년 이후)
 *  - kiosk: 작은 건물 같은 상자(불투명 벽, 평지붕). 캐노피 '기타'
 *  - grand: 공항철도·경의중앙선의 크고 넓은 유리 반원통(강철 트러스, 유리에 큰 노란 번호), 에스컬레이터가 붙은 넓은 출구
 */
export type ExitKind = 'open' | 'old' | 'vault' | 'box' | 'slim' | 'kiosk' | 'grand';

export interface ExitLook {
  kind: ExitKind;
  /** 출입구 폭(m) */
  w: number;
  /** 지상 구조물 길이(m, 어림) */
  l: number;
  /** 모양을 정한 근거 */
  src: 'OA-22449' | '로드뷰';
  /** 로드뷰로 모양을 확인했는가: 'yes' 확인, 'part' 일부만 보임, 'no' 가려져 확인 못 함(미확인) */
  seen: 'yes' | 'part' | 'no';
}

/** 모양별 기본 길이(m) */
const LEN: Record<ExitKind, number> = { open: 7, old: 9, vault: 10, box: 9, slim: 10, kiosk: 5, grand: 14 };
const oa = (kind: ExitKind, w: number, seen: ExitLook['seen']): ExitLook => ({ kind, w, l: LEN[kind], src: 'OA-22449', seen });
const rv = (kind: ExitKind, w: number, l: number, seen: ExitLook['seen']): ExitLook => ({ kind, w, l, src: '로드뷰', seen });

/** '역:출구 번호' → 모양 */
export const EXIT_LOOKS: Record<string, ExitLook> = {
  '망원:1': oa('kiosk', 2.04, 'yes'),
  '망원:2': oa('kiosk', 2.04, 'yes'),
  '합정:1': oa('old', 2.81, 'yes'),
  '합정:2': oa('vault', 3.44, 'yes'),
  '합정:3': oa('old', 2.8, 'yes'),
  '합정:4': oa('old', 2.76, 'part'),
  '합정:5': oa('vault', 1.5, 'yes'),
  '합정:6': oa('box', 3.0, 'yes'), // 자료의 폭이 비어 있다(2024 신설)
  '합정:7': oa('box', 3.0, 'no'), // 자료의 폭이 비어 있다(2024 신설)
  '합정:8': oa('box', 2.8, 'yes'),
  '합정:9': oa('box', 3.25, 'no'), // 메세나폴리스 관리
  '합정:10': oa('box', 3.3, 'no'), // 메세나폴리스 관리
  '홍대입구:1': oa('box', 3.17, 'part'),
  '홍대입구:2': oa('box', 3.07, 'yes'),
  '홍대입구:8': oa('old', 3.19, 'yes'),
  '홍대입구:9': oa('old', 3.82, 'part'),
  '홍대입구:3': rv('grand', 6.5, 14, 'yes'),
  '홍대입구:4': rv('grand', 6.5, 14, 'yes'),
  '홍대입구:5': rv('grand', 6.5, 14, 'yes'),
  '홍대입구:6': rv('grand', 6.5, 14, 'yes'),
  '홍대입구:7': rv('grand', 6.5, 14, 'yes'),
  '신촌:1': oa('box', 4.1, 'yes'),
  '신촌:2': oa('box', 4.1, 'yes'),
  '신촌:3': oa('box', 4.1, 'yes'),
  '신촌:4': oa('box', 4.1, 'yes'),
  '신촌:5': oa('old', 3.5, 'yes'),
  '신촌:6': oa('box', 5.1, 'no'),
  '신촌:7': oa('box', 5.1, 'yes'),
  '신촌:8': oa('old', 3.5, 'yes'),
  '상수:1': oa('open', 2.4, 'yes'),
  '상수:2': oa('box', 2.4, 'yes'),
  '상수:3': oa('vault', 4.2, 'yes'),
  '상수:4': oa('slim', 2.4, 'yes'),
  '광흥창:1': oa('slim', 2.4, 'yes'),
  '광흥창:2': oa('box', 2.42, 'yes'),
  '광흥창:3': oa('slim', 2.45, 'yes'),
  '광흥창:4': oa('slim', 2.43, 'yes'),
  '광흥창:5': oa('box', 2.42, 'yes'),
  '광흥창:6': oa('slim', 2.43, 'yes'),
  '마포구청:3': oa('vault', 3.1, 'no'),
  '마포구청:4': oa('vault', 2.9, 'yes'),
  '마포구청:5': oa('vault', 2.6, 'yes'),
  '마포구청:6': oa('kiosk', 2.72, 'no'),
  '마포구청:7': oa('open', 1.89, 'yes'),
  '가좌:1': rv('grand', 5, 11, 'yes'),
  '가좌:2': rv('grand', 5, 11, 'yes'),
  '가좌:4': rv('grand', 5, 11, 'yes'),
  '서강대:1': rv('grand', 5, 11, 'yes'),
  '서강대:2': rv('grand', 5, 11, 'no'), // 나무에 가려 보이지 않아 같은 노선 출구 모양으로 어림
};

/** 출구의 모양(자료에 없으면 표준형) */
export const exitLook = (station: string, ref: string): ExitLook => EXIT_LOOKS[`${station}:${ref}`] ?? oa('box', 3, 'no');
