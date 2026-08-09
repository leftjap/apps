// 피드 큐레이션 스냅샷 — Claude Code Routine 주간 생성 (작업지시서 §4 "사전 생성 스냅샷").
// 앱은 이 스냅샷만 읽음. 재생성: 루틴이 신규+기존 어구록을 읽고 같은 단어·AI의 발견을 갱신 → 커밋·배포.
// 갱신: 2026-08-09 주간 큐레이션, 어구록 1496개 기준.
export const CURATION = {
  "generatedAt": "2026-08-09",
  "clusters": [
    {
      "word": "돈",
      "count": 817,
      "books": 73,
      "quotes": [
        "251aa51b-d12f-4b63-a38c-132a01edcb9b",
        "c36e8e41-232d-4e7d-81df-d7082bdae18f",
        "40f2e97f-5494-4b36-ba1e-0267ac7f62d3",
        "42a8dece-dbee-4127-b3d2-f259ed178ab5",
        "b2a9bbdb-635a-44a4-8e01-9c43ca025dd4",
        "3fc37c65-464e-4b39-8b00-acc28b0a7faf"
      ]
    },
    {
      "word": "시간",
      "count": 583,
      "books": 88,
      "quotes": [
        "b6920099-1d5a-444e-81c5-ed2914e8d32e",
        "cabf792b-7dbd-41cc-92b3-3d5dd3025960",
        "f0921373-3712-4af8-a4d3-86d860a442d2",
        "ef7146e6-35a7-4519-b8cc-074484504e60",
        "e7fed08a-9569-44b9-881c-a086f88ae0bd",
        "823ab203-27c3-473e-993a-f6c6e53abb79"
      ]
    },
    {
      "word": "감정",
      "count": 495,
      "books": 61,
      "quotes": [
        "0c1b0d71-497c-4a99-a460-1e94f2dea08b",
        "232da268-b1b3-4eca-a750-39a934b3baa0",
        "6ca277eb-4d6d-4f1d-8054-6692577028cf",
        "6ae9400f-77ed-4c61-9adc-fea42ad1afb2",
        "edb61adc-e308-4b04-b18f-4d9a1a6a9063",
        "18d04d70-308e-4f6c-bc54-2671fd6c3bb9"
      ]
    },
    {
      "word": "관계",
      "count": 335,
      "books": 67,
      "quotes": [
        "213cfd2d-0c04-4fe4-9084-2705aa8b3703",
        "0dbabec3-7bad-475d-96e2-56299991c44c",
        "a72eac03-9064-4f8e-8a2c-e05b5f23971a",
        "88135c64-72c2-4013-b97b-5b414ca220c9",
        "c488a481-b284-4d58-9324-99c53cf93712",
        "ad6145fc-64f0-47d7-bf54-f1fd1e6ee2b8"
      ]
    },
    {
      "word": "실패",
      "count": 275,
      "books": 49,
      "quotes": [
        "71f404e3-7344-4209-ab61-e34a3590f909",
        "2db35c88-6574-48f7-9c82-a7e56f47c025",
        "ac881bdf-2ab1-4caa-8cc9-1c55f2e7b840",
        "756633c0-5c65-47d2-a5f3-56f04b229472",
        "52e50147-e917-4b1f-bd4f-967f6567a924",
        "90b56a87-250c-4086-9cef-c4ab528cd41f"
      ]
    },
    {
      "word": "의미",
      "count": 268,
      "books": 73,
      "quotes": [
        "62c7db23-6ca2-4665-8110-1bf9b42a40db",
        "dd708327-844e-42ab-8b1a-cd2de48d37e5",
        "be174e99-582d-4a0b-9cb3-9415fcba7f14",
        "82d29d6f-be89-4a73-98fc-3c27c7974882",
        "a7f50a0a-3a26-4101-a20e-8d12745004bb",
        "2d989833-7459-4a1c-bd98-aac7650df29f"
      ]
    }
  ],
  "echoes": [
    {
      "keyword": "성공이 가장 위험해지는 순간",
      "note": "실패가 지워진 성공은 사람을 눈멀게 하고, 진짜 성공은 역경을 통과한 자리에만 남는다.",
      "a": "71f404e3-7344-4209-ab61-e34a3590f909",
      "b": "2db35c88-6574-48f7-9c82-a7e56f47c025"
    },
    {
      "keyword": "돈은 목적이 아니라 통로",
      "note": "사람이 원하는 건 돈이 아니라 돈으로 얻을 것인데, 그 수단에 삶을 통째로 넣으면 목적이 사라진다.",
      "a": "251aa51b-d12f-4b63-a38c-132a01edcb9b",
      "b": "42a8dece-dbee-4127-b3d2-f259ed178ab5"
    },
    {
      "keyword": "감정은 90초, 그다음은 행동",
      "note": "밀려온 감정의 화학반응은 곧 지나가므로, 남은 시간을 바꾸는 건 새로운 기분이 아니라 새로운 행동이다.",
      "a": "6ca277eb-4d6d-4f1d-8054-6692577028cf",
      "b": "232da268-b1b3-4eca-a750-39a934b3baa0"
    }
  ]
};
export default CURATION;
