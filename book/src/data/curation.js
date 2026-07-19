// 피드 큐레이션 스냅샷 — Claude Code Routine 주간 생성 (작업지시서 §4 "사전 생성 스냅샷").
// 앱은 이 스냅샷만 읽음. 재생성: 루틴이 신규+기존 어구록을 읽고 같은 단어·AI의 발견을 갱신 → 커밋·배포.
// 갱신: 2026-07-19 주간 큐레이션, 어구록 1000개 기준.
export const CURATION = {
  "generatedAt": "2026-07-19",
  "clusters": [
    {
      "word": "시간",
      "count": 561,
      "books": 83,
      "quotes": [
        "eb23f31f-3957-4336-a86b-1049a56514cc",
        "d7f9d822-7ca2-4523-b081-c5cea57fa883",
        "00914d6f-f9a6-45b6-8aad-599c5f5d1bf2",
        "54121eb7-d786-4c12-9ec8-6b5b73fc65b8",
        "e7fed08a-9569-44b9-881c-a086f88ae0bd",
        "7aa9a813-02c6-4008-bbf8-dad2436a1a39"
      ]
    },
    {
      "word": "마음",
      "count": 409,
      "books": 79,
      "quotes": [
        "00305ac5-57cf-45a8-9057-ef718bf693ca",
        "6034bcb8-8d4c-4356-b681-849d12b401b5",
        "91556e73-3a4b-487d-82ed-ba7bf36a3ae1",
        "300dc921-6ead-4b22-8036-201f37cc8465",
        "2b1c81af-bcd2-4c20-836f-c9f1de3713a0",
        "99c437bb-3852-496c-8e05-dee8414769a2"
      ]
    },
    {
      "word": "관계",
      "count": 297,
      "books": 59,
      "quotes": [
        "94cfcf22-b969-4fb3-bf97-d4f20d312938",
        "638ab69d-69db-4eaf-81ae-5870b59b8d68",
        "36cb6e0a-03c2-4db3-8ee8-3900acf2d0a0",
        "9df4ba35-3b20-4ebe-b1e6-bedc77dc4031",
        "689dce85-3f57-4258-bfa7-dfe0ace2710d",
        "3c42e7c0-faaa-4d2e-88ac-d9b276f79003"
      ]
    },
    {
      "word": "선택",
      "count": 284,
      "books": 62,
      "quotes": [
        "e9f5f8bf-486b-492a-8a26-ec80184800f9",
        "5d003b33-7e7e-43ad-988e-08f6edb8d449",
        "0172ad1d-c6e2-4c3b-baa7-065dfda4faa2",
        "b8c6451f-da52-4a7d-8152-15e5f10b1f1e",
        "0d0cc549-83ea-4e6e-b585-3f1f7b8ea865",
        "7f4d6d0e-395b-4e88-bb3f-e81e7f632ad7"
      ]
    },
    {
      "word": "의미",
      "count": 252,
      "books": 68,
      "quotes": [
        "56505317-8389-48c6-8c29-8c5f8a3f7b74",
        "37b210e2-6b86-4c5b-9100-00f406e3dcf0",
        "2d989833-7459-4a1c-bd98-aac7650df29f",
        "e684d912-3de3-4b53-b25a-1d75693f4de4",
        "f33dd721-33fd-4c76-b3f2-16f89b74cd84",
        "a848e773-6813-490a-9c18-9cd7bfe78915"
      ]
    },
    {
      "word": "두려움",
      "count": 110,
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
      "keyword": "견딤의 축적",
      "note": "내가 선택해 견딘 작은 고통도, 하루 30분의 시간도, 쌓여야 비로소 나를 만든다.",
      "a": "e9f5f8bf-486b-492a-8a26-ec80184800f9",
      "b": "eb23f31f-3957-4336-a86b-1049a56514cc"
    },
    {
      "keyword": "미룸의 대가",
      "note": "'다음에 하지'라며 미루는 순간, 원하던 것에 닿는 시간은 그만큼 멀어진다.",
      "a": "d7f9d822-7ca2-4523-b081-c5cea57fa883",
      "b": "f33dd721-33fd-4c76-b3f2-16f89b74cd84"
    },
    {
      "keyword": "두려움을 제쳐두기",
      "note": "시장을 움직이는 두려움도 개인을 붙잡는 두려움도, 제쳐둘 줄 아는 사람이 앞선다.",
      "a": "d8e32334-988b-40ec-b9c9-b1df2d707367",
      "b": "8b83c1e6-e44c-4499-a35a-fb1753e65d63"
    }
  ]
};
export default CURATION;
