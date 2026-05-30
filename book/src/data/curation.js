// 피드 큐레이션 스냅샷 — Claude Code Routine 주간 생성 (작업지시서 §4 "사전 생성 스냅샷").
// 앱은 이 스냅샷만 읽음. 재생성: 루틴이 신규+기존 어구록을 읽고 같은 단어·AI의 발견을 갱신 → 커밋·배포.
// 초기 시드: 2026-05-30, 어구록 987개 기준. quote id 만 참조(본문은 앱 데이터에서 resolve).
export const CURATION = {
  "generatedAt": "2026-05-30",
  "clusters": [
    {
      "word": "돈",
      "count": 197,
      "books": 68,
      "quotes": [
        "0172ad1d-c6e2-4c3b-baa7-065dfda4faa2",
        "0178f092-c31d-428f-8baf-8ccbfbfa1181",
        "022c23d4-0aaa-448a-a7a2-bbbf638c2a4a",
        "03fca6fd-f2f4-47b0-a4fa-2ddbfaa74629",
        "040247ff-15a2-410d-995a-6052dc82692f",
        "0507247e-f3f4-41ac-9ea8-748334faf226"
      ]
    },
    {
      "word": "행복",
      "count": 144,
      "books": 55,
      "quotes": [
        "002173ff-e48c-4ac6-b54b-69ffc837a6ae",
        "030659ba-1a14-4e66-842d-fdce10df1b81",
        "03fca6fd-f2f4-47b0-a4fa-2ddbfaa74629",
        "0b016b24-51b6-4915-baab-642ca7e517f8",
        "0c47acb2-2664-4531-9563-00a780a96bda",
        "0df59d1a-441e-4213-a071-641dee3f2ca2"
      ]
    },
    {
      "word": "두려움",
      "count": 58,
      "books": 35,
      "quotes": [
        "00305ac5-57cf-45a8-9057-ef718bf693ca",
        "0d159a54-8342-4562-8788-94e0abd6c8fa",
        "0f0a2f82-0f4a-4f09-a8ea-9178f7188d1f",
        "1414a5fd-f8b3-4182-a906-622b47564360",
        "165bc1eb-55dc-488a-b6bb-e6ed247edb4c",
        "1cc69bfc-f94b-4ce2-a22c-9fc130552ec2"
      ]
    },
    {
      "word": "습관",
      "count": 74,
      "books": 42,
      "quotes": [
        "0507247e-f3f4-41ac-9ea8-748334faf226",
        "061fd147-5515-4bfc-a9ec-bfbe70d288dc",
        "070899dd-c131-4f5b-a2a9-3356f5760e1c",
        "0bae9b1c-637b-4322-8eea-de8c32611699",
        "1acc375b-5dad-4e48-993a-ed4b913ec08d",
        "1d72feb7-e6fb-4e87-b002-b0572ae3438f"
      ]
    },
    {
      "word": "선택",
      "count": 139,
      "books": 61,
      "quotes": [
        "0172ad1d-c6e2-4c3b-baa7-065dfda4faa2",
        "022c23d4-0aaa-448a-a7a2-bbbf638c2a4a",
        "030659ba-1a14-4e66-842d-fdce10df1b81",
        "031408da-0d5d-4ee4-ba41-7aa3384484fe",
        "040247ff-15a2-410d-995a-6052dc82692f",
        "0507247e-f3f4-41ac-9ea8-748334faf226"
      ]
    },
    {
      "word": "인생",
      "count": 140,
      "books": 53,
      "quotes": [
        "04eb41cc-02d7-4a90-80e0-751c2ebd5a8b",
        "0aff2925-9cfc-42e3-bfef-8b4ecfac0be8",
        "0f0a2f82-0f4a-4f09-a8ea-9178f7188d1f",
        "10a8df0c-cbba-4632-ab90-3168f6f0d99e",
        "10d47b1a-d608-4352-9029-cdc30c74b823",
        "114c0573-445c-468d-a5c2-89fa6a1aa8cd"
      ]
    }
  ],
  "echoes": [
    {
      "keyword": "불확실",
      "note": "확실함을 좇는 대신 불확실을 견디라 — 두 책이 완벽주의의 반대편에서 만납니다.",
      "a": "04eb41cc-02d7-4a90-80e0-751c2ebd5a8b",
      "b": "061fd147-5515-4bfc-a9ec-bfbe70d288dc"
    },
    {
      "keyword": "부",
      "note": "부는 수익률이 아니라 저축과 평정심에서 온다 — 두 책이 같은 결론에 닿습니다.",
      "a": "2be63369-9806-48c8-b1c6-69a1227e0b30",
      "b": "6f95876e-c829-4751-a260-89be93ef1828"
    },
    {
      "keyword": "감정",
      "note": "부정적 감정과 실패를 신호로 받아들이라 — 두 책이 회복의 같은 원리를 말합니다.",
      "a": "00305ac5-57cf-45a8-9057-ef718bf693ca",
      "b": "0d159a54-8342-4562-8788-94e0abd6c8fa"
    }
  ]
};
export default CURATION;
