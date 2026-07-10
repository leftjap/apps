// 광고·핫딜·포인트글 판정 (소프트 플래그 — 하드 삭제 안 함, 리더가 항상 제외).
//
// 1차: 뽐뿌는 이슈링크 go ID 앞 4자리가 원문 게시판을 인코딩한다 (2026-07-11 리다이렉트 22종 전수 실측).
//      제목 패턴보다 견고하다 — "[G마켓] 스낵면 40입" 처럼 접두사가 무한히 변주되기 때문.
// 2차: 게시판을 모르는 사이트는 제목 접두사·포인트글 문구로 판정. 완전하지 않다 — 수집 데이터로 계속 튜닝.

const PPOMPPU_BOARDS = {
  1070: 'baby', 1145: 'tour', 1540: 'drama', 1598: 'phone', 1633: 'nasol',
  1642: 'house', 1670: 'money', 1679: 'humor', 2219: 'soccer', 2335: 'coupon',
  2929: 'rescene', 2974: 'problem', 3156: 'ppomppu', 3478: 'pmarket8', 3604: 'ppomppu8',
  3733: 'baseball', 4684: 'freeboard', 4919: 'gameforum', 5740: 'daily_life',
  6350: 'car', 6410: 'cat', 8297: 'youtube_info',
}

// 핫딜·포인트·장터. 장터는 robots 도 금지 (Disallow: /zboard/view.php?id=market*)
export const PPOMPPU_AD_BOARDS = Object.freeze(['ppomppu', 'ppomppu8', 'coupon', 'pmarket8'])

export const ppomppuBoard = (goId) => PPOMPPU_BOARDS[goId.slice(0, 4)] ?? null

const AD_TITLE_RE = /^(?:\[?AD\b|\[(?:쿠팡|쿠폰|네이버페이|네페|G마켓|지마켓|11번가|옥션|토스|카카오)|핫딜|무료나눔|아직 엄카)/
const POINT_RE = /\d+원.*받으세요|받으세요.*\d+원/ // [란123] 네이버페이 59원 … 받으세요

export function isAd(title, { site, goId } = {}) {
  if (site === 'ppomppu' && goId && PPOMPPU_AD_BOARDS.includes(ppomppuBoard(goId))) return true
  const t = title.trim()
  // 일반 판에도 포인트글이 올라온다 (자유게시판의 "[란123] … 받으세요" 실측) → 제목 판정을 건너뛰지 않는다.
  // 단 광고 판이 아닌 뽐뿌 일반 판에서는 "[G마켓]" 류 접두사가 정상 글 제목일 수 있어 포인트글 규칙만 적용.
  if (site === 'ppomppu' && goId && ppomppuBoard(goId)) return POINT_RE.test(t)
  return AD_TITLE_RE.test(t) || POINT_RE.test(t)
}
