// 피드 큐레이션 스냅샷 — Claude Code Routine 주간 생성 (작업지시서 §4 "사전 생성 스냅샷").
// 앱은 이 스냅샷만 읽음. 재생성: 루틴이 신규+기존 어구록을 읽고 같은 단어·AI의 발견을 갱신 → 커밋·배포.
// 갱신: 2026-06-28 주간 큐레이션, 어구록 1000개 기준.
export const CURATION = {
  "generatedAt": "2026-06-28",
  "clusters": [
    {
      "word": "시간",
      "count": 261,
      "books": 83,
      "quotes": [
        "eb23f31f-3957-4336-a86b-1049a56514cc",
        "d9bdf88e-2609-4b4b-a05e-8e59016013fe",
        "250efa73-8d58-4d54-bd58-623b2b0b0af1",
        "b0cd50bb-378f-4168-abbc-3b3310d835c9",
        "d7f9d822-7ca2-4523-b081-c5cea57fa883",
        "7eb53e9a-f8af-495f-a3c1-c3569f54de58"
      ]
    },
    {
      "word": "돈",
      "count": 195,
      "books": 68,
      "quotes": [
        "a291604f-8842-41c3-96d0-5150c97e566e",
        "5e9c2220-65bd-4b88-b960-edb332c692f2",
        "e4d0ceec-df62-4c39-bc3f-315c11dd50eb",
        "53dc7191-3d20-43c0-8cc9-aeca68557ccb",
        "8cc634b6-60f1-4a1f-9a4a-c70469d9cbca",
        "0178f092-c31d-428f-8baf-8ccbfbfa1181"
      ]
    },
    {
      "word": "행복",
      "count": 141,
      "books": 53,
      "quotes": [
        "582ae03a-b063-4a47-b54e-ac4e90421fb5",
        "baa9da37-b0f7-48b5-9a21-2c82080f72f0",
        "66137aeb-a050-499f-9dfd-bb6f0390a0e7",
        "5d003b33-7e7e-43ad-988e-08f6edb8d449",
        "46aa860f-fa12-4412-9494-89551bd8391b",
        "1038e45a-569f-4b4a-b714-f50e05336ae6"
      ]
    },
    {
      "word": "관계",
      "count": 141,
      "books": 59,
      "quotes": [
        "36cb6e0a-03c2-4db3-8ee8-3900acf2d0a0",
        "94cfcf22-b969-4fb3-bf97-d4f20d312938",
        "638ab69d-69db-4eaf-81ae-5870b59b8d68",
        "ad036f8e-f7f4-4dd7-aa20-766f993eaa81",
        "9df4ba35-3b20-4ebe-b1e6-bedc77dc4031",
        "9b9d8864-0850-4c6e-b91f-ecd4a5e8aab0"
      ]
    },
    {
      "word": "습관",
      "count": 74,
      "books": 43,
      "quotes": [
        "f2d2cc1b-f55d-45d2-8c31-7f27fcf7074a",
        "a03c10e9-497a-47d8-ba00-786f424ce7fe",
        "59710cc8-69ca-4690-92c7-25201b9f4656",
        "061fd147-5515-4bfc-a9ec-bfbe70d288dc",
        "5f7fa97c-dde3-45a4-906a-9b6a6663eae0",
        "c3ed0df0-c482-4c32-8b63-3fa4155d3377"
      ]
    },
    {
      "word": "두려움",
      "count": 56,
      "books": 34,
      "quotes": [
        "1cc69bfc-f94b-4ce2-a22c-9fc130552ec2",
        "8b83c1e6-e44c-4499-a35a-fb1753e65d63",
        "d8e32334-988b-40ec-b9c9-b1df2d707367",
        "1ea819b9-446c-4c7a-ba61-80cdc28728e3",
        "9db7188c-a022-4783-8e9b-9f388b3438be",
        "3ef90144-b147-4988-b722-ac05e43d011e"
      ]
    }
  ],
  "echoes": [
    {
      "keyword": "돈이 덜어주는 슬픔",
      "note": "돈은 기쁨을 더하기보다 슬픔을 덜어주고, 그 슬픔은 미래를 설계하는 힘마저 앗아갑니다 — 두 책이 슬픔과 돈의 연결을 짚습니다.",
      "a": "a291604f-8842-41c3-96d0-5150c97e566e",
      "b": "e66006d7-d2a4-49cc-bd3f-e3fc3b66be32"
    },
    {
      "keyword": "미룸의 정체",
      "note": "미룰수록 성공은 멀어지지만 그 뿌리는 시간 관리가 아니라 감정 — 두 책이 ‘왜 시작하지 못하는가’를 함께 풀어냅니다.",
      "a": "d7f9d822-7ca2-4523-b081-c5cea57fa883",
      "b": "d07e7a5f-88fe-4c19-ae72-6478a570f6b5"
    },
    {
      "keyword": "존재를 받아주는 일",
      "note": "사람을 일으키는 것은 충고가 아니라 ‘너는 옳다’며 존재 자체를 받아주는 한 사람 — 심리상담과 회복탄력성 연구가 같은 결론에 닿습니다.",
      "a": "4b39753d-40cf-489d-8dd3-666d0d189deb",
      "b": "6c72cc95-e431-454e-b50f-1e55c4b8197b"
    }
  ]
};
export default CURATION;
