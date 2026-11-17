// 교차로·신호·차로 0 기준 시험(재작업 W20, 설계 문서 45절), 씨앗 11. 몸통은 test/junction-zero.ts.
// 재작업 W22: 보행 초록 횡단보도 면 위 차와 신호 횡단보도 면 위에 선 차도 0 이어야 한다.
// 재작업 W23: 앱과 같은 길 정본(road.json) 차로로 잰다. 재작업 W25: 씨앗 12·13 도 같은 0 을 요구한다(w25-junction-s12·s13), W23 이 남겨 둔 수(LEFT)는 없앴다.
import { junctionZero } from './junction-zero.ts';

junctionZero(11);
