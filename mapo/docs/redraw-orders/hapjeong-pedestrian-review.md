# 합정 사거리 보행자 시험 · Claude 검수 요청

2026년 11월 23일 기준. 마포앱 합정 사거리에서 보행자 3명과 승용차 5대·버스 1대를 함께 재생했다. 세 사람 모두 도착했다. 다음 검수에서는 남은 보도 단절 두 곳과 버스 유도선 겹침을 우선 봐 달라. 링크는 지오의 작업 컴퓨터에서 실행 중인 5198 서버를 가리킨다.

## 먼저 확인할 곳

| 위치 | 확인된 사실 | 검수 요청 |
| --- | --- | --- |
| 횡단면 0020 | 횡단보도 한쪽 끝에서 전방의 측량 보도까지 5.32m가 빈다. 반대편 끝은 연결돼 있다. | 빈 구간의 항공사진과 도로·보도 경계를 대조해 걸어갈 수 있는 폭과 위치를 확인해 달라. |
| 서쪽 외곽 0006 | 도색이 보이고 양쪽 인도로 건널 수 있다. 이번 시험 범위 안에서 중앙 사거리까지 이어지는 보행면을 찾지 못했다. | 외곽 보도가 어디서 끊기는지, 범위 안에서 우회할 길이 있는지 확인해 달라. |
| 동쪽 0003과 서울시 단독 후보 06-0000001287 | 0003은 수치지형도와 서울시 면이 일치해 표시했다. 항공사진에서는 차량과 그림자가 가린다. 1287은 사진의 청색 면과 흰 표식만으로 횡단보도를 식별하기 어려워 추가하지 않았다. | 두 곳은 사진 판독을 별도로 부탁한다. |
| 버스의 교차로 통과 | 버스 차체와 왼쪽 흰 점선 유도선이 최대 0.116㎡ 겹친다. 직진 시험 30.22~31.40초에 볼 수 있다. 연결이 확인된 버스전용 출구는 15.76m에서 끝난다. | 전체 재생에서 버스 회전 자세와 유도선 위치를 대조해 달라. |

[횡단면별 원측정](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/crossing-fix/check.txt) · [0006 사진](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/crossing-fix/photo-west-check.png) · [0003 사진](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/crossing-fix/photo-east-check.png) · [1287 사진](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/crossing-fix/photo-seoul-only.png) · [버스가 나오는 전체 재생](http://localhost:5198/apps/mapo/hapjeong-hd.html?signalTrial=straight)

## 실제 보행 재생

같은 시각의 세 사람을 각각 가까이 볼 수 있다. 아래 번호는 수치지형도 횡단면 ID 끝 네 자리다. [보행 영상 세 편](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/pedestrians/index.html)

| 보행자 | 녹색에 진입한 시각 | 도착 | 차량과 최소 간격 |
| --- | --- | --- | --- |
| 1 · 서쪽 건물 옆, 0041 → 가운데 보도 → 0028 → 바깥 인도 | 7.02초, 31.02초 | 38.68초 | 4.61m |
| 2 · 남동쪽 골목, 0034 → 가운데 보도 → 0035 → 바깥 인도 | 7.02초, 31.02초 | 39.27초 | 27.47m |
| 3 · 0032 → 합정역 남쪽 중앙 승강장 안 | 31.02초 | 57.48초 | 2.09m |

- **화면에서 대조할 순서.** 5초에는 세 사람이 모두 적색을 기다린다. 8초에는 1·2번이 첫 횡단을 하고 3번은 승강장 맞은편에서 대기한다. 32초에는 세 사람 모두 횡단 중이다. 40초에는 1·2번이 도착해 있고, 58초에는 3번도 승강장 안에 있다. [서쪽 재생](http://localhost:5198/apps/mapo/hapjeong-hd.html?pedestrians=1&view=west) · [남동쪽 재생](http://localhost:5198/apps/mapo/hapjeong-hd.html?pedestrians=1&view=southeast) · [중앙 승강장 재생](http://localhost:5198/apps/mapo/hapjeong-hd.html?pedestrians=1&view=platform)
- **수치 검사.** 차량 신호 한 순환 61.75초를 60Hz로 검사했다. 3,706개 시점에서 보행자 반경 0.25m가 허용된 보도·횡단면을 벗어난 경우, 적색에 새로 진입한 경우, 사람끼리 또는 차와 접촉한 경우는 모두 0건이었다. 각 시점 사이의 최대 이동은 2.25cm였다. 다섯 번의 횡단 모두 적색 대기 후 출발했고, 이미 건너던 사람이 진입 신호 종료 후에도 건넘을 마치는 동작을 확인했다. [실제 재생 상태 검사](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/pedestrians/check.txt)
- **해석 범위.** 보행 속도는 1.35m/s이며 보행 신호는 시험용이다. 기존 차량 시험의 정해진 움직임을 같은 시간축에서 미리 대조해, 횡단 중 차량이 점유하는 경로에는 출발을 허용하지 않는다. 첫 두 경로는 시험 차량과 동선이 겹치지 않는다. 승강장 경로의 0032에는 버스 1대와 승용차 3대가 한 순환 중 다른 시각에 같은 횡단 공간을 사용한다. 결과는 이 세 보행 경로와 차량 배치에서 검증했다. 세 번째 보행자의 목적지는 승강장 안 대기 위치다. 버스 승하차, 실제 신호 주기, 임의 출발지에서의 경로 찾기는 이번 시험 범위 밖이다.

## 바닥에서 바꾼 것과 확인 범위

- 지오가 지적한 서쪽 두 곳과 남동쪽 두 곳은 모두 항공사진·수치지형도·서울시 자료에서 확인했다. 정밀도로지도 B3에 해당 횡단보도가 없어 기존의 ‘37면에 줄이 그려졌다’는 검사에서 빠졌다. 합정 전체를 다시 대조해 기존 37개 도색 면에 9개를 보완했다. [서쪽 전후 비교](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/crossing-fix/comparison-west.png) · [남동쪽 전후 비교](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/crossing-fix/comparison-southeast.png)
- 보행 연결성은 수치지형도의 물리적 횡단면 23개를 기준으로 셌다. 양끝 46개 중 44개는 보도, 1개는 바로 다음 횡단면에 이어지고 1개는 0020의 공백이다. 중앙 사거리까지 이어진 횡단면은 22개다. 한쪽 끝의 접속과 중앙 사거리까지의 도달성은 각각 검사했다. [양끝과 중앙 연결 검사](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/crossing-fix/check.txt)
- 남쪽 중앙 승강장 옆 긴 띠 61.5㎡를 보행면에 포함했다. 두 정지선 사이 작은 홈에는 버스 차체가 지나간다. 횡단보도와 인도에 얼룩처럼 보이던 바닥 겹침은 깊이 표시 순서를 수정하고 16비트 화면에서도 확인했다. [승강장과 항공사진](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/floor-fix/after-platform.png) · [화면 검사](http://localhost:5198/apps/mapo/tmp/hapjeong-hd/floor-fix/pixels.txt)

독립 검수 때는 `~/apps/mapo`에서 아래 두 검사를 실행하면 바닥의 양끝 연결과 실제 주행 결과를 각각 재현할 수 있다.

```sh
tools/.venv/bin/python tools/v2/check_hapjeong_hd_a.py
tools/.venv/bin/python tools/v2/check_hapjeong_pedestrians.py
```

