// 피드 큐레이션 스냅샷 — Claude Code Routine 주간 생성 (작업지시서 §4 "사전 생성 스냅샷").
// 앱은 이 스냅샷만 읽음. 재생성: 루틴이 신규+기존 어구록을 읽고 같은 단어·AI의 발견을 갱신 → 커밋·배포.
// 갱신: 2026-05-31 시뮬 테스트, 어구록 987개 기준.
export const CURATION = {
  "generatedAt": "2026-05-31",
  "clusters": [
    {
      "word": "시간",
      "count": 265,
      "books": 83,
      "quotes": [
        "d12d7f1a-cc63-45f9-a2e6-f7131faf9d92",
        "b17b5249-6969-4b06-8e6e-3b0dbc176e05",
        "a19b399e-198e-43bf-bb79-ef350bf7d338",
        "6d4e0d6b-4652-4501-a0e0-73f9cdf68839",
        "5869eec1-2f5d-4194-98fc-ea78ff98b551",
        "d07e7a5f-88fe-4c19-ae72-6478a570f6b5"
      ]
    },
    {
      "word": "마음",
      "count": 219,
      "books": 79,
      "quotes": [
        "915957fb-2d3f-43c5-9456-449aeda115d1",
        "bd26207c-202f-445e-b183-a9f32778251b",
        "6d4e0d6b-4652-4501-a0e0-73f9cdf68839",
        "030659ba-1a14-4e66-842d-fdce10df1b81",
        "ffe40e69-8bf2-4b74-81c4-d89633bb178f",
        "e2f095f0-29e0-432c-9b5d-7e10c52e2f06"
      ]
    },
    {
      "word": "돈",
      "count": 197,
      "books": 68,
      "quotes": [
        "915957fb-2d3f-43c5-9456-449aeda115d1",
        "bd26207c-202f-445e-b183-a9f32778251b",
        "56ee2817-670f-48fd-b893-ec82885dd5e0",
        "6de704bb-6ebe-4915-9664-e4393ad3f569",
        "e2f095f0-29e0-432c-9b5d-7e10c52e2f06",
        "a73d4037-e97a-4971-9ebc-fb0d71499547"
      ]
    },
    {
      "word": "감정",
      "count": 171,
      "books": 58,
      "quotes": [
        "c8f7c53d-166f-48e3-a300-47f14c1a6d03",
        "bdd3d7f6-7d01-417f-8ce1-a096316a870c",
        "8c9ca986-0b7a-4894-96e6-bc351a35523a",
        "38e47964-b432-4b8d-a64a-07a10ba2d0b1",
        "a1eeb7b4-2e41-4ac2-bc14-f8df71154e9d",
        "818e8fec-8507-45bf-9f53-87c52ca554a6"
      ]
    },
    {
      "word": "성공",
      "count": 167,
      "books": 60,
      "quotes": [
        "46aa860f-fa12-4412-9494-89551bd8391b",
        "fc489c8d-43f4-4db1-b375-3de9f38aecc9",
        "09043298-d598-4af1-8249-fc7a3d262cd1",
        "3d694a40-25c7-4ace-8a43-81c237573134",
        "d23d6529-f2c8-4006-97e8-ba721560cf32",
        "b1e708ba-c2ce-4d89-a973-81d34a17f4c1"
      ]
    },
    {
      "word": "노력",
      "count": 160,
      "books": 70,
      "quotes": [
        "2a6f55f5-c0e0-4068-8c31-6ed49f3f7728",
        "6a0c2ce3-651c-44e7-ad3a-42d2f3ff7c9f",
        "960c08cf-ee51-4a3a-bf4a-9ad355292977",
        "822559f0-5ff6-4c77-b9f9-625277d7b862",
        "8bad7f5d-db3e-4ec7-a7dd-3e9d2e3cfcd6",
        "e2f095f0-29e0-432c-9b5d-7e10c52e2f06"
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
