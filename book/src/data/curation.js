// 피드 큐레이션 스냅샷 — Claude Code Routine 주간 생성 (작업지시서 §4 "사전 생성 스냅샷").
// 앱은 이 스냅샷만 읽음. 재생성: 루틴이 신규+기존 어구록을 읽고 같은 단어·AI의 발견을 갱신 → 커밋·배포.
// 갱신: 2026-08-23 주간 큐레이션, 어구록 1489개 기준.
export const CURATION = {
  "generatedAt": "2026-08-23",
  "clusters": [
    {
      "word": "시간",
      "count": 581,
      "books": 88,
      "quotes": [
        "e9110f05-01c3-4ba1-aa53-ee8ded4b103d",
        "8c45aea6-2ce3-4ba0-864d-0d962423815b",
        "ec900225-8ca1-44c6-b47d-fbea69559566",
        "823ab203-27c3-473e-993a-f6c6e53abb79",
        "6f057642-8eb3-4c48-8f5d-b8962bac314e",
        "f0921373-3712-4af8-a4d3-86d860a442d2"
      ]
    },
    {
      "word": "돈",
      "count": 789,
      "books": 71,
      "quotes": [
        "71dee239-829b-4244-9510-5b4518ca78bf",
        "c36e8e41-232d-4e7d-81df-d7082bdae18f",
        "4231a704-946d-4736-905d-ad70ded702bf",
        "6f70e22a-ded7-451e-914e-593d35509ffa",
        "0149b4c4-fd8d-48b5-bcb3-79bed0cb33d6",
        "7878fef5-ef18-48fc-9bd0-33ea6bd189d5"
      ]
    },
    {
      "word": "감정",
      "count": 495,
      "books": 61,
      "quotes": [
        "6bd109cf-fcf9-436d-be65-d240ae0e6b7a",
        "4cb7c76e-13b4-4bb0-a896-919b6839dd8b",
        "1ee6bec5-fe52-4c4b-ac81-a430c4375f9a",
        "d296d8cb-50a8-4011-9a7f-fc343ca59493",
        "edd4e61a-99b6-42eb-b973-ec5b14617c15",
        "34a0086d-f15f-4442-ac78-138199554bba"
      ]
    },
    {
      "word": "이야기",
      "count": 419,
      "books": 61,
      "quotes": [
        "b31f7597-f4e0-4a9c-9ad9-cc92de17fde3",
        "35bafee9-8a4c-4ce0-b4e0-61866b8a31e5",
        "4512279c-3e8d-4e28-8844-9e72998bcdc1",
        "bfa39757-dbcc-4a08-94b9-71cf4c7dac3e",
        "2daa9381-50ff-4dfd-8bc6-d6e94e1d51af",
        "e3f613f8-483c-4a8c-b453-301cd97bd90c"
      ]
    },
    {
      "word": "관계",
      "count": 335,
      "books": 67,
      "quotes": [
        "9d8e7df9-f1ed-42cd-be3f-740ed86da014",
        "765a2bb4-dbf0-493b-8b0d-55be7ab732d7",
        "81fe3496-026d-4027-9854-6557c39ffe60",
        "213cfd2d-0c04-4fe4-9084-2705aa8b3703",
        "de59c7b4-1ac9-4641-a376-9e91a7f1fdd9",
        "8a9ca91e-55a7-4218-8649-67fe5a5b7327"
      ]
    },
    {
      "word": "실패",
      "count": 275,
      "books": 49,
      "quotes": [
        "8f5b70c4-5f06-4d6d-8125-70c3da0c32db",
        "199ea9dc-1730-4923-9ad4-0366f8fb7bee",
        "889b286c-6601-41bc-b6dc-b16a53e6a31f",
        "b998dbef-1717-47a2-8a7e-20f4421d1d3a",
        "6eda2e91-b348-41a0-a053-b6f3dce9e589",
        "535860ea-2aad-40c3-8142-9f52c0d163d9"
      ]
    }
  ],
  "echoes": [
    {
      "keyword": "나는 내가 지어낸 이야기다",
      "note": "한쪽은 뇌가 자신을 옳고 좋은 사람으로 그리는 이야기를 쉬지 않고 짓는다 말하고, 다른 쪽은 그 지어낸 이야기를 정체성으로 삼는 순간 몸을 지키듯 그것을 방어하게 된다고 말한다.",
      "a": "b31f7597-f4e0-4a9c-9ad9-cc92de17fde3",
      "b": "e568b38b-d539-42f4-9802-aa6810b79792"
    },
    {
      "keyword": "누른 감정은 줄지 않고 압축된다",
      "note": "감정을 느끼지 말라는 요구는 감정을 없애지 못해, 한쪽에서는 화병과 약자를 향한 폭발로 다른 쪽에서는 더 강렬해진 부정 감정으로 되돌아온다.",
      "a": "f2937021-00dd-4426-89ad-c0d49780b7f3",
      "b": "8a3e2541-6a1b-40c1-a2ba-57194f63f5cc"
    },
    {
      "keyword": "돈으로 사는 것은 결국 시간",
      "note": "한쪽은 출퇴근에 흘리는 두 시간을 월세로 되사라 하고, 다른 쪽은 가장 한정된 자원이 시간임을 깨달아 돈을 시간으로 바꾸라 한다.",
      "a": "0ffd9889-cdc7-465a-ab14-5a6897f062ac",
      "b": "abebe9b5-d55b-4811-88ca-ca1b32918a8d"
    }
  ]
};

export default CURATION;
