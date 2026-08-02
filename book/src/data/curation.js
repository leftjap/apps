// 피드 큐레이션 스냅샷 — Claude Code Routine 주간 생성 (작업지시서 §4 "사전 생성 스냅샷").
// 앱은 이 스냅샷만 읽음. 재생성: 루틴이 신규+기존 어구록을 읽고 같은 단어·AI의 발견을 갱신 → 커밋·배포.
// 갱신: 2026-08-02 주간 큐레이션, 어구록 1021개 기준.
export const CURATION = {
  "generatedAt": "2026-08-02",
  "clusters": [
    {
      "word": "시간",
      "count": 570,
      "books": 84,
      "quotes": [
        "8b64f9fb-31c8-43d7-acc2-6747d0023d1e",
        "749c1523-7a75-4002-bd35-436f772677e4",
        "5f471e28-989f-4d99-8a98-e18a5f3ecfab",
        "887a4b8d-a214-47d2-958f-0635e0815bd9",
        "8ddf78f8-a5e8-42a9-b526-d9094b5a7d73",
        "ff2e98ab-019a-48f8-9000-7ae864e50b0b"
      ]
    },
    {
      "word": "행복",
      "count": 420,
      "books": 55,
      "quotes": [
        "76761520-031d-4f2b-a8e5-5161ddbf46d0",
        "5bafe9ee-e42b-4b6a-8ffb-29d0344cf674",
        "2b31060f-20fd-4542-8d47-5c38d1022d47",
        "bbce6ee0-52a2-47f5-82f3-f924d141645f",
        "40ddd6eb-edff-422f-a697-b1bc76d1793f",
        "70721832-fb9f-4d2b-9d09-21ec2e8c2ece"
      ]
    },
    {
      "word": "관계",
      "count": 304,
      "books": 61,
      "quotes": [
        "492e4d7d-cb3b-4517-a2d9-18235dffa74d",
        "869d8350-5241-497f-823b-d2407294d558",
        "8a6b18ae-f839-488e-8886-925a55320676",
        "d63cc525-a5eb-4088-abd6-5cfb7872d7bb",
        "6cdba7a2-1aed-4a58-a519-9e386005957d",
        "4929f225-2d94-4728-9f73-e4f086300652"
      ]
    },
    {
      "word": "선택",
      "count": 284,
      "books": 62,
      "quotes": [
        "3c5423a7-417f-4d75-8b2a-5f7ba4e0c90c",
        "0172ad1d-c6e2-4c3b-baa7-065dfda4faa2",
        "20b70ff1-c408-4014-8342-3be08462bc9b",
        "286efd98-367c-4afa-96c9-ccab14de1876",
        "826d6d80-4b0b-4b4c-a470-3d0ab0bcf005",
        "3191da77-c291-4de8-94df-d3467597bfcf"
      ]
    },
    {
      "word": "고통",
      "count": 263,
      "books": 47,
      "quotes": [
        "82daed39-fcd0-4567-978b-14a7fc501750",
        "c8f7c53d-166f-48e3-a300-47f14c1a6d03",
        "12d1b2cc-70ca-4b9f-9b57-144a7ad6109c",
        "55c5c8a2-6a75-4ddc-ae9a-34fc8f51f4cc",
        "8af12a19-cc42-4ea6-ad36-8e96b1a9f890",
        "f8a99790-d509-48cb-a907-54762946aacb"
      ]
    },
    {
      "word": "습관",
      "count": 115,
      "books": 43,
      "quotes": [
        "c3ed0df0-c482-4c32-8b63-3fa4155d3377",
        "59710cc8-69ca-4690-92c7-25201b9f4656",
        "77d03da0-9d44-4eaa-afd8-ca3f78671cac",
        "9671399f-cef4-4f92-b668-7752aadf99b5",
        "e0cda68c-09c0-450a-9485-853214f4cfb1",
        "d6e82936-0e65-4488-a0dd-80d8231d2d6b"
      ]
    }
  ],
  "echoes": [
    {
      "keyword": "고를 수 있는 건 고통의 종류뿐",
      "note": "쾌락에는 반드시 대가가 따르므로, 남는 질문은 고통을 피할지가 아니라 어떤 고통을 치를지다.",
      "a": "c8f7c53d-166f-48e3-a300-47f14c1a6d03",
      "b": "f8a99790-d509-48cb-a907-54762946aacb"
    },
    {
      "keyword": "사람이 통증의 원천이다",
      "note": "뇌가 소외를 상처와 같은 회로로 처리하기에, 가장 깊은 고통도 가장 큰 기쁨도 결국 사람에게서 온다.",
      "a": "8af12a19-cc42-4ea6-ad36-8e96b1a9f890",
      "b": "55c5c8a2-6a75-4ddc-ae9a-34fc8f51f4cc"
    },
    {
      "keyword": "자유는 선택지의 문제",
      "note": "선택지가 없으면 노예가 되고, 무엇을 포기할지 스스로 고를 수 있을 때 비로소 주인이 된다.",
      "a": "0172ad1d-c6e2-4c3b-baa7-065dfda4faa2",
      "b": "3c5423a7-417f-4d75-8b2a-5f7ba4e0c90c"
    }
  ]
};
export default CURATION;
