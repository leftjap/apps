// 피드 큐레이션 스냅샷 — Claude Code Routine 주간 생성 (작업지시서 §4 "사전 생성 스냅샷").
// 앱은 이 스냅샷만 읽음. 재생성: 루틴이 신규+기존 어구록을 읽고 같은 단어·AI의 발견을 갱신 → 커밋·배포.
// 갱신: 2026-07-12 주간 큐레이션, 어구록 1000개 기준.
export const CURATION = {
  "generatedAt": "2026-07-12",
  "clusters": [
    {
      "word": "감정",
      "count": 464,
      "books": 58,
      "quotes": [
        "42e4277c-ca33-4696-b074-7d9286b68145",
        "20f664eb-f55a-4700-8fe4-19806cf6c417",
        "8c9ca986-0b7a-4894-96e6-bc351a35523a",
        "8c953510-2fd0-4d43-b2c1-0372598632ce",
        "856f9b1f-36d2-444c-9748-7f5b641486c7",
        "ef5e7a8e-6db9-4c5a-8f65-3b4f05cb335d"
      ]
    },
    {
      "word": "관계",
      "count": 297,
      "books": 59,
      "quotes": [
        "d08048bf-092c-4083-9565-fed13f156a03",
        "492e4d7d-cb3b-4517-a2d9-18235dffa74d",
        "869d8350-5241-497f-823b-d2407294d558",
        "94cfcf22-b969-4fb3-bf97-d4f20d312938",
        "638ab69d-69db-4eaf-81ae-5870b59b8d68",
        "0a7255a9-8047-4deb-8e7f-b0eebef3d059"
      ]
    },
    {
      "word": "습관",
      "count": 114,
      "books": 43,
      "quotes": [
        "59710cc8-69ca-4690-92c7-25201b9f4656",
        "a03c10e9-497a-47d8-ba00-786f424ce7fe",
        "c3ed0df0-c482-4c32-8b63-3fa4155d3377",
        "d07e7a5f-88fe-4c19-ae72-6478a570f6b5",
        "f2d2cc1b-f55d-45d2-8c31-7f27fcf7074a",
        "061fd147-5515-4bfc-a9ec-bfbe70d288dc"
      ]
    },
    {
      "word": "두려움",
      "count": 110,
      "books": 34,
      "quotes": [
        "8b83c1e6-e44c-4499-a35a-fb1753e65d63",
        "3ef90144-b147-4988-b722-ac05e43d011e",
        "1cc69bfc-f94b-4ce2-a22c-9fc130552ec2",
        "d8e32334-988b-40ec-b9c9-b1df2d707367",
        "1ea819b9-446c-4c7a-ba61-80cdc28728e3",
        "165bc1eb-55dc-488a-b6bb-e6ed247edb4c"
      ]
    },
    {
      "word": "변화",
      "count": 283,
      "books": 59,
      "quotes": [
        "8d79ae95-fd49-47ee-b04f-ef6bb879b2b0",
        "a93bf0ac-a4b9-4621-8b31-e5ae4db4be70",
        "2b31060f-20fd-4542-8d47-5c38d1022d47",
        "99bf57ed-ee8c-432f-b924-d8ce541dc9fd",
        "85f47759-03ee-4290-aa35-0ea979e6b372",
        "a1eeb7b4-2e41-4ac2-bc14-f8df71154e9d"
      ]
    },
    {
      "word": "성장",
      "count": 113,
      "books": 35,
      "quotes": [
        "9a538986-8f87-4102-9b58-dbbfd14ae480",
        "dd5cd0e9-b9c7-4dc6-b7cc-21f26ce98e91",
        "0fb005a4-347b-46b4-a49f-2a5479be9d78",
        "9169c838-ad9d-4836-b5b2-df4b98126f72",
        "6cdba7a2-1aed-4a58-a519-9e386005957d",
        "36730583-3c36-445a-9539-6423d4fdb3ca"
      ]
    }
  ],
  "echoes": [
    {
      "keyword": "감정과 판단",
      "note": "한 책은 감정을 이성으로 길들이라 하고, 다른 책은 감정을 잃으면 결정하는 능력까지 잃는다 하니 — 이성과 감정의 자리를 두고 두 책이 마주 선다.",
      "a": "20f664eb-f55a-4700-8fe4-19806cf6c417",
      "b": "8c953510-2fd0-4d43-b2c1-0372598632ce"
    },
    {
      "keyword": "작음의 힘",
      "note": "큰 도약은 거창한 결단이 아니라 사소한 한 걸음의 누적에서 온다는 데서 두 책이 만난다.",
      "a": "a93bf0ac-a4b9-4621-8b31-e5ae4db4be70",
      "b": "3d241c8c-495b-4273-b8db-ef60e0f31c87"
    },
    {
      "keyword": "두려움을 다시 보다",
      "note": "실패와 두려움을 결함이 아니라 통과할 과정으로 바라볼 때 비로소 앞으로 나아갈 수 있다는 태도에서 두 책이 공명한다.",
      "a": "9db7188c-a022-4783-8e9b-9f388b3438be",
      "b": "1cc69bfc-f94b-4ce2-a22c-9fc130552ec2"
    }
  ]
};
export default CURATION;
