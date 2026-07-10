const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

// 목록 HTML 의 제목은 엔티티로 인코딩돼 온다 (루리웹 &apos; 등 실측)
export const decodeEntities = (s) =>
  s.replace(/&(#(\d+)|#x([0-9a-f]+)|[a-z]+);/gi, (m, _n, dec, hex) => {
    if (dec) return String.fromCharCode(Number(dec))
    if (hex) return String.fromCharCode(parseInt(hex, 16))
    return ENTITIES[m.slice(1, -1).toLowerCase()] ?? m
  })

export const stripTags = (s) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
